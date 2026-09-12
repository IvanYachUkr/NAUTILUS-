# Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-3902e3b2-2d83-4851-8bdd-1b353cb250a3.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-e086d44c-36df-473e-b7ff-080abdb0f8f0.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-9e87604a-f246-41fc-8d5f-cc316cb671fd.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-13ebe7d6-b335-4108-bf7b-14b8306b4f22.png`
- Implementation evidence: Codex in-app browser tab 2 local captures; no persistent local screenshot path.
- Checked viewports: 384 x 824 CSS px for phone behavior and 820 x 800 CSS px for the vertical two-row breakpoint.
- Checked state: Utrecht; Gemini 3.8 Flash medium, aided; Interactive panorama; five visual clues and one non-spatial clue.

## Findings

- Cue foreground: passed. Cue 3 becomes the top stacking layer (`2147483000`) while active; cue 4 remains at its normal layer (`967`), so the cue label cannot be painted underneath another bounding box.
- Evidence image: passed. Evidence mode explicitly removes the separate scene backdrop and presents one full-bleed, horizontally scrollable cue canvas.
- Mobile cue header: passed. The taller narrow Back to location control and compact cue summary share one top row; the location title is omitted only in this constrained header.
- Bottom controls: passed. Model, condition, previous, and next controls remain anchored to the viewport bottom in cue mode.
- Vertical-device adaptation: passed. The 820 x 800 capture uses a 2 x 2 dock while the image continues to fill the remaining viewport without the former black padding.
- Selector density: passed. Labels stack above their controls, the model receives the wider track, and select padding leaves more of each value visible.
- Navigation spacing: passed. Fat arrows remain at the edges while previous/next text shifts inward away from them.
- Detail branding: passed. A restrained gold rule now sits directly below the centered NAUTILUS mark.
- Mobile globe: passed. The globe is a non-interactive compact inset in the lower-right corner, leaving the street image visible.
- Mobile globe legend: passed. The three legend items are visible in a compact lower-left card beside the globe.
- Statistics placement: passed. On phones the Statistics button follows the model and condition selectors in the formerly empty left-rail space; wider layouts retain Statistics beside the globe legend.
- Metrics: passed. Pin error and run-time labels and values are centered.
- Mobile visual-evidence summary: passed. The detail-view summary is a narrow single-row card rather than a wide overlay.

## Primary interactions and console

- Opened and closed visual evidence, selected cue 3, resized between phone and vertical layouts, and returned to the location view.
- Confirmed responsive Statistics re-parenting, cue stacking order, compact globe placement, and visible legend in the rendered DOM.
- Browser console errors: none.

## Implementation checklist

- [x] Keep cue labels above overlapping boxes.
- [x] Restore one full-screen cue image.
- [x] Fit the mobile cue summary beside Back to location.
- [x] Keep cue navigation controls at the bottom.
- [x] Give select values more usable width.
- [x] Add the NAUTILUS underline.
- [x] Reduce the mobile globe and preserve its focused pin.
- [x] Center pin error and run time.
- [x] Move mobile Statistics into the left rail.
- [x] Switch vertical cue layouts to 2 x 2 controls.
- [x] Restore the mobile globe legend.

final result: passed
