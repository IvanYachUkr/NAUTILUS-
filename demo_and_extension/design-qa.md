# Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-8aaa901d-15ac-4d41-8231-f6df005b870e.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-9a8096cf-6f97-41f5-9e84-bd4d0c64ad91.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-f6615861-8543-4190-866e-3eaa473bd043.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-49398272-5563-4ab5-a302-2f9efa80e07c.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-8c672b3c-e161-4e5b-9504-c581ee529ba5.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-f32b0bfe-b2d0-466c-810b-52a95b6460bc.png`
- Implementation evidence: Codex in-app browser local captures.
- Checked viewports: 390 x 844, 432 x 820, 540 x 960, and 1280 x 720 CSS px.
- Checked state: Utrecht; Gemini 3.8 Flash medium, aided; Interactive panorama.

## Findings

- Walk here: passed. It always opens a direct, keyless Google Maps panorama URL, avoiding embedded-key referrer restrictions.
- Comparison controls: passed. Compare models and Compare conditions share one equal-height row on mobile.
- Selector density: passed. The model track is wider, the condition fits in its narrower track, and custom arrows no longer reserve excess text space.
- Selector menus: passed. Detail and evidence-mode selects use the dark palette, and the full condition label fits without a detached native overflow label.
- Condition comparison: passed. The control remains in the layout; models with one recorded condition show an accurate disabled `· 1` state instead of making the button disappear.
- Mobile width: passed. The internal scroll rail no longer exposes a right-side gutter.
- Mobile scene: passed. One 1920 x 945 scene scales to the viewport at its natural aspect ratio rather than being cropped.
- Scene overlays: passed. The evidence control is a compact clues button, and the mobile legend uses the available width so all three labels remain readable in a thin single row. Mobile still shows only a small curved segment of the globe whose center sits beyond the image's bottom-right edge.
- Desktop preservation: passed. The full-bleed backdrop remains active and the mobile scene copy stays hidden.
- Console: no errors observed during responsive QA.

final result: passed
