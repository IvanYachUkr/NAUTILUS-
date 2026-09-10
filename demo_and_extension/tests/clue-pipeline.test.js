import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { loadClueDocuments, validateClueDocument } from "../scripts/lib/clues.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the cleaned Gemini clue set covers every benchmark location and all three runs", async () => {
  const errors = [];
  const documents = await loadClueDocuments({ errors });
  assert.deepEqual(errors, []);
  assert.equal(documents.length, 25);

  const clues = documents.flatMap((document) => document.clueSets[0].cues);
  assert.ok(clues.length >= documents.length);
  assert.ok(documents.every((document) => document.clueSets[0].id === "gemini-3.7-flash-high-aided"));
  assert.ok(documents.every((document) => !document.clueSets[0].benchmarkId || document.clueSets[0].benchmarkId === "gemini-3-7-flash-high-aided"));
  assert.ok(documents.every((document) => document.clueSets[0].sourceRuns.length === 3));
  assert.ok(clues.some((clue) => clue.sourceRuns.length >= 2));
  assert.ok(clues.every((clue) => clue.provenance.length >= 1));
  assert.ok(clues.some((clue) => clue.annotationStatus === "reviewed"));
});

test("clue documents reject out-of-bounds regions", () => {
  const document = {
    locationId: "example--loc-001",
    clueSets: [{
      id: "example",
      model: "Example model",
      sourceRuns: [{ runId: "r1" }],
      cues: [{
        id: "cue-1",
        label: "Tower",
        text: "Tower",
        description: "A visible tower.",
        source: "starting-image",
        category: "landmark",
        annotationStatus: "needs-review",
        region: { x: 0.8, y: 0.2, w: 0.4, h: 0.2 },
        provenance: [{ runId: "r1", text: "tower" }],
      }],
    }],
  };
  assert.ok(validateClueDocument(document).some((error) => error.includes("x + width")));
});

test("the local review tool can load and save validated clue documents", async () => {
  const [markup, client, server] = await Promise.all([
    readFile(join(root, "tools/clue-review/index.html"), "utf8"),
    readFile(join(root, "tools/clue-review/app.js"), "utf8"),
    readFile(join(root, "scripts/serve.mjs"), "utf8"),
  ]);
  assert.ok(markup.includes("data-stage"));
  assert.ok(markup.includes("data-inspector"));
  assert.ok(client.includes('method: "PUT"'));
  assert.ok(client.includes("data-resize"));
  assert.ok(server.includes('url.pathname === "/api/clues"'));
  assert.ok(server.includes('request.method === "PUT" && clueDocumentMatch'));
});
