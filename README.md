# CV Final - Geo-Localization Experiment

This repository contains the benchmark data, OpenGuessr recording pipeline, visualization, interactive-agent evaluation evidence, and static geo-localization baselines for the final computer-vision geo-localization project.

The [published NAUTILUS website](https://nautilus-geolocation.ivanukr.chatgpt.site/) is developed in [`demo_and_extension/`](demo_and_extension/). See [local website development](#local-website-development) to run it and contribute changes.

## Recorded model leaderboard

Recorded OpenGuessr competition points for the **interactive panorama** condition (25 locations total). The leaderboard includes every published controller condition. Complete 25-round conditions use their mean across full runs; the clearly labelled Grok MCP composite sums its separate Easy, Medium, and Hard three-run means. The maximum aggregate is 125,000 points.

| Rank | Model | Runs | Mean Easy | Mean Medium | Mean Hard | **Mean total** | Mean max | Best run |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **1** | [Gemini 3.8 Flash (high, aided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-high-aided/) | **3** | 39,985 | 43,445 | **36,961** | **120,391** | **96.3%** | 120,919 |
| **2** | [Gemini 3.7 Flash (high, aided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/) | **3** | 39,984 | 43,453 | 36,766 | **120,203** | 96.2% | 120,624 |
| **3** | [Gemini 3.7 Flash (medium, aided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-medium-aided/) | **3** | **39,996** | 43,250 | 36,907 | **120,153** | 96.1% | **121,492** |
| **4** | [Gemini 3.8 Flash (medium, aided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-medium-aided/) | **3** | 39,986 | 42,813 | 37,005 | **119,804** | 95.8% | 120,677 |
| **5** | [GPT-6 Astra (low)](demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low/) | **3** | 39,998 | **44,119** | 35,129 | **119,246** | 95.4% | 119,818 |
| **6** | [GPT-5.6 Sol (max)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-max/) | **3** | 39,397 | 40,515 | 31,349 | **111,260** | 89.0% | 114,794 |
| **7** | [GLM-5.3-Flash (Max) + MCP](demo_and_extension/data/recorded-agent-benchmark/glm-5.3-flash-max/) | **3** | 39,876 | 40,132 | 30,972 | **110,980** | 88.8% | 113,530 |
| **8** | [GPT-5.6 Sol (xhigh)](demo_and_extension/data/recorded-agent-benchmark/gpt-5.6-sol-xhigh/) | **3** | 39,849 | 40,978 | 29,981 | **110,808** | 88.6% | 114,716 |
| **9** | [Grok 4.6 (xhigh)](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/) + [MCP](demo_and_extension/openguessr-mcp/) (composite) | **3** | [39,874](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-assisted/) | [35,740](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-one-shot/) | [29,412](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-one-shot/) | **105,026** | 84.0% | — |
| **10** | [Grok 4.6 (xhigh, raw GUI)](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/) | **3** | 24,164 | 27,757 | 23,034 | **74,955** | 60.0% | 80,081 |
| **11** | [Gemini 3.7 Flash (high, unaided)](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high/) | **1** | 18,479 | 23,721 | 22,150 | **64,350** | 51.5% | 64,350 |

The Grok MCP row is a composite of **75 completed scored rounds** across nine valid difficulty-specific games, rather than a synthetic claim that one 25-round game was played. Easy used 180 seconds per round; Medium and Hard used 300 seconds. Each linked score opens its underlying summaries and run evidence.

Astra low uses 300 seconds per round. Run 1 Hard and Run 3 Medium combine verified completed rounds with remaining-round continuations after interruptions. Its [score provenance and exclusions](demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low/) are explicit; all Astra videos remain local and no Astra files were uploaded to Google Drive.

GLM ran through ZCode at Max reasoning with the screenshot-only coordinate MCP. Its ranked result averages **three completed 25-round evaluations**. Run 2 resumed after the overnight cutoff; Run 3 Easy combines seven preserved results with a one-location continuation, and its final Medium result was recovered after a transport failure. [All 75 scores, provenance, and exclusions](demo_and_extension/data/recorded-agent-benchmark/glm-5.3-flash-max/) are published with image hashes. Image compression, unsuccessful panorama drags, and recording gaps are disclosed there. GLM media and raw chats remain local, with no Drive upload.

### Complete 25-round run scores

| Model | Run | Easy | Medium | Hard | **Total** | Max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.7 Flash (medium, aided) | [Original](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-medium-aided/report.md) | 39,988 | 44,105 | 37,170 | **121,264** | 97.0% |
| Gemini 3.7 Flash (medium, aided) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-medium-aided/runs/recorded-r2/) | **40,000** | 42,320 | 35,382 | **117,702** | 94.2% |
| Gemini 3.7 Flash (medium, aided) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-medium-aided/runs/recorded-r3/) | **40,000** | 43,324 | **38,168** | **121,492** | **97.2%** |
| Gemini 3.7 Flash (high, aided) | [Original](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/report.md) | 39,999 | 43,026 | 37,004 | **120,029** | 96.0% |
| Gemini 3.7 Flash (high, aided) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/runs/recorded-r2/) | 39,988 | **44,011** | 36,625 | **120,624** | 96.5% |
| Gemini 3.7 Flash (high, aided) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gemini-3.7-flash-high-aided/runs/recorded-r3/) | 39,964 | 43,323 | 36,668 | **119,955** | 96.0% |
| Gemini 3.8 Flash (high, aided) | [Recorded R1](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-high-aided/) | 39,985 | 43,872 | 37,062 | **120,919** | 96.7% |
| Gemini 3.8 Flash (high, aided) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-high-aided/runs/recorded-r2/) | **39,986** | 43,233 | 36,731 | **119,950** | 96.0% |
| Gemini 3.8 Flash (high, aided) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-high-aided/runs/recorded-r3/) | 39,984 | 43,229 | **37,089** | **120,302** | 96.2% |
| Gemini 3.8 Flash (medium, aided) | [Recorded R1](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-medium-aided/) | 39,977 | 41,933 | 37,151 | **119,061** | 95.2% |
| Gemini 3.8 Flash (medium, aided) | [Recorded R2](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-medium-aided/runs/recorded-r2/) | 39,997 | 42,649 | 37,027 | **119,673** | 95.7% |
| Gemini 3.8 Flash (medium, aided) | [Recorded R3](demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-medium-aided/runs/recorded-r3/) | 39,984 | **43,857** | 36,836 | **120,677** | 96.5% |
| GPT-6 Astra (low) | [Run 1](demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low/reports/NAUTILUS_ASTRA_LOW_RUN_20260906.md) | 39,997 | 44,189 | 34,974 | **119,160** | 95.3% |
| GPT-6 Astra (low) | [Run 2](demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low/reports/NAUTILUS_ASTRA_LOW_RUN2_20260907.md) | 39,998 | **44,686** | 35,134 | **119,818** | 95.9% |
| GPT-6 Astra (low) | [Run 3](demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low/reports/NAUTILUS_ASTRA_LOW_RUN3_20260907.md) | 39,998 | 43,482 | 35,279 | **118,759** | 95.0% |
| GLM-5.3-Flash (Max) + MCP | [Run 1](demo_and_extension/data/recorded-agent-benchmark/glm-5.3-flash-max/#run-1-individual-scores) | 39,773 | 41,229 | 30,159 | **111,161** | 88.9% |
| GLM-5.3-Flash (Max) + MCP | [Run 2 (resumed)](demo_and_extension/data/recorded-agent-benchmark/glm-5.3-flash-max/#run-2-individual-scores) | 39,900 | 41,142 | 32,488 | **113,530** | 90.8% |
| GLM-5.3-Flash (Max) + MCP | [Run 3 (resumed)](demo_and_extension/data/recorded-agent-benchmark/glm-5.3-flash-max/#run-3-individual-scores) | 39,954 | 38,026 | 30,269 | **108,249** | 86.6% |
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

Across all published runs, **550 official rounds** were submitted and recorded (including Astra and GLM continuation composites). The best individual totals were Easy **40,000** (Gemini medium R2/R3), Medium **44,686** (Astra low R2), Hard **38,168** (Gemini medium R3), and overall **121,492** (Gemini medium R3). Repeated runs reuse the same fixed locations, so
their means measure run/controller variability rather than new-location
generalization.

The linked folders contain the session manifests, raw round telemetry, matched video metadata, reports, prompts where applicable, and recovery-segment logs.

The six earlier Sol/Grok repeated-run WebM sets are stored separately in the shared Drive archive. The benchmark README discloses an 11-round recorder path-collision caveat found by capture-ID validation; it does not change the official scores.

Static/NMPZ agent submissions are not yet included in this leaderboard.

### Interactive distance analysis

In addition to OpenGuessr points, the repository contains an independent kilometer-distance analysis under [`analysis/`](analysis/).

Distances are not derived from OpenGuessr points.

Distance provenance is:

- **Recorder-backed runs:** final submitted prediction coordinates are read from the published round JSON and WGS84 geodesic error is recomputed against the canonical competition ground truth.
- **GLM-5.3-Flash Max:** exact verified MCP pin coordinates are extracted from the raw GLM chat evidence and WGS84 geodesic error is recomputed from those coordinates. The compact derived evidence contains 75 final predictions: 73 successful submitted pins and 2 verified pins preserved after submit failure.
- **GPT-6 Astra low:** authoritative prediction coordinates are not available in the published repository evidence, so verified OpenGuessr result-screen distances are used instead.

The analysis pipeline is:

```text
published recorder JSONs
        +
GLM verified MCP prediction coordinates
        +
Astra verified displayed result distances
        ↓
analysis/calculate_agent_distance_stats.py
        ↓
per-round and aggregate kilometer statistics
```

Run it from the repository root with:

```powershell
python .\analysis\calculate_agent_distance_stats.py
```

GLM coordinate evidence can be regenerated from the raw chat archive with:

```powershell
python .\analysis\extract_glm_final_predictions.py `
  .\nautilus-glm-chats-runs-1-to-3-20260908.zip `
  --output .\analysis\evidence\glm_final_predictions.csv
```

The raw evidence ZIP is intentionally not required for normal analysis and should remain outside ordinary Git history. Root-level ZIP archives are ignored by Git.

Generated analysis files are stored under:

```text
analysis/agent_distances/
├── agent_distance_rounds.csv
├── agent_distance_stats_by_dataset.csv
├── agent_distance_stats_overall.csv
├── agent_distance_stats_by_condition.csv
├── agent_distance_issues.csv
└── agent_distance_summary.json
```

The current coverage check is:

```text
Coordinate-recomputed recorder rounds: 275
GLM verified-coordinate rounds:         75
Astra displayed-distance rounds:        75
Total scored rounds:                   425
Complete 25-round series:               17
```

### OpenGuessr MCP source and evidence

The benchmark-safe [NAUTILUS OpenGuessr MCP](demo_and_extension/openguessr-mcp/) contains its source, launcher, exact Grok prompts, tests, and usage documentation.

It places and verifies coordinates chosen by the model without exposing the correct location, network data, or hidden target coordinates. The full [Easy evidence](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-assisted/) and [Medium/Hard evidence](demo_and_extension/data/recorded-agent-benchmark/grok-4.6-xhigh/mcp-one-shot/) include individual scores, transcripts, actuator audits, official result images, excluded attempts, and the Medium refinement diagnostic.

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

For static-image geo-localization, the repository currently contains four baseline pipelines:

- **GeoCLIP** - direct image-to-coordinate baseline.
- **SALAD + OSV-5M** - image-retrieval baseline using SALAD descriptors and a Europe-only OSV-5M reference database.
- **PLONK OSV-5M** - pretrained image geo-localization baseline evaluated directly on the canonical starting images.
- **Chipoint v2** - three-tower fused-retrieval baseline using the official precomputed OSV-5M galleries and cluster-consensus prediction.

### Static-image baseline results

The following table compares the completed static-image baselines on the same 25 canonical starting images. Values are **mean / median geodesic error of each baseline's final prediction in kilometers**, so lower is better. Overall values are calculated across all 25 locations.

| Model | Easy mean / median | Medium mean / median | Hard mean / median | Overall mean / median | Overall range | Within 200 km |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **PLONK OSV-5M** | 864.5 / 130.2 km | **197.7 / 165.8 km** | **481.2 / 390.7 km** | **501.8 / 167.8 km** | 2.9 - 6007.8 km | **56%** |
| **Chipoint v2** | **431.6 / 91.7 km** | 254.8 / 270.3 km | 957.4 / 1161.0 km | 536.2 / 312.1 km | 4.8 - 2258.6 km | 32% |
| **GeoCLIP** | 1141.9 / 115.1 km | 212.5 / 170.0 km | 2317.0 / 959.4 km | 1183.3 / 224.2 km | 0.1 - 11890.9 km | 44% |
| **SALAD + OSV-5M** | 1215.6 / 993.0 km | 531.8 / 232.8 km | 2275.2 / 1510.4 km | 1308.5 / 929.2 km | 0.004 - 7528.0 km | 20% |

All models use the same benchmark locations and canonical starting images. See the individual baseline folders for additional metrics, per-location predictions, implementation details, and runtime information.

### Static baselines in the website

The four static baselines are also integrated into the local/published visualization.

The model selector is divided into:

```text
MLLM agents
  ...interactive agent runs...

Static baselines
  GeoCLIP
  SALAD + OSV-5M
  PLONK OSV-5M
  Chipoint v2
```

Selecting a static baseline automatically forces the `static-image` condition and disables the condition selector for that baseline. The prediction is visualized with the same truth/prediction globe and map logic used for the interactive runs.

The website uses the same final prediction that is used in the static baseline evaluation:

- **GeoCLIP:** direct final prediction.
- **SALAD + OSV-5M:** top-1 retrieval prediction.
- **PLONK OSV-5M:** final model prediction.
- **Chipoint v2:** final cluster-consensus prediction.

The baseline CSV result files remain the source of truth. During a normal data build they are converted into website result JSONs under:

```text
demo_and_extension/data/results/static-baselines/
```

The generated JSON files contain four prediction runs for each of the 25 benchmark locations.

## Repository layout

```text
repo/
├── README.md
├── analysis/
│   ├── calculate_agent_distance_stats.py
│   ├── extract_glm_final_predictions.py
│   ├── evidence/
│   │   └── glm_final_predictions.csv
│   └── agent_distances/
│       ├── agent_distance_rounds.csv
│       ├── agent_distance_stats_by_dataset.csv
│       ├── agent_distance_stats_overall.csv
│       ├── agent_distance_stats_by_condition.csv
│       ├── agent_distance_issues.csv
│       └── agent_distance_summary.json
├── demo_and_extension/
│   ├── README.md              # detailed recorder + demo workflow
│   ├── ARCHITECTURE.md        # technical data flow
│   ├── extension/             # Chrome recorder extension
│   ├── openguessr-mcp/        # MCP controller, prompts, launcher, and tests
│   ├── scripts/               # build, collector, inspection tools
│   ├── src/                   # visualization application
│   ├── tests/
│   └── data/
│       ├── competitions/      # location source of truth
│       ├── recordings/       # per-round JSON + session manifests
│       ├── starting-images/   # static/NMPZ canonical PNGs
│       ├── exploration-videos/# interactive per-location WebMs
│       ├── recorded-agent-benchmark/ # curated non-video agent-run evidence
│       ├── results/           # optional model annotations/results
│       │   └── static-baselines/      # generated static baseline prediction runs
│       └── generated/         # rebuildable demo output; do not hand-edit
├── geoclip/
│   ├── README.md
│   ├── geoclip_batch_eval.py
│   ├── requirements.txt
│   └── results/               # static GeoCLIP baseline results
├── salad/
│   ├── README.md
│   ├── prepare_osv5m_europe.py
│   ├── build_salad_reference_embeddings.py
│   ├── build_salad_ivfflat_index.py
│   ├── salad_batch_eval.py
│   ├── requirements_extra.txt
│   ├── results/               # static SALAD baseline results
│   └── osv-5m_europe/         # local generated OSV/SALAD data; ignored by Git
├── plonk/
│   ├── README.md
│   ├── plonk_batch_eval.py
│   ├── requirements.txt
│   └── results/               # static PLONK baseline results
└── chipointv2/
    ├── README.md
    ├── chipointv2_local_batch_eval.py
    ├── requirements.txt
    └── results/               # static Chipoint v2 baseline results
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

## Local website development

Requirements: Git, Node.js 20+, and a browser. Chrome and the recorder extension are only needed when collecting experiments. Viewing and developing the website locally needs no GPT Sites access or API keys.

```sh
git clone https://github.com/IvanYachUkr/NAUTILUS-.git
cd NAUTILUS-/demo_and_extension

npm ci
npm ci --prefix openguessr-mcp

npm run verify
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Keep the terminal running, edit files under `demo_and_extension/src/`, and refresh the browser to see changes.

The project data build now refreshes the static baseline website data before building the normal atlas data:

```text
baseline result CSVs
        ↓
scripts/import-static-baselines.mjs
        ↓
data/results/static-baselines/
        ↓
scripts/build-data.mjs
        ↓
data/generated/
```

Normal project commands use this integrated build path, so the static baseline importer does not need to be run manually.

To regenerate only the static baseline result JSONs:

```sh
npm run data:baselines
```

To rebuild the project data:

```sh
npm run data:build
```

Before sharing a change, run:

```sh
npm run verify
npm run build:site
```

The build writes the GPT Sites deployment output to `demo_and_extension/dist/`. It does not publish anything. The source matches the published site's globe, model selector, and project story; local development uses the repository's original PNG images, while the current hosted version uses compressed WebP copies.

The website presents the original interactive prediction runs under the **MLLM agents** selector group and the four static computer-vision baselines under **Static baselines**. Later interactive reruns and other controller conditions remain in the repository and the leaderboard above; they are not combined into the website's original-run scores or prediction pins.

Create a branch for your changes and open a pull request against `main`. Friends without repository write access can fork it and submit a pull request from their fork. Keep real predictions, ground truth, and benchmark provenance intact, and regenerate `data/generated/` with the build commands instead of editing it manually.

After review and local verification, merge the changes and publish the approved build to the existing Nautilus GPT Site through the owner's account. Git pushes do not deploy the Site automatically; `.openai/hosting.json` identifies the existing Site and contains no deployment credentials.

`npm start` also starts the local collector used by the recorder extension. For experiment recording and the complete data workflow, read [`demo_and_extension/README.md`](demo_and_extension/README.md).

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

Chrome may also show its own tab-capture indicator on the OpenGuessr tab. Its appearance varies by Chrome version; the recorder HUD and `ARM` / `VID` / `REC` badge states are the primary checks.

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

Results are stored under:

```text
geoclip/results/
```

## PLONK OSV-5M baseline

PLONK is used as a pretrained static-image geo-localization baseline using the `nicolas-dufour/PLONK_OSV_5M` model. The current evaluator runs on CPU.

See:

```text
plonk/README.md
```

Run the three benchmark splits with:

```powershell
cd plonk

.venv\Scripts\activate

python plonk_batch_eval.py
python plonk_batch_eval.py --dataset europe-medium
python plonk_batch_eval.py --dataset europe-hard
```

Results are stored under:

```text
plonk/results/
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

The published benchmark configuration is:

```text
Index type:      IVF-Flat
nlist:           1024
training sample: 40000 reference descriptors
nprobe:          64
top-k:           5
```

IVF-Flat keeps the original float32 descriptors and accelerates retrieval by searching only a subset of coarse clusters. The published result files use `nprobe = 64`; lower values such as 32 can be used when trading recall for faster retrieval.

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

## Chipoint v2 baseline

Chipoint v2 is used as a local fused-retrieval baseline. It combines three image encoders with the official precomputed OSV-5M street-view galleries and applies candidate fusion followed by cluster-consensus prediction.

The local implementation uses the public Chipoint v2 retrieval pipeline with the unpublished reranker disabled.

See:

```text
chipointv2/README.md
```

Run the three benchmark splits with:

```powershell
cd chipointv2

.venv\Scripts\activate

python chipointv2_local_batch_eval.py
python chipointv2_local_batch_eval.py --dataset europe-medium
python chipointv2_local_batch_eval.py --dataset europe-hard
```

Results are stored under:

```text
chipointv2/results/
```

## Large generated data

Large downloaded and generated baseline artifacts are **not stored in Git**.

Examples include:

```text
.venv/

geoclip/.venv/
geoclip/.cache/

plonk/.venv/
plonk/.cache/

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

chipointv2/.venv/
chipointv2/.cache/
```

Raw evidence ZIP archives are also intentionally kept out of ordinary Git history. Root-level `*.zip` files are ignored; compact derived evidence such as `analysis/evidence/glm_final_predictions.csv` can be committed instead.

These directories and archives can contain many gigabytes of data and are generated, downloaded, or retained locally when reproducing the corresponding pipelines.

The Git repository should contain the **code, configuration, benchmark definitions, documentation, compact evidence, and evaluation results**, but not the full reference-image, descriptor, model-cache, gallery, or raw archive databases.

## Generated demo files

Files under:

```text
demo_and_extension/data/generated/
```

are build products. Do not edit them manually.

Static baseline website runs under:

```text
demo_and_extension/data/results/static-baselines/
```

are also generated from the committed baseline result CSVs. Regenerate project data with:

```powershell
cd demo_and_extension

npm run data:build
```

To regenerate only the static baseline result JSONs:

```powershell
npm run data:baselines
```
