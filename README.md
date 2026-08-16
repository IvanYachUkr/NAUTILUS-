# CV Final - Geo-Localization Experiment

This repository contains the benchmark data, OpenGuessr recording pipeline, visualization, and static geo-localization baselines for the final computer-vision geo-localization project.

## Recorded model leaderboard

Official OpenGuessr competition points for the **interactive panorama** condition
(25 locations, 300 seconds per round). The maximum possible score is 125,000.

| Rank | Model | Easy (8 / 40k) | Medium (9 / 45k) | Hard (8 / 40k) | **Total (25 / 125k)** | Max |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| **1** | [GPT-5.6 Sol (xhigh)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/) | 39,745 | **40,155** | 30,373 | **110,273** | **88.2%** |
| **2** | [GPT-5.6 Sol (max)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/) | **39,985** | 35,485 | **32,368** | **107,838** | **86.3%** |
| **3** | [Grok 4.6 (xhigh)](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/) | 23,729 | 29,986 | 26,366 | **80,081** | **64.1%** |

All entries completed 25/25 rounds. The linked folders contain the canonical
round telemetry, session manifests, video metadata, and detailed run reports;
WebM recordings are stored separately. Static/NMPZ agent submissions are not
yet included in this leaderboard.

## Current benchmark

The benchmark contains **25 European locations** split by difficulty:

| Difficulty | Locations |
| ---------- | --------: |
| Easy       |         8 |
| Medium     |         9 |
| Hard       |         8 |
| **Total**  |    **25** |

Each location is evaluated under two visual conditions:

- **Static image / NMPZ** - one canonical starting PNG; no movement, panning, or zooming.
- **Interactive panorama** - OpenGuessr exploration with movement/camera interaction, recorded as one WebM per location plus telemetry.

The repository already contains complete **manual reference runs** for Easy, Medium, and Hard in both conditions. These are demo/reference trajectories; future agent/model runs can use the same data contract and visualization.

For static-image geo-localization, the repository currently contains two baseline pipelines:

- **GeoCLIP** - direct image-to-coordinate baseline.
- **SALAD + OSV-5M** - image-retrieval baseline using SALAD descriptors and a Europe-only OSV-5M reference database.

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
│       ├── recorded-agent-benchmark/ # curated non-video agent-run evidence
│       ├── results/           # optional model annotations/results
│       └── generated/         # rebuildable demo output; do not hand-edit
├── geoclip/
│   ├── README.md
│   ├── geoclip_batch_eval.py
│   ├── requirements.txt
│   └── results/               # static GeoCLIP baseline results
└── salad/
    ├── README.md
    ├── prepare_osv5m_europe_two_stage_fixed.py
    ├── build_salad_reference_embeddings.py
    ├── build_salad_ivfflat_index.py
    ├── salad_batch_eval.py
    ├── requirements_extra.txt
    ├── results/               # static SALAD baseline results
    └── osv-5m_europe/         # local generated OSV/SALAD data; large files ignored by Git
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

## SALAD + OSV-5M baseline

SALAD is used as a **visual place-recognition / image-retrieval baseline**.

The pipeline is:

```text
OpenGuessr static image
        ↓
SALAD descriptor
        ↓
Europe-only OSV-5M reference descriptors
        ↓
IVF-Flat nearest-neighbor retrieval
        ↓
matched reference coordinates
        ↓
geodesic localization metrics
```

The reference database contains approximately **2.17 million European OSV-5M images**.

SALAD descriptors have dimension **8448** and are stored locally in float32 when building the reference database.

The maintained search configuration is:

```text
Index type:      IVF-Flat
nlist:           4096
training sample: 160000 reference descriptors
nprobe:          64
top-k:           5
```

The IVF index keeps the original float32 descriptors and accelerates retrieval by searching only a subset of coarse clusters.

On Windows, the project uses a custom disk-backed IVF layout instead of FAISS `OnDiskInvertedLists`.

The generated index contains:

```text
salad/osv-5m_europe/salad_ivfflat/
├── trained_ivfflat.faiss
├── centroids.npy
├── offsets.npy
├── ids.dat
├── vectors.dat
└── index_info.json
```

These large generated files are intentionally excluded from Git.

See:

```text
salad/README.md
```

for the full download, preparation, descriptor-generation, indexing, and evaluation workflow.

### SALAD evaluation

After the OSV-5M reference descriptors and IVF index have been generated locally:

```powershell
cd salad
.venv\Scripts\activate
```

Run Easy:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-easy `
  --index ivfflat `
  --nprobe 64 `
  --top-k 5
```

Run Medium:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-medium `
  --index ivfflat `
  --nprobe 64 `
  --top-k 5
```

Run Hard:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-hard `
  --index ivfflat `
  --nprobe 64 `
  --top-k 5
```

The corresponding CSV and JSON summaries are stored under:

```text
salad/results/
```

The current benchmark contains:

```text
Easy:    8 locations
Medium:  9 locations
Hard:    8 locations
Total:  25 locations
```

The manually assigned OpenGuessr difficulty does not necessarily correspond directly to SALAD retrieval difficulty because SALAD depends on visual similarity and OSV-5M reference coverage rather than human-recognizable clue difficulty.

## Large generated data

Large downloaded and generated SALAD / OSV-5M artifacts are **not stored in Git**.

Examples include:

```text
salad/.venv/
salad/.torch_cache/
salad/osv-5m_zips/

salad/osv-5m_europe/images/
salad/osv-5m_europe/train/
salad/osv-5m_europe/test/
salad/osv-5m_europe/raw_metadata/
salad/osv-5m_europe/metadata/
salad/osv-5m_europe/salad_embeddings_fp32/
salad/osv-5m_europe/salad_ivfflat/
```

These directories can contain many gigabytes of data and are generated or downloaded locally when reproducing the SALAD pipeline.

The Git repository should contain the **code, configuration, benchmark definitions, documentation, and evaluation results**, but not the full reference-image or descriptor databases.

## Generated demo files

Files under:

```text
demo_and_extension/data/generated/
```

are build products. Do not edit them manually.

After changing competition definitions, recordings, annotations, or results, rebuild with:

```powershell
cd demo_and_extension
npm run data:build
```
