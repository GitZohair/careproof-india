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

## How to use these guides

These are **talking beats, not word-for-word scripts**. Zamin should understand the point of each shot, say it naturally in one sentence, and move on. A small pause or genuine reaction sounds better than memorized delivery. Keep the rhythm: **problem → proof → payoff**.

Useful phrases to make your own: “Here’s the interesting part…”, “What we didn’t want to do was…”, and “This is where it becomes useful.” Do not use all three in one video.

## 1. Demo Video — UI/UX and product flow

### Tabs to prepare

1. [Product landing page](https://gitzohair.github.io/careproof-india/)
2. [Facility dossier with Evidence Copilot](https://gitzohair.github.io/careproof-india/?facility=000465f2-ab86-47e9-ba2f-9f82f9fd98a5)
3. [Jaipur Access Finder](https://gitzohair.github.io/careproof-india/?view=access&place=Jaipur)

### Shot list

| Time | Screen action | Talking beat — use your own words |
|---|---|---|
| 0–6s | Show the landing page and India evidence map. | Hook with the trust problem: a listing can say “ICU,” but where is the proof? Introduce CareProof as the answer. |
| 6–15s | Switch capability tabs and show evidence tiers and regional gaps. | Explain that this is not another hospital directory; it shows where evidence is strong, weak, or geographically unreliable. |
| 15–29s | Open the dossier and click **Why this evidence tier?** in Evidence Copilot. | Point out the score, source sentences, gaps, and grounded Copilot. Emphasize that a judge can inspect why, not just accept a number. |
| 29–42s | Cut to Jaipur Access Finder; point at nearest versus best-evidenced results. | Frame the real planner question: what is nearby, and what is actually defensible? Mention that distance and evidence are intentionally separate. |
| 42–52s | Click **Simulate outage** and show the fallback. | Make this the reveal: if the nearest defensible option fails, CareProof immediately shows how many alternatives remain and the extra distance. |
| 52–58s | End on the result card or logo. | Close with the payoff: noisy claims become auditable planning decisions, without pretending to give clinical advice. |

### Editing note

Use hard cuts between the three prepared tabs. Do not spend video time typing, scrolling long tables, or waiting for animation.

Tone: sound like you are showing a clever product to a friend, not presenting a school report. The outage reveal should carry the most energy.

## 2. Tech Video — architecture and implementation

### Visuals to prepare

1. The architecture diagram from the project README.
2. A facility dossier showing the six score components and receipts.
3. The **Data health** page showing the MLflow release result.
4. A final frame containing the Databricks App and GitHub repository links.

### Shot list

| Time | Screen action | Talking beat — use your own words |
|---|---|---|
| 0–7s | Show the architecture poster. | Start with the full journey: marketplace data enters a governed Databricks pipeline and leaves as an auditable planner workspace. |
| 7–20s | Highlight Marketplace, Unity Catalog, and SQL trust layer. | Explain the transformation in plain language: clean facilities, correct geography, extract evidence sentences, score six capabilities, aggregate regions. |
| 20–32s | Show score components and sentence receipts in a dossier. | Stress the technical principle: the scoring is deterministic and every positive signal can be traced back to a sentence. No mystery ranking. |
| 32–43s | Show the React interface and FastAPI/API layer. | Briefly connect FastAPI and Databricks SQL to the React/TypeScript map, dossiers, charts, and Access Finder. Avoid reading a library list. |
| 43–52s | Show review decision and Data Health/MLflow. | Explain that Lakebase preserves human decisions and MLflow blocks a release unless all quality checks pass. Show the 8/8 result. |
| 52–58s | Show deployment links. | Finish with delivery: full Databricks App for live data, plus the same interface as an anonymous read-only judge build. |

### Architecture line for a title card

`Marketplace → Unity Catalog → SQL trust layer → FastAPI → React workspace → Lakebase + MLflow`

Tone: technically confident but understandable. A useful opening idea is: “There is no magic score hiding here; the whole pipeline is visible.” Say it naturally rather than quoting it.

## 3. Team Video — Zamin and Zohair

Both teammates should appear if possible. Record direct-to-camera with the CareProof interface or architecture poster behind you. This video is about the partnership, not a second product demo.

### Team roles

- **Zamin:** researched the challenge options, selected the **Facility Trust Desk** problem, helped define the project direction, and leads the demo, technical, and team videos.
- **Zohair:** led implementation across data engineering, Databricks architecture, scoring logic, backend, frontend, deployment, and product polishing.

### 55-second talking flow

| Time | Speaker | Talking beat — use your own words |
|---|---|---|
| 0–7s | Both | Introduce yourselves and CareProof India. Keep it warm and quick. |
| 7–19s | Zamin | Share why Facility Trust Desk stood out while reading the challenge options: the dataset had many hospital claims, but the unanswered question was whether those claims were defensible. |
| 19–36s | Zohair | Explain that you turned that direction into the working system: the Databricks trust layer, evidence scoring, maps, dossiers, resilience simulator, Copilot, and deployment. Pick three examples, not the entire list. |
| 36–48s | Zamin | Explain how you shaped the project story and are turning the build into a clear judge experience through the three videos. Mention that the goal is to make the trust problem understandable in under a minute. |
| 48–58s | Both | Share the Jaipur outage moment or one brief lesson, then close together with what CareProof represents: useful, honest, auditable planning intelligence. |

### Natural closing idea

“Zamin found the trust question. Zohair built the proof layer. Together, we made CareProof.” Treat this as a direction; change the wording until it sounds like both of you.

If only Zamin can appear on camera, show a small on-screen card with Zohair’s name and implementation role while Zamin introduces the split accurately.

## Optional media shortlist

Upload these after the three required videos:

1. Landscape page with the India evidence map.
2. Facility dossier with Evidence Copilot and cited receipts.
3. Jaipur resilience simulator after the outage is enabled.
4. Data Health page with the MLflow PASS result.
5. The finished [architecture poster PDF](../output/pdf/careproof-india-architecture-poster.pdf) or [PNG](../output/pdf/careproof-india-architecture-poster.png).
