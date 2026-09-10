# NAUTILUS Autonomous OpenGuessr Benchmark: Run & Protocol Guide

This guide provides concrete instructions, architecture details, and automated workflows to ensure a future autonomous agent or LLM completes the NAUTILUS OpenGuessr benchmark (Easy, Medium, Hard) smoothly, reliably, and without intervention.

---

## 1. Core Principles & Evidence Boundary

1. **Strict Blind Visual Play**:
   - Rely **only** on rendered Street View pixels and visible in-game Leaflet map labels.
   - **Never** extract hidden panorama coordinates, panorama IDs, network traffic, or solutions from DOM, metadata, or repository JSON files.
2. **The 90-Second Provisional Pin Rule**:
   - In *every* round (300s timer), a provisional pin **must** be placed within the first **30–60 seconds**.
   - Do **not** spend >90s investigating before placing the first pin. Pin first, refine later.
3. **Recorder Verification**:
   - The OpenGuessr video/telemetry extension runs in the background.
   - After submitting each guess, verify the badge displays `SAVED · Round X` before clicking `Continue ▶`.

---

## 2. Standardized Round Lifecycle (3-Phase Protocol)

For every round, adhere strictly to this timeline:

```
[00:00 - 00:30] Phase 1: Rapid Orientation & Provisional Pin
                ├─ Capture untouched panorama screenshot
                ├─ Identify macro-region (country / landscape / driving side)
                └─ PLACE PROVISIONAL PIN immediately:
                   python3 nautilus_player.py pin <lat> <lng> 7

[00:30 - 03:00] Phase 2: Targeted Refinement & Map Cross-Referencing
                ├─ Rotate camera / step forward to read signs, road markings, domain names
                ├─ Open / zoom in-game map to match town/corridor names
                └─ UPDATE REFINED PIN:
                   python3 nautilus_player.py pin <lat> <lng> <zoom>

[03:00 - 03:30] Phase 3: Guess Submission & Logging
                ├─ Submit guess: python3 nautilus_player.py guess
                ├─ Capture result screenshot
                ├─ Verify recorder status ('SAVED · Round X')
                ├─ Log clues, belief, coordinates, distance, and XP in report
                └─ Advance: python3 nautilus_player.py continue
```

---

## 3. Automation Tool: `nautilus_player.py`

Use the pre-built, tested CLI in `nautilus_player.py`. Avoid writing ad-hoc CDP WebSocket scripts for basic interactions.

### Available CLI Commands

| Command | Usage | Description |
| :--- | :--- | :--- |
| `pin` | `python3 nautilus_player.py pin <lat> <lng> [zoom]` | Pans in-game map and dispatches synthetic Leaflet click, placing the red marker and activating the Guess button. |
| `guess` | `python3 nautilus_player.py guess` | Clicks the red `Guess` button. |
| `continue` | `python3 nautilus_player.py continue` | Clicks `Continue ▶` to advance to the next round. |
| `confirm` | `python3 nautilus_player.py confirm` | Clicks `Confirm` on competition start modals. |
| `snap` | `python3 nautilus_player.py snap <filepath>` | Captures a viewport screenshot to the given path. |
| `look` | `python3 nautilus_player.py look <heading_delta_deg>` | Rotates Street View horizontally by specified degrees. |
| `step` | `python3 nautilus_player.py step` | Clicks the forward navigation chevron on the road. |
| `reset_view` | `python3 nautilus_player.py reset_view` | Clicks the `Return` button to reset to spawn position. |

---

## 4. Technical Pitfalls & How to Avoid Them

### A. The "Unplaced Marker / Disabled Guess Button" Bug
- **The Pitfall**: Calling Leaflet `map.setView()` or `L.marker().addTo(map)` updates the map visual but does **not** trigger OpenGuessr's internal marker-drop event handler. The `Guess` button remains gray/disabled.
- **The Solution**: Always use `nautilus_player.py pin <lat> <lng> [zoom]`. It converts the geographic coordinates to Leaflet container pixel coordinates (`map.latLngToContainerPoint`) and dispatches a full synthetic `mousedown` / `mouseup` / `click` event sequence onto the Leaflet map container.

### B. Python Environment & Dependencies
- **The Pitfall**: Calling inline scripts with `import websocket` fails because the installed library is `websockets` (asyncio-based).
- **The Solution**: Always invoke `nautilus_player.py` directly. Do not create inline python snippets that mix websocket client libraries.

### C. Street View Vertical Pitch Drift
- **The Pitfall**: Random mouse dragging across the canvas often introduces vertical pitch drift, leaving the camera staring at the sky or ground.
- **The Solution**: Use `python3 nautilus_player.py look <deg>` for strictly horizontal rotation, or click `Return` (`python3 nautilus_player.py reset_view`) to restore horizon alignment.

### D. Modal Interception at Competition End
- **The Pitfall**: On Round 8 completion, a modal popup ("Results for [tier]") overlays the page, hiding the round summary map.
- **The Solution**: Calculate the 8th round score directly by subtracting the sum of Rounds 1–7 from the total score displayed in the competition summary modal (`Score_R8 = Total_Pts - Sum(R1..R7)`).

---

## 5. Visual Clue Hierarchy (Fast Country Identification)

When spawned into an untouched round, scan in this priority order:

1. **Road Surface Text**:
   - Greek characters (`Επαρ.Οδ.` / `Οδός`) → Greece
   - Street suffix `-vej` → Denmark; `-gatan` / `-vägen` → Sweden; `-vei` / `-veien` → Norway; `-katu` / `-tie` → Finland; `-tänav` → Estonia; `-gatvė` → Lithuania; `-iela` → Latvia; `-ova` / `-ska` → Slovakia / Poland
   - 4-digit route numbers on gravel (`3426`) → Lithuania district roads (*rajoniniai keliai*)
2. **Infrastructure & Utility Markings**:
   - Concrete poles with `"LEA - 20 kV / PTA"` → Romania (standard power grid markings)
   - Galvanized steel arched dome-lid dumpsters (*bobur*) → Bulgaria
   - Utility poles with white-stenciled black numbers / climbing rungs
3. **Road Markings & Bollards**:
   - Solid outer white lines + double center line (one solid, one broken) → Finland
   - Dashed outer shoulder lines (short dashes) → Sweden
   - White delineator posts with black caps and red reflectors → Hungary / Central Europe
4. **Vehicles & Phone Numbers / TLDs**:
   - Commercial vehicles: `.hu` / `+36` (Hungary), `.ro` / `+40` (Romania), `.bg` / `+359` (Bulgaria), `.gr` / `+30` (Greece), `.dk` / `+45` (Denmark), `.pl` / `+48` (Poland)
5. **Flora & Biome**:
   - Coniferous Scots pine (*Pinus sylvestris*) taiga on granite bedrock → Finland / Northern Sweden
   - Flat silver birch / alder regrowth on sandy glacial moraine → Baltics (Latvia / Estonia)
   - Endless flat plains with sunflowers, wheat, corn → Pannonian Basin / Alföld (Hungary)
   - Arid limestone karst with Mediterranean maquis/cypresses → Peloponnese / Greece
