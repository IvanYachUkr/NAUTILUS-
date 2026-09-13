import assert from "node:assert/strict";
import test from "node:test";
import { shellMarkup } from "../src/app.js";
import { mapsEmbedUrl, walkHereUrl } from "../src/street-view.js";

test("the location shell renders the embedded Street View walk control", () => {
  const markup = shellMarkup([]);
  assert.match(markup, /data-walk-here[^>]*aria-haspopup="dialog"/);
  assert.match(markup, />\s*<span>Walk here<\/span>/);
  assert.match(markup, /data-street-view-dialog/);
});

test("Walk here remains available when the embedded Maps key is absent", () => {
  const caseItem = {
    startingView: { lat: 52.0907, lng: 5.1214 },
  };

  assert.match(walkHereUrl(caseItem), /^https:\/\/www\.google\.com\/maps\//);
  assert.equal(mapsEmbedUrl(caseItem, ""), null);
});
