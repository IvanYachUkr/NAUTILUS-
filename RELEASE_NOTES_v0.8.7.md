# Geo Evidence Atlas v0.8.7

- Ground-truth and prediction drawers now close when switching to **All locations**, because they belong to one specific location.
- Evaluation statistics remain open when switching between a location and **All locations**, and update to the current scope.
- All code paths that transition to overview now use the same drawer-state rule.
- Updated `europe-easy / loc_002` (Berlin) to the revised Street View URL supplied for the study.
- The Berlin source URL parses to `52.5206008, 13.4151229`, heading `281.32°`, pitch `6.37°`, FOV `75°`.
- Recorder behavior and recording schema are unchanged.
