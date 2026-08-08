# Geo Evidence Atlas v0.8.11

- Bundles OpenGuessr Research Round Recorder v0.6.6.
- Fixes a round-boundary race where a delayed `Continue` / result event from the previous round could arrive after the next Street View frame had already started and immediately finalize the new round as a zero-duration `round_advanced` recording.
- Terminal page events are now ignored when their original timestamp predates the current round start.
- Delayed finalize timers are bound to the exact round that scheduled them and cannot finalize a later round.
- Adds a regression test reproducing the observed Salzburg timing pattern (`Continue` at T-80 ms, next round start at T).
- Recording schema remains unchanged (`2.0`). Demo behavior, zero-pitch location definitions, collector routing, and overlay stability are unchanged.
