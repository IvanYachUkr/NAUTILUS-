import assert from "node:assert/strict";
import test from "node:test";

import * as globeController from "../src/globe-controller.js";

test("detail globe offset biases the earth toward the lower-right corner", () => {
  assert.equal(typeof globeController.globeOffsetForView, "function");

  assert.deepEqual(
    globeController.globeOffsetForView({ overview: false, width: 628, height: 445 }),
    [50, 36],
  );
  assert.deepEqual(
    globeController.globeOffsetForView({ overview: false, width: 350, height: 300 }),
    [28, 24],
  );
});

test("overview globe keeps its established wide-screen framing", () => {
  assert.equal(typeof globeController.globeOffsetForView, "function");

  assert.deepEqual(
    globeController.globeOffsetForView({ overview: true, width: 1000, height: 700 }),
    [80, 18],
  );
  assert.deepEqual(
    globeController.globeOffsetForView({ overview: true, width: 2000, height: 900 }),
    [110, 18],
  );
});
