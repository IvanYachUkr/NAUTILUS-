# Geo Evidence Atlas v0.8.12

- Bundles OpenGuessr Research Round Recorder **v0.6.7**.
- Blocks interactive result-screen panorama events from becoming phantom next rounds.
- Requires real transition evidence plus a materially new frame/panorama/position before a post-result round can start.
- `Continue` cannot finalize a round without a captured prediction.
- Prediction-less partial diagnostics no longer increase `completedRoundCount`.
- Interactive DOM/embed heartbeats stop contributing camera samples once live Google Maps API samples exist.
- Exploration paths use chronological API movement samples when available and stop at the prediction/Guess boundary. This prevents result-screen recentering or static iframe coordinates from drawing a false line back to the start.
- Recording schema remains `2.0`; no demo data migration is required.
