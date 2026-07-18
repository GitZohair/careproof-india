from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    warehouse_id: str = os.getenv("WAREHOUSE_ID", "dd096fed6be1701b")
    databricks_profile: str = os.getenv("DATABRICKS_CONFIG_PROFILE", "hacknation")
    facility_table: str = os.getenv("FACILITY_TABLE", "workspace.careproof.facility_clean")
    evidence_table: str = os.getenv("EVIDENCE_TABLE", "workspace.careproof.facility_capability_evidence")
    trust_table: str = os.getenv("TRUST_TABLE", "workspace.careproof.facility_trust_profile")
    region_table: str = os.getenv("REGION_TABLE", "workspace.careproof.region_summary")
    review_schema: str = os.getenv("REVIEW_SCHEMA", "careproof")
    review_backend: str = os.getenv("REVIEW_BACKEND", "auto")


settings = Settings()

