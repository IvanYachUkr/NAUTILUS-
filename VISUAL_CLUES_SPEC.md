# Visual Clue Highlighting — Full Specification

**Goal**: For each location in the benchmark, show which visual features each model used to make its guess — with bounding-box highlights on the static image and tooltips describing what the model said about each feature. Optionally seekable to the exact panorama heading where the model saw it.

---

## 1. Current State

### 1.1 Schema — already exists

The `geo-evidence-atlas.schema.json` schema already defines a `cues[]` array on every run:

```json
{
  "id": "cue-easy-loc002-r1-gemini37h-01",
  "text": "U-Bahn entrance sign reading 'U Alexanderplatz'",
  "label": "Alexanderplatz U-Bahn entrance",
  "description": "Recognized as the entrance to the U-Bahn station Alexanderplatz in central Berlin",
  "source": "panorama",
  "region": { "x": 0.31, "y": 0.58, "w": 0.18, "h": 0.09 },
  "evidenceView": {
    "viewpoint": { "lat": 52.521, "lng": 13.413 },
    "heading": 200, "pitch": -5, "fov": 75
  },
  "ratings": { "visible": true, "correct": true, "useful": true }
}
```

The `cues[]` field contains the reviewed clue text, region annotations, and ratings
that have already passed through the review tool. Run reports remain the provenance
source for extracted clue text.

### 1.2 Report / clue text coverage

| Run | Report file | Rounds | Clue bullets | Format |
|---|---|---|---|---|
| Gemini 3.7/3.8 Flash | `data/recorded-agent-benchmark/<model>/runs/run-N/report.md` | 25 each | varies | Markdown reports |
| GPT-5.6 Sol (max/xhigh) | `data/recorded-agent-benchmark/<model>/runs/run-N/report.md` | 25 each | ~125 each | Markdown reports |
| GPT-6 Astra (low) | `data/recorded-agent-benchmark/gpt-6-astra-low/runs/run-N/report.md` | 25 each | ~100 each | Prose per round |
| Grok 4.6 (xhigh) | `data/recorded-agent-benchmark/grok-4.6-xhigh/runs/run-N/` | 25 each | ~80 each | Reports and transcripts |
| GLM-5.3-Flash | `data/recorded-agent-benchmark/glm-5.3-flash-max/runs/run-N/conversation.json` | 25 each | ~60 each | Chat logs |

**Total parseable clue bullets right now (Gemini runs only): ~819**
**Target for full pipeline (all models, best run per model): ~1,500–2,000 clue texts → annotation boxes**

### 1.3 Static images — the annotation targets

```
demo_and_extension/data/starting-images/
├── europe-easy/    # 8 PNGs, loc-001 … loc-008
├── europe-medium/  # 9 PNGs, loc-009 … loc-017
└── europe-hard/    # 8 PNGs, loc-018 … loc-025
```

25 unique images. Multiple models reference the same image with different clue sets.

### 1.4 Legacy source evidence

```
moreData/
├── backup_gemini/*.png                            # legacy screen captures
└── nautilus-other-model-decision-notes-20260908/
│   └── models/
│       ├── gemini-3.7-flash-high/                 # reasoning_details.md + report.md
│       ├── gemini-3.7-flash-high-aided/           # report.md
│       ├── gpt-5.6-sol-max/                       # multiple run reports + raw decision notes
│       ├── gpt-5.6-sol-xhigh/                     # multiple run reports
│       ├── gpt-6-astra-low/                       # 3 run reports
│       ├── grok-4.6-xhigh/                        # transcripts + shell logs
│       ├── grok-4.6-high/
│       └── grok-4.6-low/
```

Canonical reports, conversations, predictions, and covered-image runs are kept
with their model under `data/recorded-agent-benchmark/`. The remaining
`moreData/` material is legacy source evidence, not an input to the website build.

---

## 2. Pipeline: Text → Region → JSON

