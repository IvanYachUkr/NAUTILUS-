import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPEN_GUESSR_COMPETITION_MAX_LOCATIONS,
  buildData,
} from "./build-data.mjs";
import {
  saveCompetitionSession,
  saveRecordingCheckpoint,
  saveRoundRecording,
} from "./lib/recordings.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number.parseInt(process.argv[2] ?? process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 20 * 1024 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError("Port must be an integer between 1 and 65535.");
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
]);

let workspace = await buildData({ quiet: true });

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${host}:${port}`}`,
    );

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl);
      return;
    }

    serveStatic(response, requestUrl);
  } catch (error) {
    if (!response.headersSent) {
      const status =
        Number.isInteger(error?.statusCode)
          ? error.statusCode
          : error instanceof SyntaxError || error instanceof TypeError
            ? 400
            : 500;
      respondJson(response, status, {
        ok: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }
});

server.listen(port, host, () => {
  console.log(`Geo Evidence Atlas running at http://${host}:${port}`);
  console.log(`Round collector: http://${host}:${port}/api/recordings`);
  console.log(
    `Loaded ${workspace.locations.length} locations and ${workspace.competitions.length} competition setups.`,
  );
  console.log("Press Ctrl+C to stop.");
});

async function handleApi(request, response, url) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    respondJson(response, 200, {
      ok: true,
      service: "geo-evidence-atlas-collector",
      version: "0.7.1",
      supportsCheckpoints: true,
      locations: workspace.locations.length,
      competitions: workspace.competitions.map((competition) => ({
        id: competition.id,
        name: competition.name,
        shortName: competition.shortName,
        datasetId: competition.datasetId,
        order: competition.order,
        count: competition.locationIds.length,
        partCount: competition.parts.length,
        parts: competition.parts.map((part) => ({
          id: part.id,
          part: part.part,
          count: part.locationIds.length,
        })),
      })),
      maxCompetitionLocations: OPEN_GUESSR_COMPETITION_MAX_LOCATIONS,
      recordings: workspace.recordings.length,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/recordings") {
    const recording = await readJsonBody(request, MAX_BODY_BYTES);
    const saved = await saveRoundRecording({
      recording,
      locations: workspace.locations,
      competitions: workspace.competitions,
    });

    // Rebuild generated indexes and attach the newest matching recording to an
    // existing result run. The browser can then refresh and see it immediately.
    workspace = await buildData({ quiet: true });

    const matchedCompetition = workspace.competitions.find(
      (competition) => competition.id === saved.recording.competitionId,
    );

    respondJson(response, 201, {
      ok: true,
      path: saved.relativePath,
      locationId: saved.recording.locationId,
      locationMatchDistanceMeters:
        saved.recording.locationMatch?.distanceMeters ?? null,
      recordingId: saved.recording.id ?? null,
      atlasLocationId: saved.recording.atlasLocationId ?? null,
      competitionPartId: saved.recording.competitionPartId ?? null,
      competitionPart: saved.recording.competitionPart ?? null,
      competitionRound: saved.recording.competitionRound ?? null,
      competitionOverallIndex: saved.recording.competitionOverallIndex ?? null,
      competitionLocationCount: matchedCompetition?.locationIds.length ?? null,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/checkpoints") {
    const checkpoint = await readJsonBody(request, MAX_BODY_BYTES);
    const saved = await saveRecordingCheckpoint({ checkpoint });
    respondJson(response, 201, {
      ok: true,
      path: saved.relativePath,
      checkpointId: saved.checkpoint.id ?? null,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const session = await readJsonBody(request, 2 * 1024 * 1024);
    const saved = await saveCompetitionSession({ session });
    respondJson(response, 200, {
      ok: true,
      path: saved.relativePath,
      sessionId: saved.session.sessionId,
      roundCount: Array.isArray(saved.session.rounds) ? saved.session.rounds.length : 0,
    });
    return;
  }

  respondJson(response, 404, { ok: false, error: "API endpoint not found." });
}

function serveStatic(response, requestUrl) {
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = normalize(decodedPath).replace(/^([/\\])+/, "");
  let filePath = resolve(join(root, relativePath || "index.html"));

  if (!filePath.startsWith(root)) {
    respondText(response, 403, "Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    respondText(response, 404, "Not found");
    return;
  }

  const type =
    mimeTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": filePath.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(filePath).pipe(response);
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error(
        `Request body exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
      );
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new TypeError("Request body is empty.");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(
      `Request body is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  response.setHeader("Access-Control-Max-Age", "86400");
}

function respondJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function respondText(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}
