from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import json_array, reviews, warehouse
from .models import ReviewCreate
from .settings import settings


app = FastAPI(title="CareProof India", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=800)

CAPABILITIES = [
    {"code": "ICU", "label": "ICU"},
    {"code": "NICU", "label": "NICU"},
    {"code": "EMERGENCY", "label": "Emergency"},
    {"code": "MATERNITY", "label": "Maternity"},
    {"code": "ONCOLOGY", "label": "Oncology"},
    {"code": "TRAUMA", "label": "Trauma"},
]
CAPABILITY_CODES = {item["code"] for item in CAPABILITIES}
TRUST_TIERS = {"ALL", "STRONG", "MODERATE", "WEAK", "INSUFFICIENT", "NEEDS_REVIEW"}


def checked_capability(value: str) -> str:
    capability = value.upper()
    if capability not in CAPABILITY_CODES:
        raise HTTPException(status_code=422, detail="Unsupported capability")
    return capability


def checked_tier(value: str) -> str:
    tier = value.upper()
    if tier not in TRUST_TIERS:
        raise HTTPException(status_code=422, detail="Unsupported evidence tier")
    return tier


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "careproof"}


@app.get("/api/filters")
def filters() -> dict[str, Any]:
    return _filters_data()


@lru_cache(maxsize=1)
def _filters_data() -> dict[str, Any]:
    rows = warehouse.query(f"SELECT DISTINCT canonical_state AS state FROM {settings.facility_table} WHERE canonical_state IS NOT NULL ORDER BY 1")
    return {"capabilities": CAPABILITIES, "states": [row["state"] for row in rows]}


@app.get("/api/summary")
def summary(capability: str = "ICU", state: str = "ALL") -> dict[str, int]:
    capability = checked_capability(capability)
    rows = _summary_data(capability, state)
    return {**rows, "reviewed": reviews.count()}


@lru_cache(maxsize=128)
def _summary_data(capability: str, state: str) -> dict[str, int]:
    rows = warehouse.query(
        f"""
        SELECT
          COUNT(*) total,
          COUNT_IF(tier='STRONG') strong,
          COUNT_IF(tier='MODERATE') moderate,
          COUNT_IF(tier='WEAK') weak,
          COUNT_IF(tier='INSUFFICIENT') insufficient,
          COUNT_IF(tier='NEEDS_REVIEW') needs_review,
          COUNT_IF(location_confidence IN ('PIN_FALLBACK','UNKNOWN')) location_issues
        FROM {settings.trust_table}
        WHERE capability=:capability AND (:state='ALL' OR canonical_state=:state)
        """,
        {"capability": capability, "state": state},
    )[0]
    return {key: int(value or 0) for key, value in rows.items()}


@app.get("/api/facilities")
def facilities(
    capability: str = "ICU",
    state: str = "ALL",
    tier: str = "ALL",
    q: str = Query(default="", max_length=100),
) -> list[dict[str, Any]]:
    return _facility_rows(checked_capability(capability), state, checked_tier(tier), q.strip())


@lru_cache(maxsize=256)
def _facility_rows(capability: str, state: str, tier: str, query: str) -> list[dict[str, Any]]:
    rows = warehouse.query(
        f"""
        SELECT facility_id, name, city, canonical_state AS state, canonical_district AS district,
               capability, claimed, evidence_strength, tier, facet_count, source_domain_count,
               location_confidence, canonical_latitude AS latitude, canonical_longitude AS longitude, flags
        FROM {settings.trust_table}
        WHERE capability=:capability
          AND (:state='ALL' OR canonical_state=:state)
          AND (:tier='ALL' OR tier=:tier)
          AND (:query='' OR LOWER(CONCAT_WS(' ',name,city,canonical_district)) LIKE CONCAT('%',LOWER(:query),'%'))
        ORDER BY CASE tier WHEN 'STRONG' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'WEAK' THEN 3 WHEN 'INSUFFICIENT' THEN 4 ELSE 5 END,
                 evidence_strength DESC, name
        LIMIT 100
        """,
        {"capability": capability, "state": state, "tier": tier, "query": query},
    )
    for row in rows:
        row["flags"] = json_array(row.get("flags"))
        row["claimed"] = bool(row.get("claimed"))
    return rows


@app.get("/api/map-points")
def map_points(capability: str = "ICU", state: str = "ALL") -> list[dict[str, Any]]:
    return _map_points(checked_capability(capability), state)


