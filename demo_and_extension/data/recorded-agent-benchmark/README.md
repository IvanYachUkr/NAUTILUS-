# Recorded interactive-agent benchmark

This directory contains the three canonical 25-round interactive-panorama runs
listed in the repository leaderboard. Failed attempts, recorder pilots, debug
traces, and WebM files are excluded.

Each model directory contains:

- `report.md`: the detailed human-readable run report.
- `europe-{easy,medium,hard}/session.json`: the completed recorder manifest.
- `europe-{easy,medium,hard}/rounds/`: one raw telemetry/prediction JSON per round.
- `europe-{easy,medium,hard}/video-metadata/`: one recorder sidecar per round.

The JSON contents are copied unchanged from the recorder output; only their
destination filenames are normalized. Consequently, `path` and `video.path`
fields still describe the original recorder layout. The corresponding WebMs
and complete downloadable bundles are stored in the
[shared Drive archive](https://drive.google.com/drive/folders/1Na3KE6yjYo1rxVunhIc2H_7cwZpyB6g0).

See each model's README for its scores and canonical session IDs. Scores are
official OpenGuessr competition points, not the transient XP animation shown
after individual guesses.
