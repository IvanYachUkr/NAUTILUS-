import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeClueRatings } from "../src/app.js";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("overview statistics include the selected model even when a prediction pin is missing", () => {
  assert.ok(source.includes("return filteredCases.filter((item) => chooseRun("));
  assert.ok(source.includes("renderDrawer(caseItem, run, getStatsCases(caseItem, filteredCases));"));
  assert.ok(source.includes("stats.cueRatings.visible"));
});

test("statistics stay open across overview transitions while pin-detail drawers close", () => {
  assert.ok(source.includes('function enterOverview()'));
  assert.ok(source.includes('if (drawerMode !== "stats")'));
  assert.ok(source.includes('clearDrawerState();'));
});

test("statistics identify an explicitly selected location in the current slice", () => {
  assert.ok(source.includes("selectedStatsCase"));
  assert.ok(source.includes("selectedStatsCase.city"));
});

test("clue rating summaries report positive, negative, rated, and unrated counts", () => {
  const summary = summarizeClueRatings([
    { ratings: { visible: true, correct: false } },
    { ratings: { visible: false, correct: false } },
    { ratings: { visible: true, correct: null } },
  ]);
  assert.deepEqual(summary.visible, {
    positive: 2,
    negative: 1,
    rated: 3,
    unrated: 0,
    ratio: 2 / 3,
  });
  assert.deepEqual(summary.correct, {
    positive: 0,
    negative: 2,
    rated: 2,
    unrated: 1,
    ratio: 0,
  });
});

test("location statistics omit error buckets", () => {
  assert.ok(source.includes('selectedStatsCase ? "" : `<div class="drawer-section">'));
});
