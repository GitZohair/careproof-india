from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.main import (  # noqa: E402
    CAPABILITIES,
    _capability_benchmark,
    _data_health,
    _facility_detail_data,
    _facility_rows,
    _map_points,
    _region_rows,
    _summary_data,
    nearest_facilities,
    resolve_location,
)


PLACES = ("Jaipur", "Pune", "Lucknow")
DEMO_STATES = (
    "Andhra Pradesh",
    "Gujarat",
    "Haryana",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Uttar Pradesh",
    "West Bengal",
)


def json_default(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Unsupported value: {type(value)!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the anonymous CareProof judge-demo snapshot")
    parser.add_argument("--output", default="public/demo-snapshot.json")
    args = parser.parse_args()

    locations: dict[str, dict[str, Any]] = {}
    for place in PLACES:
        locations[place.lower()] = resolve_location(place)

    summaries: dict[str, dict[str, Any]] = {}
    facilities: dict[str, list[dict[str, Any]]] = {}
    map_points: dict[str, list[dict[str, Any]]] = {}
    regions: dict[str, list[dict[str, Any]]] = {}
    state_summaries: dict[str, dict[str, dict[str, Any]]] = {}
    state_regions: dict[str, dict[str, list[dict[str, Any]]]] = {}
    nearest: dict[str, dict[str, list[dict[str, Any]]]] = {}
    detail_pairs: set[tuple[str, str]] = set()

    for item in CAPABILITIES:
        capability = item["code"]
        summaries[capability] = {**_summary_data(capability, "ALL"), "reviewed": 0}
        facilities[capability] = _facility_rows(capability, "ALL", "ALL", "")
        map_points[capability] = _map_points(capability, "ALL")
        regions[capability] = _region_rows(capability, "ALL")
        state_summaries[capability] = {}
        state_regions[capability] = {}
        for state in DEMO_STATES:
            state_summaries[capability][state] = {**_summary_data(capability, state), "reviewed": 0}
            state_regions[capability][state] = _region_rows(capability, state)
        nearest[capability] = {}
        if facilities[capability]:
            detail_pairs.add((capability, facilities[capability][0]["facility_id"]))
        for place, location in locations.items():
            rows = nearest_facilities(capability, float(location["latitude"]), float(location["longitude"]))
            nearest[capability][place] = rows
            if capability == "ICU" and place == "jaipur":
                detail_pairs.update((capability, row["facility_id"]) for row in rows[:8])

    details: dict[str, dict[str, Any]] = {}
    for capability, facility_id in sorted(detail_pairs):
        detail = dict(_facility_detail_data(facility_id, capability))
        detail["last_review"] = None
        details[f"{capability}::{facility_id}"] = detail

    evaluation_path = ROOT / "server" / "evaluation_latest.json"
    if not evaluation_path.exists():
        raise SystemExit("Run scripts/evaluate_trust_layer.py before building the demo snapshot")

    snapshot = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "filters": {"capabilities": CAPABILITIES, "states": DEMO_STATES},
        "summaries": summaries,
        "state_summaries": state_summaries,
        "facilities": facilities,
        "map_points": map_points,
        "regions": regions,
        "state_regions": state_regions,
        "benchmark": _capability_benchmark("ALL"),
        "state_benchmarks": {state: _capability_benchmark(state) for state in DEMO_STATES},
        "locations": locations,
        "nearest": nearest,
        "details": details,
        "data_health": _data_health(),
        "evaluation": json.loads(evaluation_path.read_text(encoding="utf-8")),
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), default=json_default), encoding="utf-8")
    print(json.dumps({"output": str(output), "bytes": output.stat().st_size, "details": len(details)}))


if __name__ == "__main__":
    os.environ.setdefault("DATABRICKS_CONFIG_PROFILE", "hacknation")
    main()
