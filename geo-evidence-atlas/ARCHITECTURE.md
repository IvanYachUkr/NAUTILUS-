# Architecture

## Objective

The web visualization is a reader, not the source of experimental truth. Editable
competition definitions, raw model telemetry, and explanation annotations remain
separate and are compiled into the browser contract.

## Source domains

### `data/competitions/`

Primary source files. Each JSON defines one OpenGuessr competition and embeds its
ordered location metadata plus full Google Street View URLs. Coordinates and
camera state are deliberately absent and are derived during the build.

The current dataset is partitioned into `europe-easy`, `europe-medium`, and
`europe-hard`. Each file is independently pasteable into OpenGuessr and also
becomes a website filter.

### `data/locations/`

Optional legacy format for reusable location definitions referenced by ID. The
current 25-location workflow does not require it; embedded competition locations
are preferred because they match the files the team exchanges.

### `data/results/`

Model hypothesis, final pin, reported cues, human ratings, and notes. This domain
is independent from raw recorder telemetry.

### `data/recordings/inbox/`

One extension-produced JSON per OpenGuessr round. The local collector enriches it
with the matched generated location and competition round after submission.

### `data/recordings/sessions/`

A live manifest for each full competition run. It is overwritten after every
accepted round and records progress, output paths, matched location IDs, and final
session status.

## Build pipeline

`scripts/build-data.mjs`:

1. reads every competition JSON;
2. parses all full Google Street View links;
3. derives ground truth, heading, pitch, FOV, panorama ID, and canonical URL;
4. validates unique IDs, difficulty values, ordering, and the 20-link limit;
5. writes one fixed-order TXT per OpenGuessr competition;
6. indexes accepted per-round recordings;
7. merges recordings with model result/annotation files;
8. validates the final atlas data contract;
9. writes rebuildable outputs to `data/generated/`.

## Runtime server and collector

`scripts/serve.mjs` is a zero-dependency HTTP server exposing:

- `GET /api/health`
- `POST /api/recordings`
- `POST /api/sessions`

The round endpoint validates the payload, restricts matching to the selected
competition, finds the nearest URL-derived starting coordinate, saves one file,
and rebuilds the website data. The session endpoint atomically updates the
competition manifest.

## Recorder extension

The Manifest V3 extension has four layers:

1. a main-world OpenGuessr hook observes guess intent, outgoing
   fetch/XHR/WebSocket/beacon bodies, result controls, route changes, and
   next-round intent;
2. an isolated content relay passes sanitized events to the extension worker;
3. a main-world Google Maps frame hook wraps `StreetViewPanorama` and records
   position, POV, zoom/FOV, and panorama changes;
4. the service worker manages one automatic competition session per tab,
   persists state in `chrome.storage.session`, finalizes each round, posts it to
   the collector, and updates the session manifest.

A round starts on the first valid Street View spawn. It is saved on a detected
prediction/result/advance, or when a new Street View frame replaces it. The next
spawn starts the next round without user interaction.

Ground truth is never returned to the active game page or shown in the extension.

## Browser application

`src/main.js` loads `data/generated/atlas-cases.json`. The application handles:

- all-locations overview;
- competition/country/difficulty/scene/model/condition filters;
- compact competition/round tags;
- selected-location truth/prediction comparison;
- in-flow right-side details and statistics;
- exploration route and time-based camera playback;
- Google Street View deep links at every playback sample;
- public JavaScript and iframe APIs.

## Failure behavior

- Invalid source fields fail the build with file/index-specific messages.
- Short Google links fail because no coordinate is embedded.
- Oversized competitions fail unless deterministic splitting is enabled.
- Invalid recorder payloads are rejected before writing.
- Collector unavailability triggers an optional per-round browser download.
- A manual finalize control protects against future OpenGuessr UI/API changes.
- Sessions remain `active` rather than falsely `complete` if the expected round
  count was not reached.
