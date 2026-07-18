# CareProof India

Evidence-first healthcare facility intelligence for public-health and NGO planners in India.

**Live app:** [careproof-india-7474646705493946.aws.databricksapps.com](https://careproof-india-7474646705493946.aws.databricksapps.com)

CareProof converts noisy facility listings into auditable capability profiles. It maps the evidence behind ICU, NICU, emergency, maternity, oncology, and trauma claims; exposes geographic coverage gaps; and preserves human review decisions.

## What the product does

- Maps a representative national sample by evidence tier using corrected canonical coordinates.
- Compares strong, moderate, weak, insufficient, and review-needed evidence.
- Surfaces districts with the lowest reliable-evidence share.
- Finds the nearest evidenced capability claims from a city, district, PIN, or browser location.
- Opens a facility dossier with score components, sentence-level receipts, flags, gaps, and sources.
- Saves planner decisions to Databricks Lakebase.

The access finder is planning intelligence—not patient referral advice. Distance does not establish clinical suitability, current capacity, or availability.

## Architecture

```text
Databricks Marketplace / Unity Catalog
              │
        SQL transformation
              │
 facility_clean ── capability_evidence ── trust_profile ── region_summary
              │                                  │
        SQL Warehouse                       FastAPI API
                                                   │
                              React map + analysis workspace
                                                   │
                                   Lakebase review decisions
```

The application is a React 19 + TypeScript client served by FastAPI. Databricks SQL supplies the analytical views, while Lakebase stores durable human decisions. D3 Geo renders the India map and Recharts handles analytical charts.

## Product boundaries

- Evidence strength is not accreditation, clinical quality, or live availability.
- Every score component traces to a raw dataset field or evidence excerpt.
- Location confidence is reported separately from capability evidence.
- Human overrides require a note and remain auditable.
- PIN-centroid corrections are disclosed; unresolved coordinates are excluded from maps.

## Local development

Prerequisites: Node.js 20+, Python 3.11+, and a configured Databricks CLI profile with access to the required catalog and SQL warehouse.

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:DATABRICKS_CONFIG_PROFILE="your-profile"
npm run dev
```

Vite runs on port `5173` and proxies `/api` to FastAPI on port `8000`. Run the API separately with:

```powershell
.\.venv\Scripts\python.exe -m uvicorn server.main:app --reload --port 8000
```

## Databricks deployment

The Databricks App needs:

- a SQL warehouse resource with `CAN USE`;
- `SELECT` access to the configured facility, evidence, trust-profile, and regional-summary tables;
- a Lakebase database resource for persistent review decisions.

Table names and resource bindings are configured in [`app.yaml`](app.yaml). Build the client before syncing the source to a Databricks workspace and deploying the App snapshot.

## Data scale

The current trust layer contains 10,077 canonical facilities, 26,174 capability profiles, 75,651 evidence receipts, and 2,821 regional aggregates.
