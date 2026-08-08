# CV Final – Geo-Localization Experiment

This repository contains the location definitions, OpenGuessr recording tools, experiment data, and visualization used for our image-geolocation evaluation.

## `locations.json`

`locations.json` is the central definition of the evaluation locations.

Each entry describes one OpenGuessr scene, including:

- location ID
- country and city/region
- difficulty
- scene type
- primary visual clue
- selection notes
- Google Maps / Street View link

The Street View links define the intended starting location, camera heading, and field of view.

### Difficulty splits

The locations are divided into three difficulty groups:

- **Easy**
- **Medium**
- **Hard**

These groups are also used as separate OpenGuessr competitions.

This is necessary because OpenGuessr competitions are limited to a maximum of **20 locations**. Splitting the dataset into Easy, Medium, and Hard keeps every evaluation set within this limit while also providing useful difficulty-based subsets.

The current competition definitions therefore correspond to:

```text
europe-easy
europe-medium
europe-hard
```

### Mandatory zero starting pitch

All Street View starting URLs must use a **0° starting pitch**.

This is important because OpenGuessr effectively initializes the Street View camera at a level pitch anyway. If a source Google Maps URL contains a tilted camera, the visual frame seen in Google Maps may therefore not match the actual starting frame presented in OpenGuessr.

For reproducible evaluation, every location definition is normalized so that:

```text
starting pitch = 0°
```

In copied Google Maps Street View URLs this corresponds to a level `90t` camera value.

Coordinates, panorama, heading, and field of view are preserved.

This normalization is especially important for the **static/NMPZ condition**, because the initial frame is the complete visual input for that experiment.

During interactive runs, pitch may of course change after the round starts. These later pitch changes are recorded normally.

Coordinates and camera information are extracted automatically from the Street View URLs during the build process instead of being stored separately.

---

# `geo-evidence-atlas/`

`geo-evidence-atlas/` contains the tooling for creating OpenGuessr competitions, recording experiments, processing the resulting data, and visualizing the results.

Important parts include:

- **`data/`** – competition definitions, recordings, model results, and generated visualization data
- **`extension/`** – Chrome extension used to record OpenGuessr rounds, predictions, and interactive Street View exploration
- **`scripts/`** – scripts for generating competition links, normalizing locations, and building visualization data
- **Web demo** – interactive map for comparing ground truth, predictions, errors, statistics, and interactive exploration paths

---

# Recording Workflow

The following workflow must be repeated for **every model × competition × condition combination**.

For example:

```text
Model A × Easy × Static
Model A × Easy × Interactive
Model A × Medium × Static
Model A × Medium × Interactive
Model A × Hard × Static
Model A × Hard × Interactive

Model B × Easy × Static
...
```

Manual testing can use:

```text
model: manual
```

---

## 1. Generate the OpenGuessr competition URLs

Open a terminal in:

```text
geo-evidence-atlas/
```

Generate the OpenGuessr competition link files from the current location definitions:

```powershell
npm run competition:export
```

The generated TXT files are stored under:

```text
data/generated/competition-links/
```

For example:

```text
data/generated/competition-links/europe-easy.txt
data/generated/competition-links/europe-medium.txt
data/generated/competition-links/europe-hard.txt
```

Open the TXT file for the desired difficulty/competition and copy its complete contents.

The same generated location URLs can be reused when creating multiple OpenGuessr competitions for different models and conditions.

---

## 2. Create the competition with OpenGuessr account 1

Open:

```text
https://openguessr.com
```

using the **first OpenGuessr account**.

Navigate to:

```text
Menu
→ Competitions
→ Active
→ + Create
```

Create a personal competition.

Fill in a suitable:

- competition name
- description

Then configure the competition.

Example settings:

```text
Round length: 300 seconds
Competition duration: 1 hour
Visibility: Private
```

### Static / NMPZ condition

For the static-image condition choose:

```text
Restriction: NMPZ
```

NMPZ means:

```text
No Move
No Pan
No Zoom
```

This is the condition used for the static-image experiment.

**Important:** the OpenGuessr restriction dropdown can sometimes display incorrectly or make the options difficult to read.

If this happens, move the mouse through the available dropdown entries. Hovering over the possible selections usually makes the option text visible and allows **NMPZ** to be selected correctly.

### Interactive condition

For a run where movement and camera interaction are allowed choose:

```text
Restriction: None
```

This corresponds to:

```text
interactive-panorama
```

and allows movement, panning, zooming, and pitch changes.

---

## 3. Add the custom locations

In the OpenGuessr competition creation page, find the area for custom Google Maps / Street View locations.

Paste the complete contents of the desired generated TXT file.

For example:

```text
data/generated/competition-links/europe-easy.txt
```

Submit/create the competition.

After creation, copy the private competition link.

This link is used with the **second OpenGuessr account** that performs the actual experiment.

---

# 4. Prepare the recorder

Before opening the competition with the second account, make sure the Chrome recorder extension from this repository is installed.

In Chrome open:

```text
chrome://extensions
```

Enable **Developer Mode** and use **Load unpacked** to load the extension from the repository.

After installing or updating the extension, reload the OpenGuessr tab.

---

## Important: start the local collector

Before recording any competition, open a terminal in:

```text
geo-evidence-atlas/
```

and run:

```powershell
npm start
```

Leave this terminal running during the complete experiment.

This starts the local collector used by the extension.

With the collector running, recordings are automatically written into the repository.

If the collector is not running, the extension may fall back to downloading JSON files through the browser instead.

---

# 5. Open the competition with OpenGuessr account 2

Use the **second OpenGuessr account** to open the private competition link created with account 1.

Do not immediately start playing.

