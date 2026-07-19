# CareProof India — Submission Copy

## Challenge category

**Facility Trust Desk — “Can this facility actually do what it claims?”**

## Short Description

CareProof turns noisy Indian hospital claims into auditable evidence scores, maps, source receipts, and resilient healthcare planning decisions.

## 1. Problem & Challenge

Healthcare directories often treat a listed capability—such as ICU, trauma, or oncology—as proof that the service exists. Public-health planners cannot easily see which claims are supported, which locations are unreliable, or what must be verified before action. This creates false confidence and wastes limited verification effort.

## 2. Target Audience

CareProof is built for public-health planners, NGOs, emergency-preparedness teams, healthcare researchers, and facility-verification teams in India. It is planning intelligence, not a patient-facing hospital recommendation tool.

## 3. Solution & Core Features

CareProof creates evidence dossiers for six care capabilities. It provides an India evidence map, transparent confidence tiers, sentence-level receipts, data-quality flags, regional gap analysis, an evidence-aware Access Finder, and an outage resilience simulator. A dossier-grounded Evidence Copilot answers quick questions without inventing facts, while human review decisions remain auditable.

## 4. Unique Selling Proposition (USP)

Most directories answer, “Does this hospital claim ICU?” CareProof asks, “What evidence supports that claim, can we trust the location, and what should be verified next?” It keeps distance, evidence strength, and clinical suitability separate. Every score is deterministic and traceable instead of being a black-box ranking.

## 5. Implementation & Technology

Databricks Marketplace data is governed through Unity Catalog and transformed with SQL into cleaned facilities, evidence receipts, trust profiles, and regional summaries. A Python/FastAPI service queries Databricks SQL, React and TypeScript power the analytical workspace, Lakebase/PostgreSQL stores planner decisions, and MLflow records the release-quality gate. The full product runs on Databricks Apps; GitHub Pages hosts the anonymous read-only judge snapshot.

## 6. Results & Impact

CareProof produced 10,077 canonical facilities, 26,174 capability profiles, 75,651 evidence receipts, and 2,821 regional aggregates across six capabilities. All eight deterministic release checks pass. In the Jaipur ICU demo, 10 defensible options exist within 25 km; after simulating the nearest option’s outage, nine remain and the fallback adds only 0.9 km.

## Most Fun Moment

The most fun moment was switching on the Jaipur outage simulation and watching the product identify a defensible fallback instead of simply recommending the next pin. That was when the project stopped feeling like a dashboard and became a real planning tool.

## Additional Information

Evidence strength is not accreditation, clinical quality, live bed availability, or referral advice. CareProof deliberately exposes those boundaries and sends uncertain records to human verification. The public demo is read-only and requires no login.

- **Live judge demo:** <https://gitzohair.github.io/careproof-india/>
- **Source code:** <https://github.com/GitZohair/careproof-india>
- **Full Databricks App:** <https://careproof-india-7474646705493946.aws.databricksapps.com/>

## Technologies

- Databricks Apps
- Databricks Marketplace
- Unity Catalog
- Databricks SQL
- MLflow
- Lakebase / PostgreSQL
- Python
- FastAPI
- React
- TypeScript
- Vite
- D3 Geo
- Recharts
- GitHub Actions
- GitHub Pages

## Additional Tags

- healthcare analytics
- facility verification
- evidence traceability
- geospatial analytics
- data quality
- decision support
- human-in-the-loop
- responsible AI
- public health
- resilience planning

