import assert from "node:assert/strict";
import test from "node:test";
import { shellMarkup } from "../src/app.js";

test("the location shell renders the embedded Street View walk control", () => {
  const markup = shellMarkup([]);
  assert.match(markup, /data-walk-here[^>]*aria-haspopup="dialog"/);
  assert.match(markup, />\s*<span>Walk here<\/span>/);
  assert.match(markup, /data-street-view-dialog/);
});
