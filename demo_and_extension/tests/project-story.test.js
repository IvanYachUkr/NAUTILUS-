import assert from "node:assert/strict";
import test from "node:test";

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
    [110_273, 107_838, 80_081],
  );
  assert.deepEqual(
    snapshot.leaderboard.map((entry) => entry.scorePercent),
    [88.2, 86.3, 64.1],
  );
  assert.deepEqual(
    snapshot.leaderboard.map((entry) => entry.rank),
    [1, 2, 3],
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
  assert.ok(markup.includes("110,273"));
  assert.ok(markup.includes('value="110273" max="125000"'));
  assert.ok(markup.includes("https://github.com/IvanYachUkr/NAUTILUS-"));
  assert.ok(markup.includes('alt="Paris street scene at Place de la Bastille"'));
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
