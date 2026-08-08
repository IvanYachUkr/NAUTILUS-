# Geo Evidence Atlas

## v0.8.12 interactive transition + route integrity fix

The bundled recorder is now **v0.6.7**. Interactive result-screen camera events can no longer be mistaken for the next competition round. After a completed result, the recorder waits for real transition evidence and a materially new panorama before starting the next round. A `Continue` action can no longer finalize a round that has no captured prediction, and partial diagnostic recordings do not increase the session completed-round count.

Interactive movement traces now use live Google Maps API positions as the authoritative route. Static iframe/DOM heartbeats are retained only as fallback/diagnostic observations and are excluded from the movement polyline once API capture is available. The route also stops at the prediction/Guess boundary, so result-screen camera resets cannot draw an artificial return to the starting point.

## v0.8.11 recorder round-boundary fix

The bundled recorder is now **v0.6.6**. It rejects stale `Continue`, result,
and prediction events whose original event timestamp predates the current round
start. Finalize timers are also tied to the exact round that scheduled them.
This prevents the observed zero-duration phantom round where a delayed Continue
click from the previous result screen immediately finalized the next location.

The recording schema remains unchanged. Existing recordings and the current
visualization/data pipeline remain compatible.

## v0.8.3 map selection and detail-panel behavior

When a run is selected, the map now shows only that run's ground truth and prediction (plus the exploration route for interactive runs), which removes the generic dataset marker that previously overlapped the ground-truth marker. Clicking `T` opens the Ground truth panel with the curated starting Street View; clicking `P` opens the Prediction panel with Street View at the submitted coordinate. The All-locations overview maps only cases with an actual prediction for the selected model, condition, and active filters. The truth-to-prediction connector uses a darker slate-gray line for better contrast.

## v0.8.2 static/NMPZ visualization

Static/NMPZ recordings are deliberately shown without a playback timeline. Use the right-side Ground Truth panel for the curated starting Street View and the Prediction panel for Street View at the submitted prediction. Interactive panorama recordings keep the full movement/camera playback UI.


A self-contained visualization, OpenGuessr competition workspace, and Chrome/Edge
research recorder for the project **Evaluating Explainability and Agentic
Exploration in MLLM Image Geolocation**.

This version includes the supplied 25 European locations split into three real
competition definitions:

| Competition ID | Difficulty | Locations | Generated TXT |
|---|---:|---:|---|
| `europe-easy` | Easy | 8 | `europe-easy.txt` |
| `europe-medium` | Medium | 9 | `europe-medium.txt` |
| `europe-hard` | Hard | 8 | `europe-hard.txt` |

The website loads all three at once. You can view all 25 locations together or
filter by competition, country, difficulty, scene type, model, and condition.
Each location card has a compact competition/round tag such as `Easy · R1`.

No npm packages are required. Use **Node.js 20 or newer**.


## v0.8.1: duplicate result-screen round fix

The bundled recorder is now version **0.5.1**. Recorder 0.5.0 could correctly
save a submitted prediction and then, while the OpenGuessr result screen was
still visible, interpret a repeated result event as the start of a second round.
That produced a short `partial: true` JSON with `startSource: "result_visible"`
for the same location.

Version 0.5.1 never starts a round from a result screen or from the Continue
button after the real round has already been finalized. A new round begins only
after OpenGuessr exposes an actual live-round view again.

The data builder also ignores the exact phantom-file shape produced by v0.5.0,
so existing duplicate files can remain in `data/recordings/inbox/` without
replacing or polluting the valid recording. You may still delete those phantom
files manually if you prefer a clean inbox.

## Upgrade from v0.7.1 without losing recordings

Your existing files under `data/recordings/`, `data/results/`, and any edited
competition JSON files are experiment data. Preserve them before replacing the
repository. The safest workflow is:

```powershell
Copy-Item .\data .\data-backup-before-v0.8 -Recurse
```

Then unpack v0.8.1 and copy your real `data/recordings/` and `data/results/`
contents back into the new repository. If you edited the competition definitions,
copy those JSON files back as well. Generated files under `data/generated/` do
not need to be preserved; rebuild them with `npm run data:build`.

