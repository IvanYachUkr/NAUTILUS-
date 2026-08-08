# Geo Evidence Atlas v0.8.2

## Static/NMPZ visualization

- Static-image/NMPZ runs no longer render a playback timeline below the map.
- Static runs do not expose a playback marker or playback drawer.
- Static metadata is summarized as `Static / NMPZ · fixed view` instead of showing internal sample counts.
- Interactive-panorama runs retain the full exploration timeline and camera playback.

## Street View actions

- The Ground Truth right panel now contains `Open ground-truth Street View`, using the curated starting camera.
- The Prediction right panel now contains `Open Street View at prediction` when a prediction coordinate exists.
- The prediction link is generated directly from the submitted latitude/longitude.

## Recorder compatibility

The recording schema is unchanged. Existing v0.6.x recorder files remain compatible.
