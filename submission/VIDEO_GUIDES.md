# CareProof India — 60-Second Video Guides

Use the anonymous judge build for recording: <https://gitzohair.github.io/careproof-india/>.

## Recording checklist

- Record at 1920×1080, 30 fps, with browser zoom at 100%.
- Export H.264 MP4 with AAC audio. Aim for 55–58 seconds, never exactly 60.
- Turn off notifications, hide bookmarks, and keep the cursor visible.
- Pre-open the links below in separate tabs so every transition is immediate.
- Record the interface first, then add the voiceover. Remove pauses and loading time.
- Test the final uploaded video in an incognito Chrome window.
- Do not display Databricks credentials, tokens, email, or workspace settings.

## 1. Demo Video — UI/UX and product flow

### Tabs to prepare

1. [Product landing page](https://gitzohair.github.io/careproof-india/)
2. [Facility dossier with Evidence Copilot](https://gitzohair.github.io/careproof-india/?facility=000465f2-ab86-47e9-ba2f-9f82f9fd98a5)
3. [Jaipur Access Finder](https://gitzohair.github.io/careproof-india/?view=access&place=Jaipur)

### Shot list

| Time | Screen action | Voiceover |
|---|---|---|
| 0–6s | Show the landing page and India evidence map. | “Hospital directories show what facilities claim. CareProof shows planners what the data can actually prove.” |
| 6–15s | Switch capability tabs and briefly show evidence tiers and regional gaps. | “Across six care capabilities, the map separates strong evidence from weak claims and unreliable locations.” |
| 15–29s | Open the dossier and click **Why this evidence tier?** in Evidence Copilot. | “Every facility opens as an evidence dossier: a transparent score, known gaps, and a free copilot grounded only in the source receipts.” |
| 29–42s | Cut to Jaipur Access Finder; point at nearest versus best-evidenced results. | “The Access Finder keeps distance and evidence quality separate, so the nearest listing is not automatically treated as the safest planning assumption.” |
| 42–52s | Click **Simulate outage** and show the fallback. | “The resilience simulator removes the nearest defensible option and instantly reveals catchment redundancy and fallback distance.” |
| 52–58s | End on the result card or logo. | “CareProof turns noisy listings into auditable action—without pretending evidence strength is clinical advice.” |

### Editing note

Use hard cuts between the three prepared tabs. Do not spend video time typing, scrolling long tables, or waiting for animation.

## 2. Tech Video — architecture and implementation

### Visuals to prepare

1. The architecture diagram from the project README.
2. A facility dossier showing the six score components and receipts.
3. The **Data health** page showing the MLflow release result.
4. A final frame containing the Databricks App and GitHub repository links.

### Shot list

| Time | Screen action | Voiceover |
|---|---|---|
| 0–7s | Show the architecture diagram. | “CareProof starts with the Databricks Marketplace dataset shared through Unity Catalog.” |
| 7–20s | Highlight the SQL transformation flow. | “A deterministic SQL pipeline cleans facilities, extracts capability evidence, builds trust profiles, and aggregates regional coverage.” |
| 20–32s | Show score components and sentence receipts in a dossier. | “Each score combines direct statements, equipment, staff, capacity, procedures, and source diversity. Every positive signal remains traceable to its source sentence.” |
| 32–43s | Show the React interface and FastAPI/API layer. | “FastAPI serves the analytical views to a React and TypeScript workspace with D3 geography and Recharts visualizations.” |
| 43–52s | Show review decision and Data Health/MLflow. | “Lakebase stores human review decisions, while MLflow gates each release with deterministic quality checks.” |
| 52–58s | Show deployment links. | “The full product runs as a Databricks App, with a read-only snapshot deployed for anonymous judging.” |

### Architecture line for a title card

`Marketplace → Unity Catalog → SQL trust layer → FastAPI → React workspace → Lakebase + MLflow`

## 3. Team Video — solo-builder version

Record this as a direct-to-camera clip. Keep the background simple and place the CareProof logo or interface behind you.

### 55-second script

> Hi, I’m Zohair, the builder behind CareProof India. I handled the product research, data engineering, Databricks architecture, backend, and frontend experience. The problem clicked when I realized a directory can say “ICU” without giving a planner one defensible sentence. So I designed the product around evidence, uncertainty, and human review—not a black-box hospital ranking. During the hackathon I transformed 10,077 listings into 26,174 capability profiles and 75,651 evidence receipts, then built the national map, access analysis, outage simulation, Evidence Copilot, and MLflow quality gate. My favorite moment was seeing the Jaipur fallback scenario work. CareProof is the civic-data product I wanted to exist: useful, honest, and auditable.

If there are additional teammates, replace the second sentence with one short sentence per person and role. Keep the combined introduction under 15 seconds.

## Optional media shortlist

Upload these after the three required videos:

1. Landscape page with the India evidence map.
2. Facility dossier with Evidence Copilot and cited receipts.
3. Jaipur resilience simulator after the outage is enabled.
4. Data Health page with the MLflow PASS result.
5. A clean architecture poster or one-page PDF.

