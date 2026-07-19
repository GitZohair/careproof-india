from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mlflow
from databricks.sdk import WorkspaceClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from server.db import warehouse
from server.settings import settings


VALID_STATES = (
    "Andaman And Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra And Nagar Haveli And Daman And Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu And Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
)


def sql_strings(values: tuple[str, ...]) -> str:
    return ",".join("'" + value.replace("'", "''") + "'" for value in values)


def collect_metrics() -> tuple[int, list[dict[str, Any]], dict[str, float]]:
    profile = warehouse.query(
        f"""
        WITH audited AS (
          SELECT *,
            component_direct + component_equipment + component_staff + component_capacity
              + component_procedure + component_sources AS component_sum,
            CASE
              WHEN claimed AND facet_count <= 1 THEN LEAST(20, GREATEST(0,
                component_direct + component_equipment + component_staff + component_capacity
                  + component_procedure + component_sources - IF(contextual_source_risk, 25, 0)))
              ELSE GREATEST(0, LEAST(100,
                component_direct + component_equipment + component_staff + component_capacity
                  + component_procedure + component_sources - IF(contextual_source_risk, 25, 0)))
            END AS expected_score,
            CASE
              WHEN contextual_source_risk THEN 'NEEDS_REVIEW'
              WHEN evidence_strength >= 75 AND facet_count >= 3 THEN 'STRONG'
              WHEN evidence_strength >= 50 AND facet_count >= 2 THEN 'MODERATE'
              WHEN evidence_strength >= 25 THEN 'WEAK'
              ELSE 'INSUFFICIENT'
            END AS expected_tier
          FROM {settings.trust_table}
        )
        SELECT COUNT(*) AS profiles,
          COUNT_IF(evidence_strength < 0 OR evidence_strength > 100) AS score_range_violations,
          COUNT_IF(evidence_strength <> expected_score) AS component_score_mismatches,
          COUNT_IF(tier <> expected_tier) AS tier_rule_mismatches,
          COUNT_IF(canonical_state IS NOT NULL AND canonical_state NOT IN ({sql_strings(VALID_STATES)})) AS invalid_states,
          COUNT_IF(canonical_latitude IS NOT NULL AND (canonical_latitude < 6 OR canonical_latitude > 38.6
            OR canonical_longitude < 68 OR canonical_longitude > 98)) AS invalid_coordinate_bounds,
          COUNT_IF(location_confidence NOT IN ('VERIFIED','PLAUSIBLE','PIN_FALLBACK','RAW_UNVERIFIED','UNKNOWN')) AS invalid_location_labels
        FROM audited
        """
    )[0]
    receipts = warehouse.query(
        f"""
        SELECT COUNT(*) AS receipts,
          COUNT_IF(t.facility_id IS NULL) AS orphan_receipts
        FROM {settings.evidence_table} e
        LEFT JOIN {settings.trust_table} t
          ON e.facility_id=t.facility_id AND e.capability=t.capability
        """
    )[0]
    capability = warehouse.query(
        f"""
        WITH counts AS (
          SELECT capability, COUNT_IF(claimed) AS claimed,
                 COUNT_IF(claimed AND facet_count >= 2) AS supported
          FROM {settings.trust_table}
          GROUP BY capability
        )
        SELECT COUNT_IF(supported > claimed) AS support_overclaim_capabilities FROM counts
        """
    )[0]

    checks = [
        ("score_range", "Score range", int(profile["score_range_violations"] or 0), "scores outside 0–100"),
        ("score_components", "Component reconciliation", int(profile["component_score_mismatches"] or 0), "score/component mismatches"),
        ("tier_rules", "Tier rule consistency", int(profile["tier_rule_mismatches"] or 0), "tier assignment mismatches"),
        ("state_domain", "Canonical state domain", int(profile["invalid_states"] or 0), "invalid Indian state labels"),
        ("coordinate_bounds", "Coordinate bounds", int(profile["invalid_coordinate_bounds"] or 0), "mapped coordinates outside India bounds"),
        ("location_labels", "Location confidence domain", int(profile["invalid_location_labels"] or 0), "unknown confidence labels"),
        ("receipt_links", "Evidence receipt linkage", int(receipts["orphan_receipts"] or 0), "receipts without a trust profile"),
        ("claim_support", "Claim support invariant", int(capability["support_overclaim_capabilities"] or 0), "capabilities where supported exceeds claimed"),
    ]
    result = [{"name": name, "label": label, "passed": value == 0, "value": value, "detail": detail} for name, label, value, detail in checks]
    metrics = {f"violations_{item['name']}": float(item["value"]) for item in result}
    metrics.update({
        "profiles_evaluated": float(profile["profiles"] or 0),
        "evidence_receipts_evaluated": float(receipts["receipts"] or 0),
        "checks_passed": float(sum(item["passed"] for item in result)),
        "checks_total": float(len(result)),
    })
    return int(profile["profiles"] or 0), result, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate and version the CareProof trust layer")
    parser.add_argument("--no-mlflow", action="store_true", help="Generate the local report without logging a run")
    parser.add_argument("--output", default="server/evaluation_latest.json")
    args = parser.parse_args()

    profiles, checks, metrics = collect_metrics()
    report: dict[str, Any] = {
        "status": "PASS" if all(item["passed"] for item in checks) else "FAIL",
        "score_version": "v1.0",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "mlflow_run_id": None,
        "mlflow_run_url": None,
        "profiles_evaluated": profiles,
        "checks": checks,
    }

    if not args.no_mlflow:
        profile = os.getenv("DATABRICKS_CONFIG_PROFILE", settings.databricks_profile)
        client = WorkspaceClient(profile=profile)
        user_name = client.current_user.me().user_name
        mlflow.set_tracking_uri(f"databricks://{profile}")
        experiment = mlflow.set_experiment(f"/Users/{user_name}/careproof-evaluation")
        with mlflow.start_run(run_name=f"trust-layer-{report['score_version']}") as run:
            mlflow.log_params({
                "score_version": report["score_version"],
                "strong_threshold": 75,
                "strong_min_facets": 3,
                "moderate_threshold": 50,
                "moderate_min_facets": 2,
                "weak_threshold": 25,
                "contextual_risk_routes_to_review": True,
            })
            mlflow.log_metrics(metrics)
            mlflow.set_tags({"product": "CareProof India", "evaluation_type": "deterministic_release_gate", "result": report["status"]})
            report["mlflow_run_id"] = run.info.run_id
            report["mlflow_run_url"] = f"{client.config.host}/ml/experiments/{experiment.experiment_id}/runs/{run.info.run_id}"
            mlflow.log_dict(report, "evaluation_report.json")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "checks": len(checks), "profiles": profiles, "mlflow_run_id": report["mlflow_run_id"]}))


if __name__ == "__main__":
    main()
