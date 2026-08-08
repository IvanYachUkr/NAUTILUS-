# OpenGuessr Research Round Recorder v0.6.7


## v0.6.7 interactive result-transition fix

Interactive result screens may continue emitting live Street View camera events while the previous round is waiting for **Continue**. v0.6.7 treats those events as transition noise: after a completed result it requires a real round transition plus a materially new panorama before starting the next round. `Continue` alone never finalizes a round without a captured prediction.

For interactive exploration, live Google Maps API samples are authoritative. DOM/embed heartbeats are no longer appended after API capture begins, and camera events at or after the Guess submission intent are excluded so result-screen recentering cannot create a fake route back to the starting point.

A partial diagnostic recording with no prediction does not count toward the session's completed-round total.


## v0.6.6 round-boundary race fix

A delayed **Continue** / result-screen event from the previous round can no longer freeze or finalize a newly started round. The recorder compares the event's original timestamp with the current round start and ignores terminal events that predate that round. Delayed finalize timers are also bound to the exact round that scheduled them, so they cannot spill into the next round.

This specifically fixes the observed zero-duration phantom round where `round_advanced` was recorded immediately after the next Street View frame appeared. Prediction capture, NMPZ/interactive sampling, collector saving, and the JSON schema are unchanged.


## v0.6.5 stable overlay inputs

The in-page setup/status overlay is now DOM-stable across the 1.25 s page heartbeat. Typing a custom model name, changing competition/condition, or pressing an action button is no longer reset by periodic UI refreshes. The setup form is only replaced when the recorder actually changes state.

## v0.6.4 completion handoff

After the expected competition rounds are saved, the in-page completion card now uses **Done & disarm**. Clicking it clears the completed tab session from the recorder, leaves all saved round/session JSON files untouched, and returns the extension to an idle state. The next OpenGuessr competition start dialog can then show the normal **Arm & record competition** prompt again.

A completed session manifest is no longer re-sent merely because another competition is armed or the completed tab state is reset. This prevents old completed sessions from receiving a confusing new `updatedAt` / collector `receivedAt` timestamp much later.

## v0.6.3 calmer recording UI

The recorder no longer displays a live sample counter in either the Chrome popup or the in-page OpenGuessr overlay. Samples are still captured internally and remain in the saved round JSON for timing, recovery, and interactive exploration playback. The visible UI now focuses on recording state, prediction capture, mode, and save confirmation.

## v0.6.2 interactive-start and metadata fix

This release fixes the remaining issues found in the first complete 8-round NMPZ session and makes the start boundary safe for interactive panorama runs.

- **Round 1 starts at the competition transition, not at the first prediction.** The isolated content script now also observes the OpenGuessr Start control and immediately probes the page when the competition dialog disappears. If OpenGuessr routes from the competition dialog into a playable Street View, the recorder creates round 1 at that transition even when no Guess control or new iframe is visible yet.
- **Interactive movement is captured from the beginning.** Round 1 can be created from the initial playable view and then adopt the Google Street View API frame, so subsequent position, heading, pitch, zoom and FOV samples are retained.
- **Experiment mode is authoritative.** `static-image` is stored as `captureMode: "nmpz"`; `interactive-panorama` is stored as `captureMode: "interactive"`. A generic DOM `streetview` hint can no longer overwrite the configured mode.
- **Session timing is aligned with the competition start.** `session.startedAt` now uses the confirmed OpenGuessr competition-start timestamp instead of the time the first round happens to reach the collector.
- **Start detection is redundant.** Both the page-world hook and the isolated content script watch the Start action, while prompt-disappearance/route-transition detection remains as a fallback.

The round JSON schema remains `2.0`, so the existing Geo Evidence Atlas web demo does not need a data-pipeline update.

## v0.6.1 start-detection fix

The recorder no longer depends on successfully receiving the exact OpenGuessr Start button click. When armed from the competition start dialog it remembers that dialog and the lobby Street View state. If the dialog disappears and OpenGuessr exposes a new live-round signal or a new Street View frame, the competition start is confirmed automatically. The **I started it** action remains a fallback only.

Arming is also idempotent: pressing **Arm & record competition** twice with the same setup keeps the existing arm state instead of resetting it. This prevents accidental extra recording sessions from double clicks or duplicate prompts.

Chrome/Edge Manifest V3 extension for controlled competition-level capture.

The important change in v0.6 is that **extension enabled** and **recording active** are now separate states. The extension may stay installed and enabled all day without creating recordings. A competition is recorded only after the user explicitly arms that OpenGuessr tab.

## Recommended workflow

1. Start the Geo Evidence Atlas collector with `npm start`.
2. Open the OpenGuessr competition link.
3. Wait until OpenGuessr shows its competition/start dialog.
4. The recorder displays its own small panel above the page asking **Record this competition?**.
5. Select the competition definition, model, and condition.
6. Press **Arm & record competition**.
7. The recorder is now armed but still does **not** record anything.
8. Press OpenGuessr's own **Start / Join / Play competition** control.
9. The recorder detects that start action and waits for the first live round.
10. Round 1 starts automatically when the actual Street View/NMPZ scene appears.
11. Place the prediction and submit normally.
12. The result screen freezes the round, saves one JSON, and shows **Round N recorded ✓** on the page.
13. Continue to the next round normally. The next round starts recording automatically.
14. After the expected number of rounds is saved, the page shows **Competition recorded**. Capture is already stopped; click **Done & disarm** to clear the completed tab session and return the recorder to idle for the next competition.

