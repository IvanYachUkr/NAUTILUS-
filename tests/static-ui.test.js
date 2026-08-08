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

test("ground-truth and prediction drawers expose Street View actions", () => {
  assert.ok(appSource.includes("Open ground-truth Street View ↗"));
  assert.ok(appSource.includes("Open Street View at prediction ↗"));
  assert.ok(appSource.includes("safeStreetViewUrl(run.prediction)"));
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
