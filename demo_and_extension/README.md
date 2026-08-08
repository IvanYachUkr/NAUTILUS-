# Geo Evidence Atlas and OpenGuessr Recorder

This folder contains the experiment data pipeline, Chrome recorder extension, local collector, and visualization for the geo-localization evaluation.

The current repository includes complete **manual reference runs** for 25 European locations in two conditions:

- **Static image / NMPZ** - one canonical starting PNG per location.
- **Interactive panorama** - one per-location WebM plus Street View camera/event telemetry.

The benchmark is split into:

```text
europe-easy     8 locations
europe-medium   9 locations
europe-hard     8 locations
```

These manual runs are reference/demo material. Future model/agent runs should use the same competition IDs, conditions, recording contract, and generated visualization pipeline.

---

## 1. Source of truth

The current location definitions are embedded directly in:

```text
data/competitions/europe-easy.json
data/competitions/europe-medium.json
data/competitions/europe-hard.json
```

Do not maintain a second root-level `locations.json`.

Each competition location stores the full Google Street View URL. The build extracts the coordinates and camera information from that URL, so latitude/longitude are not duplicated as editable fields.

### Starting pitch

All current benchmark URLs are normalized to a level **0-degree starting pitch**. In copied Google Maps Street View URLs this corresponds to `90t`.

This is especially important for the static/NMPZ condition because the starting frame is the complete model input.

If a competition URL is manually changed, normalize it again with:

```powershell
npm run locations:zero-pitch
```

---

## 2. Important folders

```text
data/competitions/       location + competition source definitions
data/recordings/inbox/   completed per-round recorder JSON
data/recordings/sessions/full-competition session manifests
data/starting-images/    canonical static/NMPZ PNGs
data/exploration-videos/ interactive per-location WebM + capture metadata
data/results/            optional model annotations/results
data/generated/          rebuildable demo files; do not edit manually

extension/openguessr-research-recorder/  Chrome recorder extension
scripts/                              build/collector/inspection utilities
src/                                  visualization application
tests/                                automated tests
```

`data/recordings/index.jsonl` is only a local append-only collector audit log. It is not source data and is intentionally ignored by Git.

---

## 3. Install and verify the demo

Requirements:

- Node.js 20+
- Chrome for recorder use

From this folder:

```powershell
npm ci
npm run verify
```