Existing v0.4.x recordings with `prediction: null` remain valid playback data,
but the old manual pin cannot be reconstructed after the fact. Replay the round
or add a separate model result if you need a prediction for that historical run.

After installing/replacing the extension files, click **Reload** on the extension
card in `chrome://extensions`, then reload the OpenGuessr tab. Page-level hooks
are injected at page load, so reloading only the extension card is not enough.

## v0.8.0: reliable manual prediction capture

The bundled Chrome/Edge recorder is now version **0.5.0**. This release fixes
the failure mode observed during a real NMPZ/manual pilot where the round was
recorded but the manually placed map pin was not saved (`prediction: null`).

Prediction capture now uses two independent paths:

1. **Leaflet guess-map capture** — the extension observes the actual coordinate
   clicked on OpenGuessr's Leaflet guess map. When the Guess control is pressed,
   that coordinate is committed as the prediction.
2. **Submission-request capture** — the existing fetch/XHR/WebSocket/beacon
   inspection remains as a fallback when OpenGuessr exposes coordinates in the
   submission payload.

Some OpenGuessr layouts do not expose a normal Guess button. In that case the
recorder keeps the latest Leaflet map click and commits it immediately when the
result screen becomes visible. This matches the real pilot behavior that
triggered the fix.

The result screen is also a hard recording boundary. Once it appears, the round
is **frozen**: later Street View frames or DOM probes cannot add samples to the
old round. This prevents the first view of the next/result state from appearing
as fake movement in the previous location.

After a successful round, the recording should contain for example:

```json
{
  "model": "manual",
  "prediction": {
    "lat": 61.101,
    "lng": 6.901,
    "source": "leaflet-map-click"
  },
  "partial": false
}
```

After playing, rebuild/refresh the demo:

```powershell
npm run data:build
npm start
```

Then hard-refresh `http://127.0.0.1:4173` with `Ctrl+F5`. A run with a captured
prediction shows the prediction pin, comparison line, Haversine error, and the
recorded playback automatically.

## v0.7.1 compatibility: recordings without a captured prediction

The previous v0.7.1 / recorder 0.4.1 release also fixed JavaScript's
`Number(null) === 0` edge case so an absent coordinate is never mistaken for a
real `(0, 0)` position or prediction.

The extension's **model** field is only a label used to group runs. Entering
`manual` does not create a prediction coordinate. A completed or manually
finalized round can therefore contain:

```json
{
  "model": "manual",
  "condition": "static-image",
  "partial": true,
  "prediction": null
}
```

Version 0.7.1 imports such matched recordings as **recording-only runs**. The
website shows their NMPZ/static or interactive playback, timing, samples, and
Street View links. It deliberately omits the prediction pin, comparison line,
Haversine error, and error statistics until a valid guess coordinate is added.

Inspect all files under `data/recordings/inbox/` with:

```powershell
npm run recordings:inspect
```

Then rebuild and hard-refresh the website:

```powershell
npm run data:build
npm start
```

Open `http://127.0.0.1:4173` and press `Ctrl+F5`. Select the imported model
(`manual`), the correct condition, and the recorded location.

## Emergency: preserve the round that is open right now

Open the extension popup while the OpenGuessr tab is active.

1. Press **Save checkpoint**. This copies the complete in-progress extension
   state into `data/recordings/checkpoints/` and does **not** end the round.
2. Press **Download diagnostics** when the popup looks stuck. The JSON includes
   the page probe, NMPZ detection, active round, samples, and the last recorder
   error.
3. Press **Finalize round** only when you intentionally want to close and save
   the current round. Prediction coordinates may still be `null` only when neither the guess-map click nor a submission coordinate was observable.

The live state is stored in both extension session storage and a throttled local
recovery copy. Closing the popup does not stop recording. Do not press **Reset
tab session** until you have saved a checkpoint or finalized the round.

For an older v3 installation, use **Finalize current round** before replacing or
reloading the extension. To export its storage without finalizing, follow
`extension/openguessr-research-recorder/RECOVER_OLDER_V3.md`. If its popup only
says `Armed` and the exported storage contains no `currentRound`, that version
never created a round object; install this release and repeat the NMPZ round.

## 1. Start the repository

```powershell
cd "G:\_UTN\Computer Vision\Final Group Project\repo\geo-evidence-atlas"
npm start
```

