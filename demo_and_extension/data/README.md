# Experiment data

The current benchmark uses the competition files as the location source of truth.

## Editable / collected inputs

- `competitions/` - **primary location definitions** for Easy, Medium, and Hard. Each file embeds its ordered locations and full Google Street View URLs.
- `recorded-agent-benchmark/` - curated canonical agent-run logs, metadata, reports, and score summaries; WebM files are intentionally external.
- `results/` - optional model hypotheses, cues, ratings, and other result annotations.
- `recordings/inbox/` - completed per-round recorder JSON. These files include predictions and, for interactive runs, camera/event telemetry.
- `recordings/sessions/` - full-competition session manifests.
- `recordings/checkpoints/` - recovery/diagnostic checkpoints when present.
- `starting-images/` - canonical static/NMPZ PNGs (`<competition>/<location>.png`).
- `exploration-videos/` - finalized interactive WebM files and their small capture-metadata JSON files.

## Generated output

`generated/` is rebuilt by:

```powershell
npm run data:build
```

Do not hand-edit generated JSON.

Important outputs include:

```text
generated/recordings.index.json
generated/atlas-cases.json
generated/build-report.json
```

## Location definitions

For the current project, edit:

```text
competitions/europe-easy.json
competitions/europe-medium.json
competitions/europe-hard.json
```

Do not create a second root-level location catalog. Coordinates, panorama ID, heading, pitch, and FOV are derived from each full Street View URL during the build.

The build still contains compatibility support for older `locationIds`-based datasets, but the current 25-location benchmark does not use that format.

## Collector audit log

`recordings/index.jsonl` is a local append-only collector log. It is useful during debugging but is not source data and is ignored by Git. The build uses the actual files in `recordings/inbox/`.