Start the local collector and demo:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:4173
```

Keep `npm start` running during experiment recording. The collector receives recorder JSON/video/image artifacts and writes them into the repository.

---

# Recording workflow

The recording workflow is repeated for each:

```text
model/participant × difficulty × condition
```

For manual reference recordings use:

```text
model: manual
```

The two conditions are:

```text
static-image
interactive-panorama
```

---

## 4. Generate OpenGuessr location links

From `demo_and_extension/` run:

```powershell
npm run competition:export
```

Generated link files are written under:

```text
data/generated/competition-links/
```

For example:

```text
data/generated/competition-links/europe-easy.txt
data/generated/competition-links/europe-medium.txt
data/generated/competition-links/europe-hard.txt
```

Copy the complete contents of the desired TXT file into OpenGuessr's custom-location input.

---

## 5. Create an OpenGuessr competition

The project workflow uses two OpenGuessr accounts:

- **Account 1** creates the private competition.
- **Account 2** performs the actual experiment/recording.

With account 1:

```text
OpenGuessr
→ Menu
→ Competitions
→ Active
→ + Create
```

The current competition template uses:

```text
Round length: 180 seconds
Competition duration: 2 days
Visibility: Private
```

The restriction depends on the experiment condition:

### Static / NMPZ

Choose:

```text
Restriction: NMPZ
```

NMPZ means No Move / No Pan / No Zoom.

### Interactive panorama

Choose:

```text
Restriction: None
```

Movement, panning, pitch, and zoom are allowed.

Paste the generated location URLs, create the competition, and copy its private link.

OpenGuessr normally allows an account to participate in a specific competition only once, so create a fresh private competition when another model/condition run is required. The same generated location TXT can be reused.

---

## 6. Install / update the Chrome recorder

Open:

```text
chrome://extensions
```

Enable **Developer mode**, choose **Load unpacked**, and select:

```text
extension/openguessr-research-recorder
```

When updating the recorder, replace/reload the complete extension folder rather than mixing files from different versions.

After loading or reloading the extension, refresh/reopen the OpenGuessr tab so the newest scripts are active.

Before opening/playing the competition, ensure this is running in a terminal:

```powershell
npm start
```

---

## 7. Configure the recorder with experiment account 2

Open the private competition link with account 2.

**Do not press OpenGuessr Start immediately.** Wait for the in-page recorder setup card.

Choose:

```text
Competition
Model / participant label
Condition
```

Examples of the model field:

```text
manual
GPT-5.6 Sol
Gemini ...
```

For an NMPZ competition select:

```text
static-image
```

For an unrestricted competition select:

```text
interactive-panorama
```

---

# Static / NMPZ recording

## 8. Arm static mode

Press:

```text
Arm / start recorder
```

For static mode, no Chrome toolbar authorization click is needed.

After the recorder shows its compact armed state, press the normal OpenGuessr **Start** button.

For every round the recorder captures one stable canonical starting PNG plus the normal round/prediction metadata.

Static images are stored under:

```text
data/starting-images/<competition>/<location>.png
```

Example:

```text
data/starting-images/europe-easy/loc_001.png
```

Existing canonical PNGs are not overwritten automatically. Delete a specific PNG deliberately if that location must be recollected.

---

# Interactive panorama recording

## 9. Arm interactive mode - important

Interactive mode requires a second Chrome authorization action after the in-page Arm action.

### Do not skip this sequence

First press:

```text
Arm / start recorder
```

The large setup card collapses to a compact:

```text
AUTHORIZE VIDEO
```

state.

At this point **do not press OpenGuessr Start yet**.

The recorder extension toolbar badge should show:

```text
ARM
```

While the OpenGuessr tab is active, click the **OpenGuessr Research Round Recorder extension icon once** in the Chrome toolbar.

This click is required by Chrome's `tabCapture` permission model. It only authorizes the tab video stream:

- it does not start a second configuration workflow;
- it does not change the selected competition/model/condition;
- it does not require another Arm action.

After authorization succeeds, verify:

```text
in-page recorder HUD = ARMED
extension toolbar badge = VID
```

Chrome may additionally show its own tab-capture indicator on the OpenGuessr tab. Depending on Chrome version this can appear as a blinking/animated recording/capture indicator. This is useful extra confirmation, but the recorder HUD and `VID` badge are the primary checks.

**Only after you see `ARMED` + `VID` should you press the normal OpenGuessr Start button.**

When an actual round becomes playable and its WebM starts recording, the extension badge changes to:

```text
REC
```

If the extension badge shows:

```text
!
```

video authorization/capture has failed and should be investigated before relying on the run.

### Interactive badge lifecycle

```text
Configure Interactive
        ↓
Arm / start recorder
        ↓
HUD = AUTHORIZE VIDEO
badge = ARM
        ↓
click extension icon ONCE
        ↓
HUD = ARMED
badge = VID
        ↓
press OpenGuessr Start
        ↓
round starts recording
badge = REC
```

The toolbar authorization is required **once per competition/session**, not once per round.

---

## 10. Play an interactive competition

Play the rounds normally.

Per location, the video lifecycle is:

```text
real Street View round becomes playable
        ↓
first valid live Street View sample
        ↓
start this location's WebM
        ↓
move / pan / tilt / zoom normally
        ↓
submit prediction
        ↓
stop + finalize this location's WebM
        ↓
result / Continue
        ↓
