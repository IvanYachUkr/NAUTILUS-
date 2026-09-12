# GPT-6 Astra Low — agentic browser coordinates and cues

This is the **interactive browser / panorama** experiment from September 6–7, 2026, not the static masked-image experiment.

**Recovered: 11 original submitted map-pin coordinate pairs.** All 11 reproduce the corresponding result-report distances to the displayed rounding. **64 of the 75 scored rounds do not have a recoverable exact coordinate pair in the inspected records.** Their cues, initial hypotheses, final location descriptions, and controller notes are still included; missing numeric coordinates stay blank.

- `recovered_coordinates.csv` / `.json`: the 11 validated original submitted pins, linked to the round notes and recorder evidence.
- `all_75_rounds.csv` / `rounds.json`: all three 25-round runs, with explicit coordinate availability and original cue/decision notes.
- `rounds_with_cues.md`: readable round-by-round coordinates and notes.
- `coordinate_evidence.json`: narrowly selected original recorder prediction fields, timestamps, source hashes, and distance cross-checks.
- `reports/` and `score_summary.json`: original published run reports, continuation notes, exclusions, and score provenance.
- `recorder_audit.json`, `manifest.json`, and `SHA256SUMS`: provenance and integrity checks.

## Why the numeric guesses were missing

The old recorder accepted unrelated `ib.adnxs.com` advertising requests as coordinate predictions (for example, numbers inside an advertising-consent field). This could overwrite a genuine map-click capture. The earlier publication correctly withheld those unvalidated numeric fields. In the inspected local records, 11 canonical predictions still retain the `leaflet-map-click` source. These are now exported and cross-checked against recorded result distances. The other canonical records contain either invalid ad-request data (59) or no recoverable numeric prediction (5).

Ground-truth/spawn/camera positions are **not predictions** and have not been used to fill missing guesses. Nor have place descriptions been retroactively geocoded into fabricated original coordinates. Reported cues and hypotheses are preserved as the agent wrote them; the reports distinguish initial beliefs, final pins, and truth revealed after submission.

The archive preserves the documented valid-run selection: Run 1 Hard combines its first six completed rounds with the final-two continuation; Run 3 uses only clean Medium results plus the final-three continuation. Excluded contaminated or unfinished attempts remain excluded. Screenshots and videos are not duplicated in this compact text/coordinate archive; the original result screenshots remain in the benchmark evidence folder.
