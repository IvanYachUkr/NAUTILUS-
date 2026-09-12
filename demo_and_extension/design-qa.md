# Design QA

**Comparison target**

- Source visual truth: `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-481331f9-0e53-47d7-ada8-497ad85021e7.png`.
- Source pixels: 1911 x 1035.
- Implementation evidence: Codex in-app browser tab 2 local capture (browser-owned capture; no persistent local screenshot path).
- Implementation viewport: 818 x 794 CSS px at 1.25 device-pixel ratio.
- State: Utrecht; Gemini 3.8 Flash medium, aided; Interactive panorama; cue view with five visual clues and one non-spatial clue.
- Density normalization: compared at native CSS scale. The narrower implementation viewport was reviewed responsively rather than treated as a pixel overlay against the wide source.

**Findings**

- Fonts and typography: passed. The existing Space Grotesk and Instrument Serif hierarchy is preserved; summary and dock labels remain readable and truncate only long location/model values at narrow widths.
- Spacing and layout rhythm: passed. The dock is now one shallow desktop row with previous location, model/condition controls, and next location in that order. At widths below 760 px it becomes a compact two-row layout.
- Colors and visual tokens: passed. The non-spatial control uses the established warm accent with a restrained gold border and glow.
- Image quality and asset fidelity: passed. The original benchmark image and cue rectangles remain unchanged and unobscured by the dock redesign.
- Copy and content: passed. Existing location, clue, model, and condition text is preserved.
- Cue label placement: passed. Browser geometry checks confirmed all five generated labels clear their own bounding rectangles; three place above and two below in this scene.

**Full-view comparison evidence**

- The implementation preserves the source image-dominant composition while reducing the bottom control surface from two large rows to a single shallow row at desktop widths.
- The top-right cue summary is centered throughout, and the non-spatial action reads as a button rather than an underlined text link.

**Focused region comparison evidence**

- Top-right summary: centered count, location, and glowing gold non-spatial button.
- Bottom dock: fat directional arrows flank the centered labels; model and condition controls sit between the two location buttons.
- Cue regions: tooltip placement classes are selected from each region's vertical position and aligned away from the right edge when needed.

**Primary interactions and console**

- Opened the visual cue view, selected a visual clue, opened and closed the non-spatial evidence panel, and changed the condition selector.
- Browser console errors: none.

**Comparison history**

- Initial source issue: cue labels sat on their own regions, the summary aligned right with a weak text-link affordance, and the bottom dock consumed two tall rows.
- Fix: added outside-box tooltip placement, centered summary styling, gold button treatment, and an evidence-specific compact dock grid.
- Post-fix evidence: the final browser capture shows the requested hierarchy, and browser geometry confirms every cue label clears its own box.

**Implementation Checklist**

- [x] Place cue labels above or below their region.
- [x] Center the cue summary.
- [x] Emphasize the non-spatial cue control.
- [x] Put model and condition between previous and next.
- [x] Use large filled navigation arrows.
- [x] Verify primary interactions and console output.

final result: passed
