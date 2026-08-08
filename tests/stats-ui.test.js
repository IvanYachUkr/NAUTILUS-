import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("overview statistics use the same predicted-case scope as the overview map", () => {
  assert.ok(source.includes("return caseItem ? [caseItem] : getOverviewMapCases(filteredCases);"));
  assert.ok(source.includes("renderDrawer(caseItem, run, getStatsCases(caseItem, filteredCases));"));
  assert.ok(source.includes("predictions in the current map view"));
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
