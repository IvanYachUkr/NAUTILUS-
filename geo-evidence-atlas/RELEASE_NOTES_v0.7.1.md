# Geo Evidence Atlas v0.7.1

This hotfix changes the recording import behavior.

## Fixed

- A matched recording is now visible even when OpenGuessr did not expose the
  submitted prediction coordinate.
- NMPZ/static recordings without movement samples recover a fixed playback view
  from the competition definition as before.
- The website no longer assumes every run has a prediction.
- Recording-only runs show playback, duration, model, condition, camera state,
  key moments, and Street View links.
- Prediction pins, error lines, and error statistics are only shown when a valid
  prediction coordinate exists.
- The build warning now explains whether a recording was imported without a
  prediction instead of claiming no recording exists.
- Added `npm run recordings:inspect` for a concise import report.

## Important distinction

`model: "manual"` is a grouping label. It does not stand for a guess and does
not generate `prediction.lat` or `prediction.lng`.

## Extension version 0.4.1

- Missing/null coordinates are no longer coerced to `(0, 0)`.
- Existing recordings remain compatible; no data migration is required.
