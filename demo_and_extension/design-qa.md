# Design QA

- Source visual truth: `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-e07da05e-2167-41b7-b873-371aa580f7b4.png` (1914 x 1040 px).
- Implementation capture: Codex in-app browser, local detail view at 818 x 794 CSS px and 1.25 device-pixel ratio.
- State reviewed: Utrecht; Gemini 3.8 Flash medium, aided; Static images covered.
- Responsive normalization: the source and implementation were compared at native CSS scale. The narrower review viewport intentionally stacks the two selectors; widths above 900 px retain the requested wider-model, compact-condition row.
- Full-view evidence: previous and next cards have centered labels and large filled arrows; the evidence control is a wide single-line strip with a boxed arrow; the globe legend sits immediately left of Statistics at the same height.
- Focused-region evidence: model and condition labels remain readable; the condition control is width-capped on wide screens; legend markers and labels remain visible without covering the globe pin.
- Interaction checks: visual evidence opened and returned correctly; Statistics opened and closed correctly.
- Console check: no browser errors.
- Comparison history: the first pass exposed a hidden legend caused by selector specificity and compressed selectors in the narrow desktop viewport. Both were corrected before the final capture.
- Severity findings: no P0, P1, or P2 visual regressions found in the requested areas.
- Final result: passed.
