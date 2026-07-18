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
    return _facility_rows(capability, state, tier, q.strip())


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


@app.get("/api/facilities/{facility_id}")
def facility_detail(facility_id: str, capability: str = "ICU") -> dict[str, Any]:
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
               f.address, f.description, f.capacity, f.number_doctors, f.source_urls
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
    reviewer = request.headers.get("x-forwarded-email") or request.headers.get("x-forwarded-preferred-username") or "local-reviewer"
    return reviews.create({**payload.model_dump(), "reviewer_email": reviewer})


@app.get("/api/data-health")
def data_health() -> dict[str, Any]:
    return _data_health()


@lru_cache(maxsize=1)
def _data_health() -> dict[str, Any]:
    capability_rows = warehouse.query(
        f"""
        SELECT capability, COUNT_IF(claimed) claimed, COUNT_IF(facet_count>=2) supported
        FROM {settings.trust_table}
        GROUP BY capability ORDER BY capability
        """
    )
    return {
        "total_records": 10088,
        "unique_facilities": 10077,
        "raw_state_values": 254,
        "coordinate_conflicts": 1354,
        "pin_join_rate": 94.8,
        "nfhs_join_rate": 61.9,
        "coverage": [
            {"field": "Description", "value": 99.2},
            {"field": "Capability", "value": 98.6},
            {"field": "Procedure", "value": 91.4},
            {"field": "Equipment", "value": 76.2},
            {"field": "Doctor count", "value": 36.0},
            {"field": "Capacity", "value": 25.0},
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
