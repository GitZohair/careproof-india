# CareProof India

Evidence-first healthcare facility intelligence for public-health and NGO planners in India.

## Challenge category: Facility Trust Desk

CareProof targets the **Facility Trust Desk** track: *“Can this facility actually do what it claims?”* We chose it because the source dataset contains thousands of useful but inconsistent facility descriptions, where a listed capability such as ICU or trauma care is not the same as verified proof. In plain language, CareProof turns those claims into an evidence traffic light, shows the source sentences behind each score, flags what is uncertain, and lets a planner record a human decision. It supports planning and verification; it does not recommend treatment to patients.

**Submission / anonymous judge demo:** [gitzohair.github.io/careproof-india](https://gitzohair.github.io/careproof-india/)

**Full Databricks app:** [careproof-india-7474646705493946.aws.databricksapps.com](https://careproof-india-7474646705493946.aws.databricksapps.com)

The public link is a read-only snapshot of marketplace data and requires no sign-in. The full application queries Unity Catalog live and persists planner decisions in Lakebase.

CareProof converts noisy facility listings into auditable capability profiles. It maps the evidence behind ICU, NICU, emergency, maternity, oncology, and trauma claims; exposes geographic coverage gaps; and preserves human review decisions. Its free, dossier-grounded **Evidence Copilot** answers template or typed questions from the visible receipts, gaps, flags, and score fields—without an external model or clinical advice.

## Judge quick start

1. Open the live app and choose **60-sec demo**.
2. Run the prebuilt **Jaipur scenario**.
3. Compare the nearest facility with the best-evidenced option within 25 km.
4. Run the **Evidence Resilience Simulator** to remove the nearest defensible option and inspect the fallback.
5. Open a dossier and try an **Evidence Copilot** template question, then inspect its cited receipts.
6. Review the score components, gaps, and source links behind the answer.
7. Visit **Data health** to see the MLflow release gate, then **Method** for the transparent scoring model.

The complete path is intentionally deterministic and auditable; it does not use a language model to invent a facility recommendation.

## What the product does

- Maps a representative national sample by evidence tier using corrected canonical coordinates.
- Switches the same map to a location-confidence lens, separating data deserts from apparent care deserts.
- Compares strong, moderate, weak, insufficient, and review-needed evidence.
- Benchmarks evidence readiness across all six care capabilities.
- Surfaces districts with the largest number of uncorroborated profiles.
- Finds the nearest evidenced capability claims from a city, district, PIN, or browser location.
- Simulates a facility outage and measures evidence-aware catchment redundancy and fallback distance.
- Opens a facility dossier with score components, sentence-level receipts, flags, gaps, and sources.
- Saves planner decisions to Databricks Lakebase.
- Logs deterministic trust-layer release checks to MLflow and exposes the latest quality gate.

The access finder is planning intelligence—not patient referral advice. Distance does not establish clinical suitability, current capacity, or availability.

## Why this is different

Most directories answer “does this facility claim ICU?” CareProof asks “what visible evidence supports that claim, how geographically trustworthy is the record, and what should a planner verify next?” It keeps distance, evidence strength, and clinical suitability separate instead of collapsing them into a misleading hospital ranking.

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

## License

[MIT](LICENSE)
