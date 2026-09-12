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

test("overview globe stays centered inside its circular frame at every size", () => {
  assert.equal(typeof globeController.globeOffsetForView, "function");

  assert.deepEqual(
    globeController.globeOffsetForView({ overview: true, width: 1000, height: 700 }),
    [0, 0],
  );
  assert.deepEqual(
    globeController.globeOffsetForView({ overview: true, width: 2000, height: 900 }),
    [0, 0],
  );
});

test("mobile detail globe peeks up from the bottom with the selected pin in view", () => {
  assert.deepEqual(
    globeController.globeOffsetForView({
      overview: false,
      width: 390,
      height: 480,
      mobile: true,
    }),
    [70, 212],
  );

  assert.deepEqual(
    globeController.globePointOfViewForSelection({
      focus: { lat: 55, lng: 12 },
      altitude: 1.48,
      mobile: true,
    }),
    { lat: 25, lng: 12, altitude: 2.25 },
  );
});