Open:

```text
http://127.0.0.1:4173
```

`npm start` performs three jobs:

1. validates all competition definitions and derives their coordinates;
2. rebuilds the browser data and paste-ready TXT files;
3. serves the web demo and the local extension collector.

## 2. Export a competition for OpenGuessr

The easiest cross-platform command is interactive:

```powershell
npm run competition:export
```

Choose `Easy`, `Medium`, or `Hard`. The script validates the selected JSON and
prints the generated TXT path.

On Windows, there is also a file-picker script. It lets you select any JSON under
`data/competitions/` and can copy the resulting links immediately:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\select-competition.ps1 -Copy
```

Direct selection is also supported:

```powershell
npm run competition:export -- --id=europe-easy
npm run competition:export -- --id=europe-medium
npm run competition:export -- --id=europe-hard
```

On Windows, add `--copy` to copy every URL directly to the clipboard while still
creating the TXT:

```powershell
npm run competition:export -- --id=europe-easy --copy
```

The generated files are:

```text
data/generated/competition-links/europe-easy.txt
data/generated/competition-links/europe-medium.txt
data/generated/competition-links/europe-hard.txt
```

Open the required TXT, select all lines, copy them, and paste them into
OpenGuessr's **Street View URLs** field. The link order is the round order.

OpenGuessr's official creation page currently labels this field **“fixed order,
max. 20”**, so the build refuses an oversized unsplit setup. This was verified on
2026-08-07:

https://www.openguessr.com/competitions/create

## 3. Competition source format

A competition JSON is the editable source of truth. It contains its locations
but does **not** contain manually typed coordinates. A minimal file containing
only `{ "locations": [...] }` is accepted: the competition ID and display name
are then derived from its filename. For recorded experiments, adding explicit
`id`, `shortName`, and `datasetId` values is recommended so filenames, filters,
and extension sessions remain stable.

```json
{
  "$schema": "../../schema/competition.schema.json",
  "schemaVersion": "1.0",
  "datasetId": "europe-evaluation-25",
  "order": 1,
  "id": "europe-easy",
  "shortName": "Easy",
  "name": "European Evaluation — Easy",
  "description": "Easy competition scenes.",
  "splitIfNeeded": false,
  "openGuessr": {
    "roundLengthSeconds": 180,
    "duration": "2d",
    "visibility": "private",
    "restriction": "moving-allowed"
  },
  "locations": [
    {
      "id": "loc_001",
      "country": "France",
      "city_or_region": "Paris",
      "scene_type": "urban",
      "difficulty": "easy",
      "primary_clue_type": "landmark",
      "selection_notes": "Colonne de Juillet visible and a Bastille bus stop on the right.",
      "google_maps_link": "https://www.google.com/maps/@48.8521298,2.3696389,3a,75y,347.03h,90t/data=..."
    }
  ]
}
```

The build parses `google_maps_link` and derives:

- ground-truth latitude and longitude;
- starting heading, pitch, and FOV;
- panorama ID when present;
- a canonical Google Street View link;
- the coordinate used to match extension recordings after a round.

Do not add manual `groundTruth` or `startingView.viewpoint` values to source
locations. The build rejects them so that the link and ground truth cannot drift
apart.

For this evaluation dataset, every copied desktop Street View URL is normalized to a **zero starting pitch** before it is exported to OpenGuessr. In Google desktop Street View URLs, `90t` represents the level camera position, so source links intentionally use `90t` rather than deleting the tilt token. Heading, FOV, panorama ID, and coordinates remain unchanged. Run `npm run locations:zero-pitch` after replacing or adjusting any source Street View links, then rebuild with `npm run data:build`. Interactive recordings may still contain non-zero pitch later in the round when the camera is moved vertically.

Supported links include full desktop Street View URLs such as
`/maps/@LAT,LNG,3a,...`, official `map_action=pano` URLs, embed URLs, and legacy
URLs exposing `!3dLAT!4dLNG`. Short `maps.app.goo.gl` links are rejected because
the coordinates are hidden behind a redirect.

### Add another competition

Copy the template:

```powershell
Copy-Item .\data\templates\competition.template.json `
  .\data\competitions\my-new-competition.json
```

Edit the metadata and locations, then run:

