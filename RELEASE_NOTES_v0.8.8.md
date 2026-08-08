# Geo Evidence Atlas v0.8.8

- Normalized all 25 competition source Street View URLs to a zero starting pitch.
- Desktop Google Maps links now encode level camera tilt as `90t`; embedded Street View thumbnail pitch metadata is also set to zero where present.
- Latitude/longitude, panorama ID, heading, and FOV are preserved for every location.
- `startingView.pitch` therefore resolves to `0` for all 25 generated atlas locations and exported OpenGuessr competition links.
- Added `npm run locations:zero-pitch` so newly adjusted copied Street View links can be normalized before rebuilding the competitions.
- Interactive recorder behavior is unchanged: later API samples can still record non-zero pitch after the model/user looks up or down.
- Retains the v0.8.7 drawer rule: Truth/Prediction close on **All locations**; Statistics remain open and update to overview scope.
