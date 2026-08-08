# CV Final - Geo-Localization Experiment

This repository contains the benchmark data, OpenGuessr recording pipeline, visualization, and GeoCLIP baseline for the final computer-vision geo-localization project.

## Current benchmark

The benchmark contains **25 European locations** split by difficulty:

| Difficulty | Locations |
|---|---:|
| Easy | 8 |
| Medium | 9 |
| Hard | 8 |
| **Total** | **25** |

Each location is evaluated under two visual conditions:

- **Static image / NMPZ** - one canonical starting PNG; no movement, panning, or zooming.
- **Interactive panorama** - OpenGuessr exploration with movement/camera interaction, recorded as one WebM per location plus telemetry.

The repository already contains complete **manual reference runs** for Easy, Medium, and Hard in both conditions. These are demo/reference trajectories; future agent/model runs can use the same data contract and visualization.

## Repository layout

```text
repo/
├── README.md
├── demo_and_extension/
│   ├── README.md              # detailed recorder + demo workflow
│   ├── ARCHITECTURE.md        # technical data flow
│   ├── extension/             # Chrome recorder extension
│   ├── scripts/               # build, collector, inspection tools
│   ├── src/                   # visualization application
│   ├── tests/
│   └── data/
│       ├── competitions/      # location source of truth
│       ├── recordings/        # per-round JSON + session manifests
│       ├── starting-images/   # static/NMPZ canonical PNGs
│       ├── exploration-videos/# interactive per-location WebMs
│       ├── results/           # optional model annotations/results
│       └── generated/         # rebuildable demo output; do not hand-edit
└── geoclip/
    ├── README.md
    ├── geoclip_batch_eval.py
    ├── requirements.txt
    └── results/               # static GeoCLIP baseline results
```

## Location source of truth

The current location definitions live directly in:

```text
demo_and_extension/data/competitions/europe-easy.json
demo_and_extension/data/competitions/europe-medium.json
demo_and_extension/data/competitions/europe-hard.json
```

Do **not** maintain a separate root `locations.json`. Coordinates and starting camera metadata are derived from each full Google Street View URL during the build.

All current starting URLs are normalized to a level **0-degree pitch** (`90t` in the copied Google Maps URL) for reproducibility.

## Quick start: demo

Requirements: Node.js 20+ and Chrome.

```powershell
cd demo_and_extension
npm ci
npm run verify
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

`npm start` also starts the local collector used by the recorder extension. Keep it running while collecting new experiments.

For the full competition-creation, Chrome-extension installation, static recording, and interactive video-arming workflow, read:

```text
demo_and_extension/README.md
```

## Important interactive-recorder check

Interactive panorama requires a Chrome tab-capture authorization step **before pressing OpenGuessr Start**:

```text
Arm / start recorder
        ↓
extension badge = ARM
        ↓
click the recorder extension icon once
        ↓
HUD = ARMED, extension badge = VID
        ↓
press OpenGuessr Start
        ↓
when a round is recording, extension badge = REC
```

Chrome may also show its own tab-capture indicator on the OpenGuessr tab. Its appearance varies by Chrome version; the recorder HUD and `ARM`/`VID`/`REC` badge states are the primary checks.

## GeoCLIP baseline

GeoCLIP is used as a **CPU-based static-image baseline**. It has been run separately for Easy, Medium, and Hard.

See:

```text
geoclip/README.md
```

Typical commands are:

```powershell
cd geoclip
.venv\Scripts\activate
python geoclip_batch_eval.py
python geoclip_batch_eval.py --dataset europe-medium
python geoclip_batch_eval.py --dataset europe-hard
```

## Generated files

Files under `demo_and_extension/data/generated/` are build products. Do not edit them manually.

After changing competition definitions, recordings, annotations, or results, rebuild with:

```powershell
cd demo_and_extension
npm run data:build
```
