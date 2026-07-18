# CareProof India

CareProof is an evidence-first healthcare facility intelligence app for NGO planners. It ranks the strength of visible evidence behind facility capability claims and preserves human review decisions.

## Product boundaries

- Evidence strength is not accreditation, clinical quality, or live availability.
- Every score component must trace to a raw dataset field and excerpt.
- Location confidence is reported separately from capability evidence.
- Human overrides require a note and are preserved in Lakebase.

## Local development

The React client runs on port 5173 and proxies `/api` to FastAPI on port 8000. Local Databricks access uses the `hacknation` CLI profile.

## Databricks deployment

The app requires a SQL warehouse resource with `CAN USE`, read access to the four `workspace.careproof` tables, and a Lakebase database resource for persistent reviews.

This deployment uses the `careproof-reviews` Lakebase instance and its `databricks_postgres` database. Databricks injects the PostgreSQL connection settings; `LAKEBASE_INSTANCE` identifies the instance when rotating short-lived OAuth database credentials.
