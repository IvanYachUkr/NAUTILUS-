# Geo Evidence Atlas v0.8.4

UI consistency fixes for map selection and evaluation statistics.

- Evaluation statistics now use the same visible case scope as the map: in overview mode only cases with a prediction for the selected model/condition are counted; for a selected location the statistics update to that location.
- The statistics drawer stays open while moving between locations or returning to the overview and updates in place.
- Static/NMPZ runs no longer create any playback descriptor or direction marker on the map, fixing the marker that could cover the ground-truth `T` marker.
- The truth-to-prediction connector is now a darker slate (`#273444`) with slightly stronger weight/opacity.
- Recorder remains v0.6.3 and the data schema is unchanged.