next location starts a new WebM
```

Interactive videos are intentionally stored **one WebM per location**, not as one competition-wide video.

Finalized videos are stored under:

```text
data/exploration-videos/<competition>/<location>/<session>/round-XX.webm
```

A small JSON file beside the WebM stores capture metadata such as session/round identity, timestamps, MIME type, dimensions, byte count, and final path.

The round recording JSON separately stores telemetry including:

- Street View position changes;
- panorama IDs when available;
- heading;
- pitch;
- zoom / field of view;
- camera/event timestamps;
- prediction and prediction timing.

This separation allows the demo to seek the real video to an exact timestamp while using the nearest telemetry sample for map/camera information.

---

## 11. Verify competition completion

During a healthy competition, the recorder saved-round counter should increase after each completed round, for example:

```text
1/8 rounds saved
2/8 rounds saved
...
8/8 rounds saved
```

Do not treat the run as complete until the final prediction and its visual artifact have been finalized.

At normal completion press:

```text
Done & disarm
```

If the experiment must be aborted early, use:

```text
Stop recording
```

in the compact recorder HUD.

---

# Recorded files

## 12. Round JSON

Completed per-round recordings live under:

```text
data/recordings/inbox/<competition>/<location>/
```

A healthy dataset contains one selected completed recording per model/condition/location combination.

The round JSON includes a `sessionId` so all rounds from the same competition run can be grouped.

## 13. Session manifests

Full competition session state is stored under:

```text
data/recordings/sessions/<competition>/
```

## 14. Interactive video partials

While a WebM is being finalized, temporary chunks may exist under `.partial/` directories inside `data/exploration-videos/`.

Inspect leftovers with:

```powershell
npm run videos:repair
```

This performs a dry-run inspection.

Apply only safe/proven cleanup with:

```powershell
npm run videos:repair -- --apply
```

Unmatched partial data may contain recoverable video and should not be deleted blindly.

---

# Semantic key moments

## 15. What key moments mean

The recorder deliberately keeps raw exploration telemetry separate from semantic evidence annotations.

Routine events such as:

```text
move
pan
tilt
zoom
exploration start
prediction submitted
```

are **not** semantic key moments.

A key moment should represent something meaningful for explainability, for example:

```text
Bastille bus stop sign becomes readable
German town name visible on road sign
Distinctive church tower recognized
Language clue becomes visible
```

If no semantic moments have been defined, the demo shows:

```text
No key moments defined
```

## 16. Where to add key moments

Add them to the **source round recording JSON** in `data/recordings/inbox/...`, not to generated atlas files.

The top-level field is:

```json
"keyMoments": []
```

Example:

```json
"keyMoments": [
  {
    "id": "bastille-bus-stop-visible",
    "label": "Bastille bus stop sign visible",
    "description": "The Bastille bus-stop sign is readable in the panorama.",
    "tMs": 10000,
    "source": "manual",
    "category": "text-clue",
    "evidence": {
      "visibleText": "Bastille"
    }
  }
]
```

`tMs` is milliseconds into that location's interactive recording:

```text
10000 = 10.0 seconds
```

After editing a source recording, rebuild:

```powershell
npm run data:build
```

In the demo, clicking a semantic key moment:

- moves the exploration timeline;
- selects the nearest telemetry sample for map/camera state;
- opens the playback side panel;
- seeks the embedded WebM to the **exact key-moment timestamp**.

`source` can identify where the annotation came from, for example:

```text
manual
agent
```

This makes the same annotation layer usable later for agent-generated evidence events.

---

# Build and visualization

## 17. Rebuild demo data

After changing competition definitions, recordings, semantic annotations, or result files, run:

```powershell
npm run data:build
```

Important generated outputs include:

```text
data/generated/recordings.index.json
data/generated/atlas-cases.json
data/generated/build-report.json
```

Do not hand-edit these files.

## 18. Open the visualization

Start/restart:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:4173
```

If the browser already had the demo open, use a hard refresh:

```text
Ctrl + F5
```

### Static view

The static condition displays the canonical starting PNG, truth/prediction information, error metrics, and evaluation statistics. There is no exploration playback.

### Interactive view

The interactive condition displays the per-location WebM, exploration path, telemetry timeline, camera values, semantic key moments, and prediction/error information.

---

# Team / agent handoff

The manual runs already stored in this repository are reference/demo trajectories. They show the complete expected data flow but are not a substitute for agent-generated runs.

A future model/agent integration should ultimately provide the same kinds of outputs:

```text
selected competition/location
        ↓
static image OR interactive exploration
        ↓
prediction coordinate
        ↓
optional hypothesis/cues
        ↓
semantic evidence/key moments when available
        ↓
source recording/result data
        ↓
npm run data:build
        ↓
visualization + metrics
```

For static image benchmarking, the separate `../geoclip/` folder contains the CPU-based GeoCLIP baseline and Easy/Medium/Hard result files.

---

# Useful commands

Run these from `demo_and_extension/`.

Generate OpenGuessr competition link files:

```powershell
npm run competition:export
```

List available competition definitions:

```powershell
npm run competition:list
```

Normalize location URLs to level starting pitch:

```powershell
npm run locations:zero-pitch
```

Build/rebuild visualization data:

```powershell
npm run data:build
```

Inspect recorded sessions:

```powershell
npm run recordings:inspect
```

Inspect leftover video partials:

```powershell
npm run videos:repair
```

Apply only safe partial cleanup:

```powershell
npm run videos:repair -- --apply
```

Run the full data/extension/test verification:

```powershell
npm run verify
```

Start collector + web demo:

```powershell
npm start
```
