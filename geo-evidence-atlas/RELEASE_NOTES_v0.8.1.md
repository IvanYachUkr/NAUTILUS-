# Geo Evidence Atlas v0.8.1

Recorder extension: **0.5.1**

## Fixes

- Prevents repeated `result-visible` events from starting a phantom second round.
- Prevents a post-result `Continue` click from creating a round when none is active.
- `ensureRoundFromProbe()` now refuses to start from a result screen even when called with force.
- The data builder ignores the exact one-sample `startSource: "result_visible"` phantom files produced by recorder 0.5.0.
- Valid manual/NMPZ recordings with a captured Leaflet prediction are unaffected.