@lru_cache(maxsize=128)
def _map_points(capability: str, state: str) -> list[dict[str, Any]]:
    rows = warehouse.query(
        f"""
        WITH ranked AS (
          SELECT facility_id, name, city, canonical_state AS state,
                 canonical_district AS district, evidence_strength, tier,
                 location_confidence, canonical_latitude AS latitude,
                 canonical_longitude AS longitude,
                 ROW_NUMBER() OVER (PARTITION BY tier ORDER BY XXHASH64(facility_id)) AS sample_rank
          FROM {settings.trust_table}
          WHERE capability=:capability
            AND (:state='ALL' OR canonical_state=:state)
            AND canonical_latitude BETWEEN 6 AND 38.6
            AND canonical_longitude BETWEEN 68 AND 98
        )
        SELECT facility_id, name, city, state, district, evidence_strength, tier,
               location_confidence, latitude, longitude
        FROM ranked
        WHERE sample_rank <= 260
        ORDER BY CASE tier WHEN 'STRONG' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'WEAK' THEN 3
                           WHEN 'NEEDS_REVIEW' THEN 4 ELSE 5 END,
                 evidence_strength DESC
        LIMIT 1200
        """,
        {"capability": capability, "state": state},
    )
    return rows


@app.get("/api/regions")
def regions(capability: str = "ICU", state: str = "ALL") -> list[dict[str, Any]]:
    return _region_rows(checked_capability(capability), state)


@lru_cache(maxsize=128)
def _region_rows(capability: str, state: str) -> list[dict[str, Any]]:
    rows = warehouse.query(
        f"""
        SELECT canonical_state AS state, canonical_district AS district,
               assessed_facilities AS facilities, strong, moderate, weak,
               insufficient, needs_review, location_issues,
               mean_evidence_strength,
               assessed_facilities - strong - moderate AS evidence_gap,
               ROUND(100.0 * (strong + moderate) / NULLIF(assessed_facilities, 0), 1) AS reliable_share
        FROM {settings.region_table}
        WHERE capability=:capability
          AND (:state='ALL' OR canonical_state=:state)
          AND canonical_district IS NOT NULL
          AND assessed_facilities >= 5
        ORDER BY evidence_gap DESC, reliable_share ASC
        LIMIT 10
        """,
        {"capability": capability, "state": state},
    )
    return rows


@app.get("/api/capability-benchmark")
def capability_benchmark(state: str = "ALL") -> list[dict[str, Any]]:
    return _capability_benchmark(state)


@lru_cache(maxsize=32)
def _capability_benchmark(state: str) -> list[dict[str, Any]]:
    rows = warehouse.query(
        f"""
        SELECT capability,
               COUNT(*) AS total,
               COUNT_IF(tier IN ('STRONG','MODERATE')) AS defensible,
               COUNT_IF(tier NOT IN ('STRONG','MODERATE')) AS evidence_gap,
               ROUND(100.0 * COUNT_IF(tier IN ('STRONG','MODERATE')) / NULLIF(COUNT(*), 0), 1) AS defensible_share,
               ROUND(AVG(evidence_strength), 1) AS mean_score
        FROM {settings.trust_table}
        WHERE (:state='ALL' OR canonical_state=:state)
        GROUP BY capability
        ORDER BY CASE capability
          WHEN 'ICU' THEN 1 WHEN 'NICU' THEN 2 WHEN 'EMERGENCY' THEN 3
          WHEN 'MATERNITY' THEN 4 WHEN 'ONCOLOGY' THEN 5 ELSE 6 END
        """,
        {"state": state},
    )
    return rows


@app.get("/api/resolve-location")
def resolve_location(q: str = Query(min_length=2, max_length=80)) -> dict[str, Any]:
    query = q.strip()
    if query.isdigit():
        rows = warehouse.query(
            f"""
            SELECT CAST(pincode AS STRING) AS label, canonical_state AS state,
                   canonical_district AS district, AVG(canonical_latitude) AS latitude,
                   AVG(canonical_longitude) AS longitude, COUNT(*) AS matched_facilities
            FROM {settings.facility_table}
            WHERE pincode=:pincode
              AND canonical_latitude IS NOT NULL AND canonical_longitude IS NOT NULL
            GROUP BY pincode, canonical_state, canonical_district
            ORDER BY matched_facilities DESC LIMIT 1
            """,
            {"pincode": int(query)},
        )
    else:
        rows = warehouse.query(
            f"""
            SELECT COALESCE(city, canonical_district) AS label, canonical_state AS state,
                   canonical_district AS district, AVG(canonical_latitude) AS latitude,
                   AVG(canonical_longitude) AS longitude, COUNT(*) AS matched_facilities
            FROM {settings.facility_table}
            WHERE canonical_latitude IS NOT NULL AND canonical_longitude IS NOT NULL
              AND (LOWER(city)=LOWER(:query) OR LOWER(canonical_district)=LOWER(:query)
                   OR LOWER(city) LIKE CONCAT(LOWER(:query), '%')
                   OR LOWER(canonical_district) LIKE CONCAT(LOWER(:query), '%'))
            GROUP BY city, canonical_state, canonical_district
            ORDER BY CASE WHEN LOWER(city)=LOWER(:query) OR LOWER(canonical_district)=LOWER(:query) THEN 0 ELSE 1 END,
                     matched_facilities DESC
            LIMIT 1
            """,
            {"query": query},
        )
    if not rows:
        raise HTTPException(status_code=404, detail="No mapped PIN, city or district matched that search")
    row = rows[0]
    row["matched_facilities"] = int(row.get("matched_facilities") or 0)
    return row


