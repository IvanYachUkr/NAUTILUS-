# Geo Evidence Atlas v0.8.0

This release focuses on reliable manual OpenGuessr prediction capture.

## Recorder v0.5.0

- Captures the user's guess directly from the OpenGuessr Leaflet guess map.
- Keeps outbound request decoding as a second prediction source.
- If the Guess button is not observable, the latest Leaflet pin is committed when the result screen appears.
- Freezes the round immediately when the result screen is detected.
- Ignores Street View/DOM samples arriving after that freeze boundary.
- Uses the freeze timestamp as the round end time, preventing the next scene from extending the previous recording.
- Keeps NMPZ/static recording support and automatic competition-level round segmentation.

The change directly covers the observed failure mode where a valid manual pin was placed but `prediction` was `null`, followed by a foreign Street View sample entering the old round after the result screen.

## Web demo

The v0.7.1 recording-only fallback remains available. Recordings with captured predictions now automatically regain the prediction marker, truth-to-prediction line, Haversine error, and prediction-based statistics after `npm run data:build`.
