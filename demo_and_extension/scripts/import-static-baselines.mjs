#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(DEMO_ROOT, "..");
const COMPETITIONS_DIR = join(DEMO_ROOT, "data", "competitions");
const OUTPUT_DIR = join(DEMO_ROOT, "data", "results", "static-baselines");

const DATASETS = ["europe-easy", "europe-medium", "europe-hard"];

const BASELINES = [
  {
    id: "geoclip",
    model: "GeoCLIP",
    resultDir: join(REPO_ROOT, "geoclip", "results"),
    filename: (dataset) => `geoclip_static_${dataset}.csv`,
    errorColumn: "top1_error_km",
    durationColumn: "inference_seconds",
    note: "GeoCLIP direct image-to-coordinate static baseline.",
  },
  {
    id: "salad",
    model: "SALAD + OSV-5M",
    resultDir: join(REPO_ROOT, "salad", "results"),
    filename: (dataset) => `salad_ivfflat_nprobe64_${dataset}.csv`,
    errorColumn: "top1_error_km",
    durationColumn: "inference_seconds",
    note:
      "SALAD top-1 OSV-5M retrieval coordinate used by the published benchmark result.",
  },
  {
    id: "plonk",
    model: "PLONK OSV-5M",
    resultDir: join(REPO_ROOT, "plonk", "results"),
    filename: (dataset) => `plonk_osv5m_static_${dataset}.csv`,
    errorColumn: "prediction_error_km",
    durationColumn: "inference_seconds",
    note: "PLONK OSV-5M final static-image prediction.",
  },
  {
    id: "chipointv2",
    model: "Chipoint v2",
    resultDir: join(REPO_ROOT, "chipointv2", "results"),
    filename: (dataset) => `chipointv2_local_static_${dataset}.csv`,
    errorColumn: "prediction_error_km",
    durationColumn: null,
    note:
      "Chipoint v2 public three-tower fused retrieval final cluster-consensus prediction.",
  },
];

export async function importStaticBaselines({ quiet = false } = {}) {
  const competitions = await loadCompetitions();
  const runsByLocation = new Map();
  const importedCounts = new Map(
    BASELINES.map((baseline) => [baseline.id, 0]),
  );

  for (const baseline of BASELINES) {
    for (const dataset of DATASETS) {
      const csvPath = join(
        baseline.resultDir,
        baseline.filename(dataset),
      );
      const text = await readFile(csvPath, "utf8");
      const rows = parseCsv(text);
      const competition = competitions.get(dataset);

      if (!competition) {
        throw new Error(
          `Missing competition definition for ${dataset}.`,
        );
      }

      for (const row of rows) {
        const locationId = String(row.location_id ?? "").trim();

        if (!locationId) {
          throw new Error(
            `${relative(REPO_ROOT, csvPath)} contains a row without location_id.`,
          );
        }

        if (!competition.locationIds.has(locationId)) {
          throw new Error(
            `${relative(REPO_ROOT, csvPath)} references ${locationId}, ` +
            `which is not in ${dataset}.`,
          );
        }

        const predLat = finiteNumber(
          row.pred_lat,
          `${baseline.model} ${dataset} ${locationId} pred_lat`,
        );
        const predLng = finiteNumber(
          row.pred_lon,
          `${baseline.model} ${dataset} ${locationId} pred_lon`,
        );
        const reportedErrorKm = finiteNumber(
          row[baseline.errorColumn],
          `${baseline.model} ${dataset} ${locationId} ${baseline.errorColumn}`,
        );

        const durationSeconds =
          baseline.durationColumn &&
            row[baseline.durationColumn] !== ""
            ? finiteNumber(
              row[baseline.durationColumn],
              `${baseline.model} ${dataset} ${locationId} ${baseline.durationColumn}`,
            )
            : null;

        const key = `${dataset}\u0000${locationId}`;

        if (!runsByLocation.has(key)) {
          runsByLocation.set(key, []);
        }

        const runs = runsByLocation.get(key);

        if (runs.some((run) => run.model === baseline.model)) {
          throw new Error(
            `${dataset}/${locationId} has duplicate ${baseline.model} rows.`,
          );
        }

        runs.push({
          id:
            `static-baseline-${baseline.id}-` +
            `${dataset}-${locationId}`,
          model: baseline.model,
          condition: "static-image",
          runKind: "model-prediction",
          runStatus: "complete",
          prediction: {
            lat: predLat,
            lng: predLng,
          },
          hypothesis: "",
          cues: [],
          notes: baseline.note,
          isMock: false,
          accuracy: {
            country: null,
            region: null,
          },
          durationSeconds,
          baselineId: baseline.id,
          sourceCsv: relative(REPO_ROOT, csvPath).replaceAll(
            "\\",
            "/",
          ),
          reportedErrorKm,
        });

        importedCounts.set(
          baseline.id,
          importedCounts.get(baseline.id) + 1,
        );
      }
    }
  }

  for (const baseline of BASELINES) {
    const count = importedCounts.get(baseline.id);

    if (count !== 25) {
      throw new Error(
        `${baseline.model}: imported ${count} rows; expected exactly 25.`,
      );
    }
  }

  if (runsByLocation.size !== 25) {
    throw new Error(
      `Imported ${runsByLocation.size} unique locations; expected 25.`,
    );
  }

  await rm(OUTPUT_DIR, {
    recursive: true,
    force: true,
  });

  let written = 0;

  for (const dataset of DATASETS) {
    const competition = competitions.get(dataset);
    const datasetDir = join(OUTPUT_DIR, dataset);

    await mkdir(datasetDir, {
      recursive: true,
    });

    for (const locationId of competition.orderedLocationIds) {
      const key = `${dataset}\u0000${locationId}`;
      const runs = runsByLocation.get(key) ?? [];

      if (runs.length !== BASELINES.length) {
        throw new Error(
          `${dataset}/${locationId}: found ${runs.length} baseline runs; ` +
          `expected ${BASELINES.length}.`,
        );
      }

      const output = {
        schemaVersion: "1.0",
        competitionId: dataset,
        locationId,
        runs,
      };

      await writeFile(
        join(datasetDir, `${locationId}.json`),
        `${JSON.stringify(output, null, 2)}\n`,
        "utf8",
      );

      written += 1;
    }
  }

  if (!quiet) {
    console.log(
      `Imported ${BASELINES.length} static baselines across 25 locations.`,
    );

    for (const baseline of BASELINES) {
      console.log(
        `- ${baseline.model}: ` +
        `${importedCounts.get(baseline.id)} predictions`,
      );
    }

    console.log(`Wrote ${written} result files to:`);
    console.log(
      relative(REPO_ROOT, OUTPUT_DIR).replaceAll("\\", "/"),
    );
  }

  return {
    baselineCount: BASELINES.length,
    locationCount: runsByLocation.size,
    writtenFiles: written,
    outputDir: OUTPUT_DIR,
  };
}

