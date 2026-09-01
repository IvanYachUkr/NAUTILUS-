# CV Final - Geo-Localization Experiment

This repository contains the benchmark data, OpenGuessr recording pipeline, visualization, and static geo-localization baselines for the final computer-vision geo-localization project.

## Recorded model leaderboard

Official OpenGuessr competition points for the **interactive panorama** condition
(25 locations, 300 seconds per round). The ranking uses each model's mean over
all published complete runs; the `Runs` column makes the unequal sample count
explicit. The maximum per run is 125,000 points.

| Rank | Model | Runs | Mean Easy | Mean Medium | Mean Hard | **Mean total** | Mean max | Best run |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **1** | [Gemini 3.7 Flash (high, aided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/) | **1** | **39,999** | **43,026** | **37,004** | **120,029** | **96.0%** | **120,029** |
| **2** | [GPT-5.6 Sol (max)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/) | **3** | 39,397 | 40,515 | 31,349 | **111,260** | **89.0%** | **114,794** |
| **3** | [GPT-5.6 Sol (xhigh)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/) | **3** | 39,849 | 40,978 | 29,981 | **110,808** | **88.6%** | **114,716** |
| **4** | [Grok 4.6 (xhigh)](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/) | **3** | 24,164 | 27,757 | 23,034 | **74,955** | **60.0%** | **80,081** |
| **5** | [Gemini 3.7 Flash (high, unaided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high/) | **1** | 18,479 | 23,721 | 22,150 | **64,350** | **51.5%** | **64,350** |

### Complete run scores

| Model | Run | Easy | Medium | Hard | **Total** | Max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.7 Flash (high, aided) | [Original](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/report.md) | **39,999** | 43,026 | **37,004** | **120,029** | **96.0%** |
| GPT-5.6 Sol (max) | [Original](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/report.md) | 39,985 | 35,485 | 32,368 | **107,838** | 86.3% |
| GPT-5.6 Sol (max) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/runs/recorded-r3/) | 39,724 | **44,152** | 30,918 | **114,794** | **91.8%** |
| GPT-5.6 Sol (max) | [Recorded R4](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/runs/recorded-r4/) | 38,482 | 41,907 | 30,760 | **111,149** | 88.9% |
| GPT-5.6 Sol (xhigh) | [Original](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/report.md) | 39,745 | 40,155 | 30,373 | **110,273** | 88.2% |
| GPT-5.6 Sol (xhigh) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/runs/recorded-r2/) | 39,820 | 41,265 | 26,351 | **107,436** | 85.9% |
| GPT-5.6 Sol (xhigh) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/runs/recorded-r3/) | 39,982 | 41,514 | 33,220 | **114,716** | **91.8%** |
| Grok 4.6 (xhigh) | [Original](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/report.md) | 23,729 | 29,986 | 26,366 | **80,081** | 64.1% |
| Grok 4.6 (xhigh) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/runs/recorded-r2/) | 24,688 | 28,192 | 18,682 | **71,562** | 57.2% |
| Grok 4.6 (xhigh) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/runs/recorded-r3/) | 24,075 | 25,093 | 24,054 | **73,222** | 58.6% |
| Gemini 3.7 Flash (high, unaided) | [Recorded R1](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high/report.md) | 18,479 | 23,721 | 22,150 | **64,350** | 51.5% |

Across all published runs, **275/275 official rounds** were submitted and recorded.
The best individual totals were Easy **39,999** (Gemini aided), Medium
**44,152** (Sol max R3), Hard **37,004** (Gemini aided), and overall
**120,029** (Gemini aided). Repeated runs reuse the same fixed locations, so
their means measure run/controller variability rather than new-location
generalization.

The linked folders contain the session manifests, raw round telemetry, matched
video metadata, reports, prompts where applicable, and recovery-segment logs.
The six new repeated-run WebM sets are stored separately in the shared Drive
archive. The benchmark README discloses an 11-round recorder path-collision
caveat found by capture-ID validation; it does not change the official scores.
Static/NMPZ agent submissions are not yet included in this leaderboard.

## OpenGuessr MCP controller

The repository now includes a benchmark-safe [NAUTILUS OpenGuessr MCP](demo_and_extension/openguessr-mcp/).
It layers four precise OpenGuessr actions over Microsoft Playwright MCP while
retaining only screenshot and physical mouse/keyboard controls. The adapter
places coordinates chosen by the model, verifies the rendered Leaflet marker,
and refuses unverified submissions without exposing correct-location or
network data.

MCP-assisted results are a separate **coordinate-actuator MCP** condition and
must not be merged into the raw-GUI leaderboard above. This separation makes
it possible to measure geographic reasoning with substantially less
belief-to-pin controller noise while preserving the original computer-use
benchmark.

### Grok MCP-assisted results

| Dataset / prompt | Valid runs | Rounds per run | Seconds per round | Mean official score | Mean max |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Easy — earlier one-pin condition](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-assisted/) | 3 | 8 | 180 | **39,873.67 / 40,000** | **99.68%** |
| [Medium — one-shot control](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-one-shot/) | 3 | 9 | 300 | **35,740 / 45,000** | **79.42%** |
| [Hard — one-shot control](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-one-shot/) | 3 | 8 | 300 | **29,412 / 40,000** | **73.53%** |

The Medium/Hard prompt was chosen by a same-scenes Medium diagnostic: the
one-shot control scored **36,973**, versus **35,412** with progressive pin
refinement. Easy was not rerun with the 300-second one-shot prompt, so these
three rows are separate per-difficulty results and must not be combined into a
single 25-round score.

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
