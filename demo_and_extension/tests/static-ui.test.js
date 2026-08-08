import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStreetViewUrl } from "../src/geo.js";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("static/NMPZ suppresses playback UI and playback drawer", () => {
  assert.ok(appSource.includes('const isStatic = run?.condition === "static-image";'));
  assert.ok(appSource.includes("elements.explorationPlayer.hidden = true;"));
  assert.ok(appSource.includes("mapController.setPlayback(null);"));
  assert.ok(appSource.includes('const playbackAllowed = run?.condition !== "static-image";'));
  assert.ok(appSource.includes('"Static / NMPZ · fixed view"'));
});

test("ground truth uses canonical static imagery while predictions keep an optional Street View link", () => {
  assert.ok(appSource.includes("No canonical static image yet"));
  assert.ok(!appSource.includes("Open ground-truth Street View ↗"));
  assert.ok(appSource.includes("Open Street View at prediction ↗"));
  assert.ok(appSource.includes("safeStreetViewUrl(run.prediction)"));
});

test("interactive playback embeds the round video directly instead of using a frame-inspector tab", () => {
  assert.ok(appSource.includes("Open captured image ↗"));
  assert.ok(appSource.includes("Show round video in side panel"));
  assert.ok(appSource.includes('event.target.closest("[data-open-current-view]")'));
  assert.ok(appSource.includes('drawerMode = "playback";'));
  assert.ok(appSource.includes("evidenceVideoMarkup"));
  assert.ok(appSource.includes("data-inline-round-video"));
  assert.ok(appSource.includes("primeInlineVideos"));
  assert.ok(appSource.includes("The player contains only this location/round"));
  assert.ok(!appSource.includes("Inspect recorded frame ↗"));
  assert.ok(!appSource.includes("Open this Street View ↗"));
});

test("key moments seek the embedded round video to their exact timestamp", () => {
  assert.ok(appSource.includes("data-moment-time-ms"));
  assert.ok(appSource.includes("exactTimeMs"));
  assert.ok(appSource.includes("drawerSeekMs"));
  assert.ok(appSource.includes("playbackDrawerMarkup(sample, run, drawerSeekMs)"));
  assert.ok(appSource.includes("formatSeconds(playbackTimeMs)"));
});

test("playback drawer stays open when switching locations", () => {
  assert.ok(appSource.includes('["stats", "truth", "prediction", "playback"].includes(drawerMode)'));
  assert.ok(appSource.includes("drawerCaseId = caseItem?.id ?? null"));
  assert.ok(appSource.includes("drawerRunId = run?.id ?? null"));
});

test("prediction coordinates create a Google Street View deep link", () => {
  const url = new URL(buildStreetViewUrl({ lat: 48.737710577671855, lng: 15.1171875 }));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("map_action"), "pano");
  assert.equal(url.searchParams.get("viewpoint"), "48.737710577671855,15.1171875");
});


test("map overview only includes cases with a prediction for the selected run slice", () => {
  assert.ok(appSource.includes("getOverviewMapCases(filteredCases)"));
  assert.ok(appSource.includes("matchingRun && hasCoordinate(matchingRun.prediction)"));
  assert.ok(appSource.includes("predicted locations"));
});

test("static/NMPZ never creates a map playback descriptor", () => {
  assert.ok(appSource.includes('if (run?.condition === "static-image") return null;'));
});


test("static direction remains visible without re-enabling playback", async () => {
  const mapSource = await readFile(new URL("../src/map-controller.js", import.meta.url), "utf8");
  const cssSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(mapSource.includes("renderStaticHeading(selectedCase, selectedRun)"));
  assert.ok(cssSource.includes(".static-heading-marker { pointer-events: none !important; }"));
  assert.ok(cssSource.includes(".static-heading-marker .playback-marker__wrap"));
  assert.ok(cssSource.includes("width: 78px;"));
  assert.ok(mapSource.includes("const size = isStatic ? 78 : 46;"));
  assert.ok(appSource.includes('if (run?.condition === "static-image") return null;'));
});