```powershell
npm run data:build
npm run competition:export
```

Every JSON file under `data/competitions/` is loaded by the website and appears
in the competition filter automatically.

## 4. Install the automatic Chrome/Edge recorder

Keep `npm start` running, then:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select:

   ```text
   extension/openguessr-research-recorder
   ```

5. Pin the extension and open its popup.
6. Select the local competition (`europe-easy`, `europe-medium`, or
   `europe-hard`).
7. Enter the exact model name used by your evaluation pipeline.
8. Choose `Interactive panorama` or `Static image / NMPZ`. Use the static
   condition for OpenGuessr NMPZ rounds.
9. Keep the recorder switch enabled and press **Save setup**.
10. Press **Test collector**. It should report that the local collector is ready.
11. Open the matching OpenGuessr competition and start playing.

### No per-round start/stop is required

The extension is armed once for the selected competition. It then:

1. starts a round from a Google Street View frame **or** from the OpenGuessr
   page-level round probe;
2. records position, panorama, heading, pitch, zoom/FOV, and timestamps when the
   view is interactive;
3. records the fixed starting view, round number, duration, and guess events for
   NMPZ/static rounds even when no movement events exist;
4. watches guess submissions and result/next-round transitions;
5. saves the completed round automatically and starts the next one;
6. repeats until the expected number of competition rounds is saved.

The popup displays session progress such as `3/8`. When all expected locations
have been collected, it reports **Competition captured**.

A new recorder session is created automatically when the selected competition,
model, condition, or detected OpenGuessr competition changes. Use **Reset tab
session** before intentionally replaying an interrupted competition in the same
tab.

### Automatic output

Each prediction creates a separate file:

```text
data/recordings/inbox/
└── europe-easy/
    └── loc_001/
        └── 2026-...__gpt-5-6-sol__interactive-panorama__round-1.json
```

A live competition manifest is also updated after every saved round:

```text
data/recordings/sessions/
└── europe-easy/
    └── session-....json
```

The session manifest records the selected model/condition, expected round count,
completed rounds, output files, matched location IDs, and whether the session is
`active`, `complete`, or `closed`.

The collector performs location matching **after submission**, using the recorded
starting coordinate and only locations in the selected competition. Ground truth
is never displayed by the extension or injected into the OpenGuessr page.

### NMPZ and recovery controls

OpenGuessr NMPZ does not permit moving, panning, or zooming. Consequently there
is no movement path to record. The extension still records a valid static run:

- page and round detection;
- fixed starting camera when it can be read from an iframe/image URL;
- round start/end time;
- submitted prediction when detectable;
- result and next-round events;
- selected competition, model, condition, and round order.

If OpenGuessr hides the Street View coordinate in NMPZ, the collector matches the
round after submission by the selected competition and detected round number.
The website then recovers the fixed camera from the competition definition, so
**Open this Street View** and static playback remain available without exposing
ground truth during play.

Recovery controls in the popup:

- **Save checkpoint** writes the current live state without ending the round.
- **Download diagnostics** exports the page probe and internal recorder state.
- **Finalize round** closes and saves the current round manually.
- **Reset tab session** should only be used after preserving the active state.

If the local collector is unavailable, JSON files are downloaded to the
configured browser Downloads subfolder. A manually finalized round can have a
`null` prediction when the outgoing guess coordinate was not detected.

## 5. View a recorded test on the website

When the collector accepts a round, the server rebuilds generated data
immediately. Refresh:

```text
http://127.0.0.1:4173
```

Select the relevant competition and location. If the submitted prediction was
captured, the page automatically shows:

- ground-truth and prediction pins;
- the comparison line and Haversine error;
- the recorded exploration route for interactive rounds;
- timeline playback with heading, pitch, zoom/FOV, and panorama changes;
- fixed-view start/end playback for static/NMPZ rounds;
- key moments;
- **Open this Street View** for the current playback sample.

A raw recorder file does not contain the model's full explanation or human cue
ratings. Add those later under `data/results/`; the build merges them with the
matching recording by explicit `recordingId`, or by location + exact model name +
condition.

## 6. Repository structure