@app.get("/api/nearest")
def nearest_facilities(
    capability: str = "ICU",
    latitude: float = Query(ge=6, le=38.6),
    longitude: float = Query(ge=68, le=98),
) -> list[dict[str, Any]]:
    capability = checked_capability(capability)
    rows = warehouse.query(
        f"""
        WITH distances AS (
          SELECT facility_id, name, city, canonical_state AS state,
                 canonical_district AS district, capability, evidence_strength, tier,
                 facet_count, source_domain_count, location_confidence,
                 canonical_latitude AS latitude, canonical_longitude AS longitude, flags,
                 6371 * 2 * ASIN(SQRT(
                   POWER(SIN(RADIANS(canonical_latitude - :latitude) / 2), 2)
                   + COS(RADIANS(:latitude)) * COS(RADIANS(canonical_latitude))
                   * POWER(SIN(RADIANS(canonical_longitude - :longitude) / 2), 2)
                 )) AS distance_km_raw
          FROM {settings.trust_table}
          WHERE capability=:capability
            AND canonical_latitude BETWEEN 6 AND 38.6
            AND canonical_longitude BETWEEN 68 AND 98
        )
        SELECT facility_id, name, city, state, district, capability,
               evidence_strength, tier, facet_count, source_domain_count,
               location_confidence, latitude, longitude, flags,
               ROUND(distance_km_raw, 1) AS distance_km
        FROM distances
        ORDER BY distance_km_raw ASC, evidence_strength DESC
        LIMIT 8
        """,
        {"capability": capability, "latitude": latitude, "longitude": longitude},
    )
    for row in rows:
        row["flags"] = json_array(row.get("flags"))
    return rows


@app.get("/api/facilities/{facility_id}")
def facility_detail(facility_id: str, capability: str = "ICU") -> dict[str, Any]:
    capability = checked_capability(capability)
    row = dict(_facility_detail_data(facility_id, capability))
    row["last_review"] = reviews.latest(facility_id, capability)
    return row