### Step A — Clue text extraction (scripting)

**Input**: Report markdown files  
**Output**: `data/clues/<location-id>.json` — one file per location, keyed by model+run

```json
{
  "europe-easy--loc-002": {
    "gemini-3.7-flash-high-aided-r2": [
      {
        "label": "Berlin TV Tower",
        "text": "Berliner Fernsehturm (Berlin TV Tower) — 368m tower directly visible behind the plaza",
        "source": "panorama",
        "category": "landmark"
      },
      {
        "label": "U Alexanderplatz sign",
        "text": "Large blue U-Bahn cube sign clearly reading 'U Alexanderplatz'",
        "source": "panorama",
        "category": "signage"
      }
    ]
  }
}
```

**Parsing strategy per format**:

| Format | Extraction rule | Label extraction |
|---|---|---|
| `- **Visual Clues**: ...` + sub-list | Lines under `### Round N` matching `^\s*\d+\.\s+` | Strip `*ItalicLabel*:` as label |
| `1. *Label*: description` | Same regex | `*...*:` → label |
| `**Bold Label**: description` | `\*\*([^*]+)\*\*:\s*(.+)` | bold text → label |
| Prose transcript (Grok, Astra) | LLM call per round block | LLM-assigned |
| GLM MCP screenshots | LLM call on screenshot caption turns | LLM-assigned |

For all Gemini reports a regex script extracts ~95% correctly without any LLM.
For GPT/Grok/GLM, a light LLM pass over each round's text block is more reliable.

**Script**: `scripts/extract-clues.mjs`

```
node scripts/extract-clues.mjs \
  --report demo_and_extension/data/recorded-agent-benchmark/gemini-3.8-flash-high-aided/report.md \
  --model "gemini-3.8-flash-high-aided" \
  --run "r1" \
  --format bold \
  --out demo_and_extension/data/clues/
```

---

### Step B — Region annotation: Florence-2 → manual editor

#### B.1 Florence-2 batch (automated grounding)

