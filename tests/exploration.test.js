import test from "node:test";
import assert from "node:assert/strict";
import {
  extractMovementPath,
  extractTimelineSamples,
  explorationDistanceKm,
  nearestSampleIndex,
  normalizeExploration,
  sampleToStreetView,
} from "../src/exploration.js";

test("extractMovementPath removes rotation-only duplicate positions", () => {
  const recorder = {
    recorder: { name: "Test recorder" },
    samples: [
      { lat: 59.44415, lng: 24.75288, heading: 0, tMs: 0 },
      { lat: 59.44415, lng: 24.75288, heading: 90, tMs: 250 },
      { lat: 59.44461, lng: 24.75318, heading: 90, tMs: 500 },
      { lat: 59.44461, lng: 24.75318, heading: 180, tMs: 750 },
    ],
  };

  const path = extractMovementPath(recorder);
  assert.equal(path.length, 2);
  assert.equal(path[1].lat, 59.44461);
});

test("extractTimelineSamples keeps camera-only changes", () => {
  const recorder = {
    samples: [
      { lat: 59.44415, lng: 24.75288, heading: 0, tMs: 0, zoom: 0.4 },
      { lat: 59.44415, lng: 24.75288, heading: 90, tMs: 250, zoom: 0.2 },
      { lat: 59.44461, lng: 24.75318, heading: 90, tMs: 500, zoom: 0.2 },
    ],
  };

  const samples = extractTimelineSamples(recorder);
  assert.equal(samples.length, 3);
  assert.equal(samples[1].heading, 90);
  assert.equal(samples[1].zoom, 0.2);
});

test("normalizeExploration preserves useful recorder metadata and key moments", () => {
  const recorder = {
    recorder: { name: "OpenGuessr Movement Recorder (Research)" },
    startedAt: "2026-08-07T13:26:29.280Z",
    durationMs: 32340,
    keyMoments: [{ label: "Street sign", tMs: 500 }],
    samples: [
      { lat: 59.44415, lng: 24.75288, tMs: 0 },
      { lat: 59.44515, lng: 24.75288, tMs: 500 },
    ],
  };

  const normalized = normalizeExploration(recorder);
  assert.equal(normalized.source, "OpenGuessr Movement Recorder (Research)");
  assert.equal(normalized.sampleCount, 2);
  assert.equal(normalized.pointCount, 2);
  assert.equal(normalized.durationMs, 32340);
  assert.equal(normalized.keyMoments[0].sampleIndex, 1);
});

test("explorationDistanceKm computes path distance", () => {
  const km = explorationDistanceKm({
    path: [
      { lat: 48.85837, lng: 2.29448 },
      { lat: 48.85937, lng: 2.29448 },
    ],
  });
  assert.ok(km > 0.1 && km < 0.12);
});

test("sampleToStreetView clamps recorder field of view for Google URLs", () => {
  const view = sampleToStreetView({ lat: 1, lng: 2, heading: 450, pitch: 3, fov: 109.4 });
  assert.equal(view.viewpoint.lat, 1);
  assert.equal(view.fov, 100);
});

test("nearestSampleIndex finds closest time", () => {
  const samples = [{ tMs: 0 }, { tMs: 1000 }, { tMs: 2200 }];
  assert.equal(nearestSampleIndex(samples, 1700), 2);
});

test("interactive movement path ignores late DOM spawn heartbeats that would fake a return to start", () => {
  const recorder = {
    condition: "interactive-panorama",
    captureMode: "interactive",
    samples: [
      { seq: 0, tMs: 0, lat: 48.81260, lng: 14.31298, source: "api", panoId: "start" },
      { seq: 1, tMs: 1200, lat: 48.81310, lng: 14.31360, source: "api", panoId: "moved" },
      // The embed URL still describes the spawn and can arrive later as a DOM heartbeat.
      { seq: 2, tMs: 2000, lat: 48.81260, lng: 14.31298, source: "openguessr-dom", reason: "dom_probe" },
    ],
  };

  const path = extractMovementPath(recorder);
  assert.equal(path.length, 2);
  assert.equal(path[0].source, "api");
  assert.equal(path.at(-1).panoId, "moved");
  assert.notEqual(path.at(-1).lat, path[0].lat);
});

test("interactive movement path stops at prediction intent instead of following result-screen API reset", () => {
  const recorder = {
    condition: "interactive-panorama",
    captureMode: "interactive",
    startedAt: "2026-08-08T01:00:00.000Z",
    diagnostics: {
      events: [
        { name: "prediction_intent", at: "2026-08-08T01:00:05.000Z" },
        { name: "result_visible", at: "2026-08-08T01:00:05.150Z" },
      ],
    },
    samples: [
      { seq: 0, tMs: 0, lat: 48.0, lng: 14.0, source: "api", panoId: "a" },
      { seq: 1, tMs: 4000, lat: 48.001, lng: 14.002, source: "api", panoId: "b" },
      // OpenGuessr result UI resets camera to spawn after Guess; this is not user movement.
      { seq: 2, tMs: 5100, lat: 48.0, lng: 14.0, source: "api", panoId: "a" },
    ],
  };

  const path = extractMovementPath(recorder);
  assert.equal(path.length, 2);
  assert.equal(path.at(-1).panoId, "b");
});
