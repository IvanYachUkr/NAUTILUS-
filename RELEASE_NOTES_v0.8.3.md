# Geo Evidence Atlas v0.8.3

- Ground-truth and prediction markers now receive unambiguous clicks when a location is selected; the generic location marker is removed from the same coordinate while a run is open.
- Clicking `T` opens the right-side Ground truth panel and its curated Street View link.
- Clicking `P` opens the right-side Prediction panel and Street View at the predicted coordinate.
- The truth-to-prediction connector is now a darker slate gray.
- Selecting a location in the left rail hides all other dataset locations from the map. Static runs show only truth and prediction; interactive runs additionally show the selected exploration route.
- The All-locations overview only maps cases with an actual prediction for the currently selected model + condition and active filters; unrun planned locations are not shown on the map.