[Florence-2](https://huggingface.co/microsoft/Florence-2-large) (Microsoft, Apache-2.0) runs fully locally.  
**Task**: `PHRASE_GROUNDING` — image + text phrase → `[x1, y1, x2, y2]` pixel bounding box.

**Compute requirements**:

| Variant | Parameters | Min VRAM | Speed · RTX 3060 | Speed · CPU only |
|---|---|---|---|---|
| `Florence-2-base` | 232M | ~2 GB | ~0.3 s/call | ~3 s/call |
| **`Florence-2-large`** | **770M** | **~6 GB** | **~0.8 s/call** | **~8 s/call** |

**Recommended: `Florence-2-large`** — meaningfully better box accuracy for text/signage clues.  
Any RTX 3060 (12 GB) or better runs it comfortably. No cloud, no API cost.

**Batch estimate — 875 (image, phrase) pairs:**

| Hardware | Time |
|---|---|
| RTX 3060 · large | ~12 min |
| RTX 3060 · base | ~5 min |
| CPU only · large | ~2 hours |

**What Florence-2 handles well vs. poorly:**

| Clue type | Accuracy | Action |
|---|---|---|
| Text / signage (`"U Alexanderplatz sign"`) | 90%+ IoU | ✅ Auto-approve |
| Named prominent landmarks (`"Berlin TV Tower"`) | 80–90% | ✅ Spot-check |
| Architectural details (`"wrought-iron balconies"`) | 50–70% | ⚠️ Manual adjust |
| Abstract / aggregate cues (`"Haussmann stone facades"`) | 30–50% | ⚠️ Manual adjust |
| Off-frame clues (not in starting image) | Hallucinated box | ❌ Delete |

**Expected manual correction load**: ~20–30% of boxes need editing = ~175–260 corrections.  
At ~30 s/correction → **~2 hours total manual work** for all Gemini runs.

**Script**: `scripts/annotate-clues-florence2.py`

```bash
pip install transformers torch pillow
python scripts/annotate-clues-florence2.py \
  --clues demo_and_extension/data/clues/ \
  --images demo_and_extension/data/starting-images/ \
  --model microsoft/Florence-2-large \
  --confidence-threshold 0.4
```

Output: each clue entry gets `region: {x, y, w, h}` (normalised 0–1) and `florence2Confidence: 0.0–1.0`.

#### B.2 Manual correction editor — LabelStudio

[LabelStudio](https://labelstud.io/) is a free, open-source annotation tool that natively supports:
- Image + bounding box annotation
- Importing **pre-annotations** (Florence-2 boxes loaded as model predictions)
- Per-box label and description text editing
- JSON export matching our schema

**Setup** (one-time, ~30 min):
```bash
pip install label-studio
label-studio start          # opens http://localhost:8080
```

**Workflow**:
1. `scripts/label_studio_converter.py --direction import` — converts `data/clues/*.json` + Florence-2 output → LabelStudio tasks JSON
2. Import images + pre-annotations into a LabelStudio project
3. Annotate: approve ✅ / resize ✏️ / delete 🗑 each box, sorted low-confidence first
4. Export from LabelStudio
5. `scripts/label_studio_converter.py --direction export` — converts back to `data/clues/*.json` with `regionSource: "florence2-large+manual"`

**Alternative if Docker/pip not desired**: a minimal custom HTML5 canvas tool can be built into the existing website dev server at `localhost:4173/annotate`. ~1 day of frontend work but avoids any external tool.

---

### Step C — Panorama heading annotation (Phase 2, optional)

Links a cue to the exact camera angle the model was looking at when it noticed it.

**Data already available**: `exploration.path[]` in each round JSON — GPS + heading/pitch every 1.25s recorded by the extension.

**Approach**:
1. Report text sometimes says things like *"after panning right I noticed the sign"* — this gives an approximate exploration sequence index
2. Match to closest `exploration.path[]` sample
3. Store `cue.evidenceView = { heading, pitch, fov }` from that sample
4. Website seeks the Street View embed to that angle on cue click

This can be done partially automatically (match by round number + relative position in the exploration path) and refined manually.

---

## 3. Data Contract: Extended Cue JSON Schema

```json
{
  "id": "cue-easy-loc002-gemini38h-r1-03",
  "label": "U Alexanderplatz sign",
  "text": "Large blue U-Bahn cube sign clearly reading 'U Alexanderplatz'",
  "description": "Recognized as the entrance to the U-Bahn station Alexanderplatz — confirms Berlin city centre, specifically the Alexanderplatz square",
  "source": "panorama",
  "category": "signage",
  "region": { "x": 0.28, "y": 0.54, "w": 0.14, "h": 0.10 },
  "regionSource": "florence2-large+manual",
  "florence2Confidence": 0.91,
  "evidenceView": {
    "heading": 195, "pitch": -8, "fov": 75
  },
  "ratings": {
    "visible": true,
    "correct": true,
    "useful": true,
    "consistent": true
  }
}
```

**`category` values** — used for colour-coding boxes:

| Value | Colour | Covers |
|---|---|---|
| `signage` | Blue | Street signs, station names, labels, road markings |
| `landmark` | Orange | Named buildings, monuments, towers |
| `architecture` | Purple | Building style, materials, rooflines |
| `infrastructure` | Teal | Roads, vehicles, poles, markings |
| `vegetation` | Green | Trees, plants, biome type |
| `geography` | Brown | Mountains, water, coastline, horizon |
| `linguistic` | Yellow | Language of visible text, script type |

---

## 4. Website Integration Design

### 4.1 Data flow

```
npm run data:build
    └── reads data/clues/*.json
    └── merges into atlas-cases.json case.runs[].cues[]
            ↓
    Location detail page loads atlas-cases.json
            ↓
    ModelClueSelector → user picks model
            ↓
    ClueOverlay renders boxes on static image
    PanoramaClueSeeker seeks Street View (Phase 2)
```

No new API server needed. Everything is baked into the static `atlas-cases.json`.

### 4.2 Components

#### `ModelClueSelector`

Pill buttons at the top of the location detail page — one per model that has clue data for this location. Selecting a model:
- Loads `runs[].cues[]` for that model
- Renders the ClueOverlay
- Updates the minimap pin and error/score display

#### `ClueOverlay` (static image)

SVG element positioned absolutely over the `<img>`:
- `<rect>` per cue using `region.{x,y,w,h}` × rendered image size
- Colour by `category`
- Hover → tooltip card: `label` + full `description` + rating badges
- Click → full cue detail panel

```svelte
<!-- ClueOverlay.svelte (sketch) -->
<div class="image-container" style="position:relative">
  <img src={imageUrl} alt={alt}
       bind:clientWidth={imgW} bind:clientHeight={imgH} />
  <svg class="clue-overlay" width={imgW} height={imgH}
       style="position:absolute;top:0;left:0;pointer-events:none">
    {#each activeCues as cue (cue.id)}
      <rect
        x={cue.region.x * imgW}  y={cue.region.y * imgH}
        width={cue.region.w * imgW}  height={cue.region.h * imgH}
        class="cue-box category-{cue.category}"
        style="pointer-events:all"
        on:mouseenter={() => tooltip = cue}
        on:mouseleave={() => tooltip = null}
      />
    {/each}
  </svg>
  {#if tooltip}
    <CluTooltip cue={tooltip} imgW={imgW} imgH={imgH} />
  {/if}
</div>
```

#### `PanoramaClueSeeker` (Phase 2)

When user is in interactive panorama view:
- Clue list sidebar; clicking a cue calls `panorama.setPov({ heading, pitch, zoom })` on the embedded Google Maps JS API panorama
- An overlay `<div>` on top of the iframe shows a marker at the projected pixel position (heading/pitch → 2D pixel via perspective projection using known FOV — straightforward trig, ~20 lines)
- Note: you cannot inject SVG *inside* the iframe; the overlay div sits *on top of* it

#### Comparison view (stretch goal, Phase 3)

Side-by-side two-model layout on the same location: which clues did both notice? Which only one? A simple set-intersection UI. Useful for the interpretability chapter.

### 4.3 Page layout sketch

```
┌──────────────────────────────────────────────────────────────────────┐
│  loc-002 · Alexanderplatz, Berlin · Easy · Round 2                  │
│                                                                      │
│  Model:  [Gemini 3.7 high ●] [Gemini 3.8 high] [Sol max] [Grok] … │
│                                                                      │
│  [Static image ●]  [Panorama ▶]                                     │
│  ┌───────────────────────────────────┐  ┌──────────────────────┐    │
│  │  🖼 image                         │  │  Visual Clues        │    │
│  │                                   │  │                      │    │
│  │   ┌──────────────┐ ← blue rect    │  │  1. 🟠 TV Tower ✓   │    │
│  │   │ TV Tower     │                │  │  2. 🔵 U-Bahn sign  │    │
│  │   └──────────────┘                │  │  3. 🟠 Park Inn ✓   │    │
│  │                  ┌─────────┐      │  │  4. 🔵 030 prefix   │    │
│  │   ┌──────┐       │U-Bahn   │      │  │  5. 🟣 BVG bus      │    │
│  │   │Park  │       │sign     │      │  │                      │    │
│  │   │Inn   │       └─────────┘      │  │  Prediction: ✓       │    │
│  │   └──────┘                        │  │  52.521, 13.413      │    │
│  │                                   │  │  Error: 48 m         │    │
│  └───────────────────────────────────┘  │  Score: 5,000 pts    │    │
│  ↕ hover box → tooltip with description │  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Order

### Phase 1 — Static image clues (target: ~4–6 days)

| # | Task | Output |
|---|---|---|
| 1 | Write `scripts/extract-clues.mjs` — parse all 7 available Gemini reports | `data/clues/*.json` with ~820 clue texts |
| 2 | Run Florence-2 batch on 25 images × all clue phrases | `region` + `florence2Confidence` added |
| 3 | Set up LabelStudio, import pre-annotations, correction pass | Verified `region` data |
| 4 | Write `scripts/label_studio_converter.py` (import + export directions) | Roundtrip conversion |
| 5 | Extend `data:build` pipeline to merge `data/clues/*.json` into atlas | Cues live in `atlas-cases.json` |
| 6 | Build `ClueOverlay.svelte` + `ModelClueSelector` in website | Working UI on location pages |

### Phase 2 — Panorama seeker (~2–3 days)

| # | Task |
|---|---|
| 7 | Join clue texts to `exploration.path[]` samples → populate `evidenceView.{heading,pitch}` |
| 8 | Build `PanoramaClueSeeker` with Street View iframe seek |
| 9 | Heading → pixel projection for overlay marker positioning |

### Phase 3 — Remaining models (~1–2 days)

| # | Task |
|---|---|
| 10 | Parse GPT-5.6 Sol (max/xhigh) reports via LLM → clue texts |
| 11 | Parse Astra reports → clue texts |
| 12 | Parse GLM chats (unzip, LLM pass) → clue texts |
| 13 | Parse Grok transcripts → clue texts |
| 14 | Gemini 3.8 high R2/R3 once reports available |
| 15 | Cue comparison view |

---

## 6. Open Questions

1. **Per-run or per-model**: Annotate all 3 runs per model (→ ~3,000 boxes) or one canonical run per model (→ ~875)? **Recommendation for Phase 1**: one run per model. Add more runs in Phase 3.

2. **Off-frame clues** (model mentions a clue visible during exploration, not in starting image):
   - Option A: skip — mark `region: null`, show as text-only in clue list
   - Option B: extract a screenshot from the WebM at the relevant timestamp and annotate that instead
   
3. **Ground-truth cue layer**: A human-authored layer of "what is actually useful in this image" would let you measure model clue precision. Worth adding as `groundTruthCues[]` on the case object? Useful for the interpretability analysis chapter.

4. **GLM treatment**: GLM used a screenshot-only MCP — its "clues" are MCP screenshot captions, not free-form visual reasoning. Tag with `source: "mcp-screenshot"` to distinguish from purely visual reasoning?

5. **Manual editor**: LabelStudio (Docker/pip, 30-min setup, zero custom code) vs. custom HTML5 canvas inside the website dev server (1 day build, zero external tools). Pick one before starting Phase 1.

---

## 7. Final File Layout

```
demo_and_extension/
├── data/
│   ├── clues/                           ← NEW: raw clue source files
│   │   ├── europe-easy--loc-001.json
│   │   ├── europe-easy--loc-002.json
│   │   └── … (25 files, one per location)
│   └── generated/
│       └── atlas-cases.json             ← EXTENDED: cues[] populated per run
├── scripts/
│   ├── extract-clues.mjs                ← NEW: report markdown → clue text JSON
│   └── annotate-clues-florence2.py      ← NEW: Florence-2 phrase grounding batch
└── src/lib/components/
    ├── ClueOverlay.svelte               ← NEW: SVG bounding-box layer on image
    ├── ModelClueSelector.svelte         ← NEW: model picker + clue set switcher
    └── PanoramaClueSeeker.svelte        ← NEW (Phase 2): panorama seeker + marker

scripts/                                  ← root level, annotation pipeline only
└── label_studio_converter.py            ← NEW: Florence-2 ↔ LabelStudio format

moreData/                                 ← existing, untouched
VISUAL_CLUES_SPEC.md                      ← this file
```
