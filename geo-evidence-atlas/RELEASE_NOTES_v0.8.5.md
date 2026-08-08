# Geo Evidence Atlas v0.8.5

Map interaction refinement on top of v0.8.4.

- Static/NMPZ keeps the starting-view direction arrow visible.
- The static direction arrow is a visual-only Leaflet marker (`interactive: false`, `pointer-events: none`) and sits below the ground-truth marker, so it cannot block opening the Ground Truth detail drawer.
- Static/NMPZ still has no playback timeline, playback trace, or interactive playback marker.
- Statistics continue to use the same predicted-case scope as the overview map and stay open/update while selecting locations.
- The truth-to-prediction connector remains the darker slate tone introduced in v0.8.4.
- Recorder remains v0.6.3; data schema is unchanged.