async function loadCompetitions() {
  const output = new Map();

  for (const dataset of DATASETS) {
    const path = join(
      COMPETITIONS_DIR,
      `${dataset}.json`,
    );
    const input = JSON.parse(
      await readFile(path, "utf8"),
    );
    const locations = Array.isArray(input.locations)
      ? input.locations
      : [];

    const orderedLocationIds = locations.map(
      (item) => String(item.id ?? "").trim(),
    );

    if (
      orderedLocationIds.length === 0 ||
      orderedLocationIds.some((id) => !id)
    ) {
      throw new Error(
        `${relative(REPO_ROOT, path)} contains invalid location ids.`,
      );
    }

    output.set(dataset, {
      orderedLocationIds,
      locationIds: new Set(orderedLocationIds),
    });
  }

  return output;
}

function finiteNumber(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `${label} must be a finite number, ` +
      `received ${JSON.stringify(value)}.`,
    );
  }

  return number;
}

function parseCsv(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error(
      "CSV ended inside a quoted field.",
    );
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }

  const nonEmpty = records.filter(
    (record) => record.some((value) => value !== ""),
  );

  if (nonEmpty.length === 0) {
    return [];
  }

  const headers = nonEmpty[0].map(
    (value) => value.trim(),
  );

  return nonEmpty.slice(1).map(
    (record, rowIndex) => {
      if (record.length !== headers.length) {
        throw new Error(
          `CSV row ${rowIndex + 2} has ${record.length} columns; ` +
          `expected ${headers.length}.`,
        );
      }

      return Object.fromEntries(
        headers.map(
          (header, index) => [
            header,
            record[index],
          ],
        ),
      );
    },
  );
}

const isDirect =
  process.argv[1]
    ? resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
    : false;

if (isDirect) {
  importStaticBaselines().catch((error) => {
    console.error(
      error instanceof Error
        ? error.stack ?? error.message
        : String(error),
    );
    process.exitCode = 1;
  });
}