```text
geo-evidence-atlas/
├── data/
│   ├── competitions/
│   │   ├── europe-easy.json
│   │   ├── europe-medium.json
│   │   └── europe-hard.json
│   ├── results/                    # model outputs, cues, human ratings
│   ├── recordings/
│   │   ├── inbox/                  # one JSON per completed round
│   │   ├── sessions/               # one live manifest per competition run
│   │   ├── checkpoints/            # in-progress snapshots; not atlas inputs
│   │   └── rejected/
│   ├── templates/
│   └── generated/                  # generated; do not edit manually
│       ├── atlas-cases.json
│       ├── competitions.resolved.json
│       ├── locations.resolved.json
│       ├── recordings.index.json
│       └── competition-links/*.txt
├── extension/
│   └── openguessr-research-recorder/
├── scripts/
├── schema/
├── shared/
├── src/
└── tests/
```

The four data domains remain separate:

- **Competition definition:** scene metadata, order, and Google Street View links.
- **Generated location:** derived coordinates/camera state; never edited manually.
- **Recording:** raw per-round navigation or NMPZ timing and submitted prediction.
- **Checkpoint:** temporary recovery snapshot; never treated as a completed run.
- **Result:** model hypothesis, cues, human ratings, and notes.

## 7. Useful commands

```powershell
npm start
npm run competition:export
npm run competition:list
npm run data:build
npm run data:check
npm run links:inspect -- .\data\generated\competition-links\europe-easy.txt
npm run recordings:import -- .\old-session.json --competition=europe-easy --model="GPT-5.6 Sol" --condition=interactive-panorama
npm run check:extension
npm test
npm run verify
```

`npm run verify` checks all 25 links, validates the extension, builds all three
competition TXTs, and runs the automated tests—including a simulated eight-round
competition, NMPZ page detection, order-based NMPZ matching, live checkpoints,
and separate session-manifest updates.

## 8. Inspect a generated TXT

To independently derive the coordinates and camera state from a generated link
file:

```powershell
npm run links:inspect -- `
  .\data\generated\competition-links\europe-easy.txt
```

This writes `europe-easy.coordinates.json` next to the TXT.

## 9. Import an older multi-round recorder export

The earlier recorder format kept an entire session in one JSON. Split it into
one file per round with:

```powershell
npm run recordings:import -- `
  .\path\to\old-session.json `
  --competition=europe-easy `
  --model="GPT-5.6 Sol" `
  --condition=interactive-panorama
```

The importer re-bases each round's timeline, retains original sequence numbers,
and matches each starting point against the selected competition.

## 10. Verification boundary before the real pilot

The repository test suite validates URL parsing, competition partitioning,
per-round collector writes, session-manifest updates, automatic multi-round state
management, extension page-hook initialization, and the final browser data
contract. Browser QA also checks all 25 location cards, competition filtering,
searching selection notes, compact round tags, and viewport overflow.

The extension's automatic lifecycle is tested with simulated OpenGuessr, NMPZ,
and Google Street View events. OpenGuessr is still an external application whose
private request and DOM details can change, so run one short real competition
before collecting the final study data. During that pilot, press **Save
checkpoint** once in an interactive round and once in an NMPZ round, then confirm
that every completed round appears under `data/recordings/inbox/`. Keep
**Finalize round** available as the manual safety fallback.

## v0.8.4 map/statistics behavior

- In **All locations**, the map and the `Visible cases` statistic use the same scope: only locations with a real prediction for the currently selected model, condition, and filters are counted and shown.
- If the statistics drawer is open, selecting locations in the left rail keeps it open and updates it for the current map selection.
- Static/NMPZ runs never render a playback marker or direction arrow. Clicking the ground-truth `T` marker opens its details and Street View action.

## v0.8.5 static direction marker

Static/NMPZ selections retain the starting-view direction arrow on the map, but it is visual-only and cannot receive pointer events. The ground-truth `T` marker stays above it and remains the click target for opening the right-side Ground Truth details and Street View action. Static runs still do not expose playback controls or traces.


## v0.8.6 UI behavior

- Ground-truth and prediction drawers persist when moving between a selected location and **All locations**.
- The drawer keeps the last clicked T/P context in overview until explicitly closed or replaced by another pin selection.
- Static/NMPZ heading remains visible with a larger non-interactive direction arrow under the clickable ground-truth marker.
