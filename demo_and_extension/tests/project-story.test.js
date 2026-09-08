import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import {
  RECORDED_BENCHMARKS,
  buildProjectSnapshot,
  normalizeProjectSection,
  projectSectionAtViewport,
  projectStoryMarkup,
  setActiveProjectSection,
  scrollToMethodStage,
  scrollToProjectSection,
} from "../src/project-story.js";

const cases = [
  { id: "one", difficulty: "easy" },
  { id: "two", difficulty: "easy" },
  { id: "three", difficulty: "medium" },
  { id: "four", difficulty: "hard" },
];

test("project snapshot derives the live benchmark mix and ranks recorded runs", () => {
  const snapshot = buildProjectSnapshot(cases, RECORDED_BENCHMARKS);

  assert.equal(snapshot.locationCount, 4);
  assert.deepEqual(snapshot.difficultyCounts, { easy: 2, medium: 1, hard: 1 });
  assert.deepEqual(
    snapshot.leaderboard.map((entry) => entry.points),
    [120_029, 357_737 / 3, 333_781 / 3, 111_161, 332_425 / 3, 105_026, 74_955, 64_350],
  );
  assert.deepEqual(
    snapshot.leaderboard.map((entry) => entry.scorePercent),
    [96.0, 95.4, 89.0, 88.9, 88.6, 84.0, 60.0, 51.5],
  );
  assert.deepEqual(
    snapshot.leaderboard.map((entry) => entry.rank),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("project navigation accepts only real single-page section ids", () => {
  assert.equal(normalizeProjectSection("method"), "method");
  assert.equal(normalizeProjectSection("  results "), "results");
  assert.equal(normalizeProjectSection("missing"), null);
  assert.equal(normalizeProjectSection(""), null);
});

test("project navigation exposes exactly one current story section", () => {
  const links = ["explorer", "research", "method", "results", "evidence", "team"].map(
    (scrollTarget) => {
      const classes = new Set();
      const attributes = new Map();
      return {
        dataset: { scrollTarget },
        classList: {
          contains(value) {
            return classes.has(value);
          },
          toggle(value, enabled) {
            if (enabled) classes.add(value);
            else classes.delete(value);
          },
        },
        setAttribute(name, value) {
          attributes.set(name, value);
        },
        removeAttribute(name) {
          attributes.delete(name);
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        },
      };
    },
  );
  const root = {
    dataset: {},
    querySelectorAll(selector) {
      assert.equal(selector, "[data-story-navigation] [data-scroll-target]");
      return links;
    },
  };

  assert.equal(setActiveProjectSection(root, "results"), true);
  assert.equal(root.dataset.activeSection, "results");
  assert.deepEqual(
    links.filter((link) => link.classList.contains("is-active")).map((link) => link.dataset.scrollTarget),
    ["results"],
  );
  assert.equal(links.find((link) => link.dataset.scrollTarget === "results").getAttribute("aria-current"), "location");
  assert.equal(links.find((link) => link.dataset.scrollTarget === "research").getAttribute("aria-current"), null);
  assert.equal(setActiveProjectSection(root, "missing"), false);
});

test("story position tracking selects the last section above the reading line", () => {
  const section = (id, top) => ({
    dataset: { siteSectionId: id },
    getBoundingClientRect() {
      return { top };
    },
  });

  assert.equal(
    projectSectionAtViewport(
      [section("explorer", -900), section("research", -80), section("method", 640)],
      320,
    ),
    "research",
  );
  assert.equal(
    projectSectionAtViewport([section("explorer", 0), section("research", 900)], 320),
    "explorer",
  );
  assert.equal(projectSectionAtViewport([], 320), null);
});

test("project story renders every research section with live benchmark values", () => {
  const markup = projectStoryMarkup(buildProjectSnapshot(cases, RECORDED_BENCHMARKS));

  for (const sectionId of ["research", "method", "results", "evidence", "team"]) {
    assert.ok(markup.includes(`data-site-section-id="${sectionId}"`));
  }

  assert.ok(markup.includes("4 European scenes"));
  assert.ok(markup.includes("2 easy"));
  assert.ok(markup.includes("119,246"));
  assert.ok(markup.includes('value="119245.66666666667" max="125000"'));
  assert.ok(markup.includes("119,818"));
  assert.ok(markup.includes("Run 1 Hard and Run 3 Medium"));
  assert.ok(markup.includes("without globe pins"));
  assert.ok(markup.includes("https://github.com/IvanYachUkr/NAUTILUS-"));
  assert.ok(markup.includes('alt="Paris street scene at Place de la Bastille"'));
});

test("Astra displayed scores match the published summary and hashed evidence", async () => {
  const base = new URL("../data/recorded-agent-benchmark/gpt-6-astra-low/", import.meta.url);
  const summary = JSON.parse(await readFile(new URL("summary.json", base), "utf8"));
  const entry = RECORDED_BENCHMARKS.find((item) => item.id === "gpt-6-astra-low");
  assert.equal(entry.points, summary.mean.total);
  assert.equal(summary.runs.length, 3);
  for (const [index, run] of summary.runs.entries()) {
    assert.equal(run.easy + run.medium + run.hard, run.total);
    for (const key of ["easy", "medium", "hard", "total"]) {
      assert.equal(entry.runs[index][key], run[key]);
    }
  }
  const evidence = JSON.parse(await readFile(new URL("evidence-manifest.json", base), "utf8"));
  assert.equal(evidence.filter((item) => item.role === "valid-round-result").length, 73);
  assert.equal(evidence.filter((item) => item.role === "leaderboard").length, 9);
  assert.equal(evidence.filter((item) => item.role === "excluded-attempt").length, 2);
  for (const item of evidence) {
    const data = await readFile(new URL(item.path, base));
    assert.equal(data.length, item.bytes, item.path);
    assert.equal(createHash("sha256").update(data).digest("hex"), item.sha256, item.path);
  }
});

test("project navigation scrolls the requested section without changing the URL hash", () => {
  let selector = null;
  let scrollOptions = null;
  const target = {
    scrollIntoView(options) {
      scrollOptions = options;
    },
  };
  const root = {
    querySelector(nextSelector) {
      selector = nextSelector;
      return target;
    },
  };

  assert.equal(scrollToProjectSection(root, "results", { behavior: "auto" }), true);
  assert.equal(selector, '[data-site-section-id="results"]');
  assert.deepEqual(scrollOptions, { behavior: "auto", block: "start" });
  assert.equal(scrollToProjectSection(root, "unknown"), false);
});

test("workflow navigation focuses the exact method card", () => {
  let selector = null;
  let scrollOptions = null;
  let focusOptions = null;
  const target = {
    scrollIntoView(options) {
      scrollOptions = options;
    },
    focus(options) {
      focusOptions = options;
    },
  };
  const root = {
    querySelector(nextSelector) {
      selector = nextSelector;
      return target;
    },
  };

  assert.equal(scrollToMethodStage(root, "explore", { behavior: "auto" }), true);
  assert.equal(selector, '[data-method-stage-id="explore"]');
  assert.deepEqual(scrollOptions, { behavior: "auto", block: "center" });
  assert.deepEqual(focusOptions, { preventScroll: true });
  assert.equal(scrollToMethodStage(root, "missing"), false);
});