No manual start/stop is required per location.

## Why the recorder uses an in-page panel

The toolbar popup remains available as a fallback, but the main workflow uses an in-page recorder panel. This panel remains visible while you interact with OpenGuessr and can therefore show the armed, recording, saving, and round-saved states without forcing you to reopen the browser-extension toolbar popup.

## State machine

```text
IDLE
  ↓ OpenGuessr competition start dialog detected
PROMPT
  ↓ Arm & record competition
ARMED
  ↓ OpenGuessr Start/Join/Play clicked
WAITING FOR FIRST ROUND
  ↓ actual Street View/NMPZ round detected
RECORDING ROUND
  ↓ result screen detected
SAVING ROUND
  ↓ JSON accepted by collector/download fallback
ROUND RECORDED ✓
  ↓ next actual round detected
RECORDING NEXT ROUND
  ...
  ↓ expected round count reached
COMPETITION RECORDED ✓
  ↓
IDLE
```

## Important safety gates

The recorder will not create a round from:

- the OpenGuessr competitions list;
- the competition lobby before explicit arming;
- background or decorative Street View iframes;
- the competition start dialog itself;
- the result screen from the previous round;
- a new Street View frame until the OpenGuessr Start action has been detected for an armed competition.

This specifically prevents long accidental recordings that begin on `/competitions` before the real competition has started.

## In-page controls

### Record this competition?

Shown when a competition start/lobby dialog is detected and the tab is idle.

The panel contains:

- Competition setup
- Model
- Condition
- **Arm & record competition**
- **Not now**

### Recorder armed

Shown after explicit arming. The recorder is waiting for OpenGuessr's own start action and is not yet collecting round data.

If OpenGuessr changes its UI and the Start click cannot be detected, use **I started it** as a manual fallback. This only opens the first-round gate; it does not create a round by itself.

### Recording round N

Shows:

- current round number;
- number of samples;
- prediction waiting/captured state;
- saved-round progress;
- **Stop recording** emergency control.

### Round N recorded ✓

Shown on the result screen after the JSON has actually been saved. The message states whether a prediction coordinate was captured and shows session progress.

### Competition recorded

Shown when all expected competition rounds were saved. Capture is already stopped. Click **Done & disarm** to clear the completed tab session; the next OpenGuessr competition start dialog can then show the Arm prompt again.

## Toolbar popup fallback

The extension toolbar popup remains useful for setup and debugging. It now contains:

- Save setup
- Test collector
- **Arm current competition**
- **Stop recording**
- Save checkpoint
- Finalize round
- Download diagnostics
- Reset tab session

`Arm current competition` follows the same lifecycle as the in-page prompt: it arms the tab, but the recorder still waits for OpenGuessr's Start action before accepting the first round.

## Manual prediction capture

The recorder keeps the v0.5 Leaflet prediction capture:

1. the latest click on the OpenGuessr guess map is retained;
2. when the guess/result transition happens, that coordinate is stored as the prediction;
3. network-request decoding remains a fallback.

A successful manual prediction normally contains:

```json
{
  "prediction": {
    "lat": 47.32658839583286,
    "lng": 2.109375,
    "source": "leaflet-map-click"
  },
  "partial": false
}
```

## NMPZ

NMPZ is stored as `static-image` and normally has no movement path. A correct NMPZ round may contain only a few repeated fixed-camera samples. The important data are:

- starting scene;
- start/end time;
- fixed heading/FOV when available;
- prediction pin;
- result boundary;
- competition and round association.

## Output

Completed rounds:

```text
data/recordings/inbox/<competition-id>/<location-id>/...json
```

Session manifests:

```text
data/recordings/sessions/<competition-id>/<session-id>.json
```

Live checkpoints:

```text
data/recordings/checkpoints/<competition-id>/<session-id>/...json
```

## Updating from v0.5.1

1. Preserve any recording currently in progress before updating.
2. Replace the old extension files with v0.6.7.
3. Open `chrome://extensions`.
4. Click **Reload** on OpenGuessr Research Round Recorder.
5. Verify version `0.6.7`.
6. Reload the OpenGuessr tab so the updated hooks and in-page UI are injected.

The round JSON schema is unchanged, so Geo Evidence Atlas v0.8.0/v0.8.1 can read v0.6.7 recordings without any web-demo changes.

## Data minimization

Diagnostic Street View URLs are sanitized before storage. Query parameters named `key`, `token`, `access_token`, `signature`, `client`, or `authuser` are redacted because they are not needed for playback or analysis.

## Before formal data collection

Run a short 2-3 round pilot and verify:

- no JSON exists before arming;
- no JSON exists between Arm and OpenGuessr Start;
- exactly one JSON is produced per completed round;
- each completed round contains the expected prediction;
- the page displays `Round N recorded ✓` before you continue;
- the competition disarms after the final expected round.