@lru_cache(maxsize=512)
def _facility_detail_data(facility_id: str, capability: str) -> dict[str, Any]:
    rows = warehouse.query(
        f"""
        SELECT t.facility_id, t.name, t.city,
               t.canonical_state AS state, t.canonical_district AS district,
               t.capability, t.claimed, t.evidence_strength, t.tier,
               t.facet_count, t.source_domain_count, t.location_confidence,
               t.canonical_latitude AS latitude, t.canonical_longitude AS longitude,
               t.flags, t.component_direct, t.component_equipment, t.component_staff,
               t.component_capacity, t.component_procedure, t.component_sources,
               f.pincode, f.address, f.description, f.capacity, f.number_doctors, f.source_urls
        FROM {settings.trust_table} t
        JOIN {settings.facility_table} f USING (facility_id)
        WHERE t.facility_id=:facility_id AND t.capability=:capability
        LIMIT 1
        """,
        {"facility_id": facility_id, "capability": capability},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Facility assessment not found")
    row = rows[0]
    evidence_rows = _evidence_receipts(facility_id, capability)
    row["flags"] = json_array(row.get("flags"))
    row["source_urls"] = json_array(row.get("source_urls"))
    row["claimed"] = bool(row.get("claimed"))
    row["evidence"] = evidence_rows
    row["gaps"] = _evidence_gaps(row)
    return row


def _evidence_receipts(facility_id: str, capability: str) -> list[dict[str, Any]]:
    return warehouse.query(
        f"""
        SELECT evidence_type, source_field, quote, supports
        FROM {settings.evidence_table}
        WHERE facility_id=:facility_id AND capability=:capability AND supports=true
        ORDER BY evidence_order
        LIMIT 12
        """,
        {"facility_id": facility_id, "capability": capability},
    )


def _evidence_gaps(row: dict[str, Any]) -> list[str]:
    gaps = []
    if not row.get("component_direct"): gaps.append("No direct facility-attributed sentence confirms this capability.")
    if not row.get("component_equipment"): gaps.append("No capability-specific equipment was found in the available fields.")
    if not row.get("component_staff"): gaps.append("No relevant specialist or staffing evidence was found.")
    if not row.get("component_capacity"): gaps.append("Capacity or bed evidence is missing or unusable.")
    if row.get("source_domain_count", 0) < 2: gaps.append("The available evidence lacks independent source diversity.")
    return gaps


@app.post("/api/reviews", status_code=201)
def create_review(payload: ReviewCreate, request: Request) -> dict[str, Any]:
    checked_capability(payload.capability)
    reviewer = request.headers.get("x-forwarded-email") or request.headers.get("x-forwarded-preferred-username") or "local-reviewer"
    return reviews.create({**payload.model_dump(), "reviewer_email": reviewer})


@app.get("/api/data-health")
def data_health() -> dict[str, Any]:
    return _data_health()


@lru_cache(maxsize=1)
def _data_health() -> dict[str, Any]:
    rows = warehouse.query(
        f"""
        WITH profile AS (
          SELECT COUNT(*) AS unique_facilities,
                 COUNT(DISTINCT raw_state) AS raw_state_values,
                 COUNT_IF(ARRAY_CONTAINS(quality_flags, 'COORDINATE_PIN_CONFLICT')) AS coordinate_conflicts,
                 ROUND(100.0 * COUNT_IF(pin_latitude IS NOT NULL) / COUNT(*), 1) AS pin_join_rate,
                 ROUND(100.0 * COUNT_IF(location_confidence IN ('VERIFIED','PLAUSIBLE')) / COUNT(*), 1) AS verified_location_rate,
                 ROUND(100.0 * COUNT_IF(NULLIF(TRIM(description), '') IS NOT NULL) / COUNT(*), 1) AS description_coverage,
                 ROUND(100.0 * COUNT_IF(SIZE(capability_items) > 0) / COUNT(*), 1) AS capability_coverage,
                 ROUND(100.0 * COUNT_IF(SIZE(procedure_items) > 0) / COUNT(*), 1) AS procedure_coverage,
                 ROUND(100.0 * COUNT_IF(SIZE(equipment_items) > 0) / COUNT(*), 1) AS equipment_coverage,
                 ROUND(100.0 * COUNT_IF(number_doctors IS NOT NULL) / COUNT(*), 1) AS doctor_coverage,
                 ROUND(100.0 * COUNT_IF(capacity IS NOT NULL) / COUNT(*), 1) AS capacity_coverage
          FROM {settings.facility_table}
        ), capability AS (
          SELECT capability, COUNT_IF(claimed) AS claimed, COUNT_IF(facet_count>=2) AS supported
          FROM {settings.trust_table}
          GROUP BY capability
        )
        SELECT c.*, p.* FROM capability c CROSS JOIN profile p ORDER BY c.capability
        """
    )
    profile = rows[0]
    capability_rows = [{"capability": row["capability"], "claimed": row["claimed"], "supported": row["supported"]} for row in rows]
    return {
        "total_records": 10088,
        "unique_facilities": int(profile["unique_facilities"] or 0),
        "raw_state_values": int(profile["raw_state_values"] or 0),
        "coordinate_conflicts": int(profile["coordinate_conflicts"] or 0),
        "pin_join_rate": float(profile["pin_join_rate"] or 0),
        "verified_location_rate": float(profile["verified_location_rate"] or 0),
        "coverage": [
            {"field": "Description", "value": float(profile["description_coverage"] or 0)},
            {"field": "Capability", "value": float(profile["capability_coverage"] or 0)},
            {"field": "Procedure", "value": float(profile["procedure_coverage"] or 0)},
            {"field": "Equipment", "value": float(profile["equipment_coverage"] or 0)},
            {"field": "Doctor count", "value": float(profile["doctor_coverage"] or 0)},
            {"field": "Capacity", "value": float(profile["capacity_coverage"] or 0)},
        ],
        "capability_evidence": capability_rows,
    }


dist = Path(__file__).resolve().parents[1] / "dist"
if dist.exists():
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        target = dist / full_path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(dist / "index.html")
