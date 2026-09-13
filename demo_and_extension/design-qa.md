# Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-8aaa901d-15ac-4d41-8231-f6df005b870e.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-9a8096cf-6f97-41f5-9e84-bd4d0c64ad91.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-f6615861-8543-4190-866e-3eaa473bd043.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-49398272-5563-4ab5-a302-2f9efa80e07c.png`
  - `C:\Users\vanya\AppData\Local\Temp\codex-clipboard-8c672b3c-e161-4e5b-9504-c581ee529ba5.png`
- Implementation evidence: Codex in-app browser local captures.
- Checked viewports: 390 x 844, 540 x 960, and 1280 x 720 CSS px.
- Checked state: Utrecht; Gemini 3.8 Flash medium, aided; Interactive panorama.

## Findings

- Walk here: passed. It remains visible without an embedded Maps key and uses a Google Maps fallback URL.
- Comparison controls: passed. Compare models and Compare conditions share one equal-height row on mobile.
- Selector density: passed. The model track is wider, the condition fits in its narrower track, and custom arrows no longer reserve excess text space.
- Mobile width: passed. The internal scroll rail no longer exposes a right-side gutter.
- Mobile scene: passed. One 1920 x 945 scene scales to the viewport at its natural aspect ratio rather than being cropped.
- Scene overlays: passed. The evidence control is a compact 5 clues button, the legend is a thin single row, and the globe is an 86 px corner inset at 390 px width.
- Desktop preservation: passed. The full-bleed backdrop remains active and the mobile scene copy stays hidden.
- Console: no errors observed during responsive QA.

final result: passed
