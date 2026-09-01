# Recorded interactive-agent benchmark

The benchmark contains published runs for GPT-5.6 Sol max, GPT-5.6 Sol xhigh, Grok 4.6 xhigh, and Gemini 3.7 Flash.

The top-ranking overall model run is [`gemini-3.7-flash-high-aided/`](gemini-3.7-flash-high-aided/), achieving **120,029 / 125,000 points** (96.0% accuracy) with a pin-placement helper. The original unaided run is under [`gemini-3.7-flash-high/`](gemini-3.7-flash-high/).

The original published run remains directly under each model directory.
Additional runs live under `runs/recorded-rN/`. A run contains:

- `README.md`: scores, recorder label, and canonical session IDs.
- `report.md`: the detailed human-readable audit.
- `europe-{easy,medium,hard}/session.json`: the complete recorder manifest.
- `europe-{easy,medium,hard}/rounds/`: one authoritative raw telemetry JSON per scored round.
- `europe-{easy,medium,hard}/video-metadata/`: stored sidecars whose capture ID
  matches the scored-round manifest entry.
- `recovery-segments/` and `recovery-video-metadata/`, when present:
  non-prediction recorder segments excluded from the 25 official rounds;
  sidecars are retained only when their capture ID matches the stored WebM.
- Grok runs additionally include the raw Easy, Medium, and Hard CLI transcripts.

The JSON contents are copied unchanged from recorder output; only destination
filenames are normalized. Consequently, `path` and `video.path` fields still
describe the original collector layout. Failed competition attempts and pilots
are excluded from the published run directories, while recovery segments
inside a completed session are retained explicitly.

## Video capture-ID audit

The six new runs contain **150 official rounds and 150 unique stored WebM
paths**. A capture-ID check, stricter than path existence alone, matched the
stored sidecar to the official manifest entry for **139/150 rounds**. In the
remaining **11 rounds**, a no-prediction recovery capture and the later official
capture reused the same per-round output path; the stored WebM/sidecar is the
recovery capture, while the official prediction JSON, completed counters, and
leaderboard score remain intact.

Affected official rounds are Sol max R4 Medium 6 and Hard 5, plus Sol xhigh R3
Medium 8-9 and Hard 2-8. The unmatched sidecar copies are deliberately omitted
from `video-metadata/` rather than being presented as official video evidence.
The Drive archive stores each of the 150 physical WebMs once and preserves all
session and recovery JSON. This caveat affects continuous visual replay only;
it does not alter any score in the leaderboard.

Exact shared protocols are under [`protocols/`](protocols/). Grok's exact
dataset prompts are under [`grok-4.6-xhigh/prompts/`](grok-4.6-xhigh/prompts/).
The corresponding WebMs and complete downloadable bundles are stored in the
[shared Drive archive](https://drive.google.com/drive/folders/1Na3KE6yjYo1rxVunhIc2H_7cwZpyB6g0).

Scores are official OpenGuessr competition points, not the transient XP
animation shown after individual guesses. Repeated runs use the same 25 fixed
locations and therefore quantify run/controller variability, not independent
new-location generalization.