Wait until the recorder overlay appears.

The recorder asks for the experiment configuration.

Select or enter:

```text
Competition
Model
Condition
```

The model field is free text.

Examples:

```text
manual
GPT-5.6 Sol
Gemini 3.6 Flash
```

Select the condition corresponding to the OpenGuessr competition.

For an NMPZ competition:

```text
static-image
```

For an unrestricted competition:

```text
interactive-panorama
```

Then press:

```text
Arm & record competition
```

The recorder is now armed but waits for the actual competition to start.

After arming the recorder, press the normal OpenGuessr **Start** button.

---

# 6. Play the complete competition

Play all rounds normally.

For every round the recorder automatically captures:

- starting location
- starting camera state
- prediction
- prediction timestamp
- round duration
- competition round
- matched dataset location

For interactive runs it additionally records:

- movement between Street View panoramas
- heading changes
- pitch changes
- zoom changes
- camera timeline

For static/NMPZ runs these interaction values are not treated as exploration.

After submitting a prediction, the recorder waits for the OpenGuessr result state before saving the completed round.

The saved-round counter should increase during the competition:

```text
1/8 rounds saved
2/8 rounds saved
...
7/8 rounds saved
8/8 rounds saved
```

The counter should only reach:

```text
8/8
```

after the prediction for the final round has actually been submitted.

---

# 7. Finish and disarm the recorder

After the final round has successfully been saved, the recorder displays:

```text
Competition recorded
8/8 rounds saved
```

and provides:

```text
Done & disarm
```

Press **Done & disarm**.

This returns the recorder to its idle state.

The saved JSON files remain in the repository.

The recorder then waits for another OpenGuessr competition before displaying the Arm interface again.

The normal lifecycle is:

```text
Open competition
→ Arm recorder
→ Start competition
→ Play all rounds
→ Final prediction submitted
→ 8/8 rounds saved
→ Done & disarm
→ Recorder idle
```

---

# 8. Recorded files

Completed round recordings are written under:

```text
data/recordings/inbox/
```

They are organized by competition and matched location.

For example:

```text
data/recordings/inbox/
└── europe-easy/
    ├── loc-001/
    │   └── ...__manual__static-image__round-1.json
    ├── loc-002/
    │   └── ...__manual__static-image__round-2.json
    ├── ...
    └── loc-008/
        └── ...__manual__static-image__round-8.json
```

A healthy competition run should produce one completed recording for every location in that competition.

Each recording contains a `sessionId`, which can be used to group all rounds belonging to the same competition run.

---

# 9. Build the recorded data for the demo

After finishing a run, rebuild the visualization data.

From:

```text
geo-evidence-atlas/
```

run:

```powershell
npm run data:build
```

This processes:

- location definitions
- competition definitions
- recorded rounds
- model results

and generates the data used by the web demo.

Generated files are stored under:

```text
data/generated/
```

including:

```text
data/generated/recordings.index.json
data/generated/atlas-cases.json
data/generated/build-report.json
```

The build output also reports warnings when a location has no matching recording or when a recording does not contain a prediction.

---

# 10. Open the visualization

Start or restart the local server:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

If the demo was already open, perform a hard refresh:

```text
Ctrl + F5
```

The new recordings can now be inspected using the competition, model, condition, and location filters.

---

# Static vs. Interactive Visualization

## Static / NMPZ

Static recordings show:

- ground-truth location
- prediction
- geolocation error
- starting camera direction
- ground-truth Street View
- Street View at the predicted location
- evaluation statistics

There is no exploration playback because movement, panning, and zooming are disabled.

The **0° starting pitch requirement is particularly important here**, because this starting frame is the actual visual input used for the static evaluation.

## Interactive panorama

Interactive recordings additionally show:

- exploration path
- visited Street View positions
- playback timeline
- camera heading
- camera pitch
- zoom changes
- exploration duration

Although every location starts at pitch `0°`, pitch changes made during interactive exploration are recorded and can be visualized later.

---

# Repeating Experiments

The complete workflow must be repeated for **every model × competition × condition** combination.

The three competition groups are:

```text
europe-easy
europe-medium
europe-hard
```

and the two experimental conditions are:

```text
static-image
interactive-panorama
```

For example, one model requires:

```text
Easy   × Static
Easy   × Interactive

Medium × Static
Medium × Interactive

Hard   × Static
Hard   × Interactive
```

The same process then has to be repeated for the other model.

OpenGuessr currently only allows the same account to participate in a given competition once.

Therefore, another private competition has to be created when another run is required.

The location URLs do **not** need to be recreated. The same generated TXT file can simply be pasted into another competition.

For example:

```text
Generate Easy location TXT
        ↓
Create Easy competition
        ↓
Run Model A / Static
        ↓
Create another Easy competition with same URLs
        ↓
Run Model A / Interactive
        ↓
Create another Easy competition with same URLs
        ↓
Run Model B / Static
        ↓
Create another Easy competition with same URLs
        ↓
Run Model B / Interactive
```

The same procedure is then repeated for Medium and Hard.

---

# Useful Commands

Run these commands from:

```text
geo-evidence-atlas/
```

Generate OpenGuessr competition URL files:

```powershell
npm run competition:export
```

List available competition definitions:

```powershell
npm run competition:list
```

Normalize all location definition URLs to zero starting pitch:

```powershell
npm run locations:zero-pitch
```

This should be run whenever location URLs have been manually changed so that the mandatory `0°` starting-pitch convention remains consistent.

Build/rebuild visualization data:

```powershell
npm run data:build
```

Start the local collector and web demo:

```powershell
npm start
```

The collector should always be running while an experiment is being recorded.