import { assertCoordinate, haversineKm } from "./geo.js";
import { normalizeExploration } from "./exploration.js";

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_CONDITIONS = new Set(["static-image", "interactive-panorama"]);
const VALID_SOURCES = new Set(["starting-image", "panorama", "map"]);

export function validateCases(input) {
  const errors = [];

  if (!Array.isArray(input)) {
    return ["The data root must be an array of cases."];
  }

  if (input.length === 0) {
    errors.push("At least one case is required.");
  }

  const caseIds = new Set();

  input.forEach((item, caseIndex) => {
    const path = `cases[${caseIndex}]`;

    if (!isNonEmptyString(item?.id)) {
      errors.push(`${path}.id must be a non-empty string.`);
    } else if (caseIds.has(item.id)) {
      errors.push(`${path}.id duplicates "${item.id}".`);
    } else {
      caseIds.add(item.id);
    }

    ["title", "city", "country", "summary"].forEach((key) => {
      if (!isNonEmptyString(item?.[key])) {
        errors.push(`${path}.${key} must be a non-empty string.`);
      }
    });

    if (!VALID_DIFFICULTIES.has(item?.difficulty)) {
      errors.push(`${path}.difficulty must be easy, medium, or hard.`);
    }

    collectCoordinateError(errors, item?.groundTruth, `${path}.groundTruth`);

    if (!item?.startingView) {
      errors.push(`${path}.startingView is required.`);
    } else {
      collectStreetViewErrors(errors, item.startingView, `${path}.startingView`);
    }

    if (item?.startingImage !== undefined && item?.startingImage !== null) {
      if (!isNonEmptyString(item.startingImage?.path)) {
        errors.push(`${path}.startingImage.path must be a non-empty string when startingImage is provided.`);
      }
    }

    if (!Array.isArray(item?.runs)) {
      errors.push(`${path}.runs must be an array.`);
      return;
    }

    const runIds = new Set();

    item.runs.forEach((run, runIndex) => {
      const runPath = `${path}.runs[${runIndex}]`;

      if (!isNonEmptyString(run?.id)) {
        errors.push(`${runPath}.id must be a non-empty string.`);
      } else if (runIds.has(run.id)) {
        errors.push(`${runPath}.id duplicates "${run.id}" within the case.`);
      } else {
        runIds.add(run.id);
      }

      if (!isNonEmptyString(run?.model)) {
        errors.push(`${runPath}.model must be a non-empty string.`);
      }

      if (!VALID_CONDITIONS.has(run?.condition)) {
        errors.push(
          `${runPath}.condition must be static-image or interactive-panorama.`,
        );
      }

      if (run?.hypothesis !== undefined && typeof run.hypothesis !== "string") {
        errors.push(`${runPath}.hypothesis must be a string when provided.`);
      }

      if (run?.prediction !== undefined && run?.prediction !== null) {
        collectCoordinateError(errors, run.prediction, `${runPath}.prediction`);
      }

      if (
        run?.confidence !== undefined &&
        run?.confidence !== null &&
        (!Number.isFinite(run.confidence) ||
          run.confidence < 0 ||
          run.confidence > 1)
      ) {
        errors.push(`${runPath}.confidence must be between 0 and 1.`);
      }

      if (run?.cues !== undefined && !Array.isArray(run.cues)) {
        errors.push(`${runPath}.cues must be an array when provided.`);
      } else {
        (run.cues ?? []).forEach((cue, cueIndex) => {
          const cuePath = `${runPath}.cues[${cueIndex}]`;

          if (!isNonEmptyString(cue?.text)) {
            errors.push(`${cuePath}.text must be a non-empty string.`);
          }

          if (!VALID_SOURCES.has(cue?.source)) {
            errors.push(
              `${cuePath}.source must be starting-image, panorama, or map.`,
            );
          }

          if (cue?.evidenceView) {
            collectStreetViewErrors(
              errors,
              cue.evidenceView,
              `${cuePath}.evidenceView`,
            );
          }

          if (cue?.ratings) {
            ["visible", "correct", "useful", "consistent"].forEach((key) => {
              if (
                cue.ratings[key] !== undefined &&
                typeof cue.ratings[key] !== "boolean"
              ) {
                errors.push(`${cuePath}.ratings.${key} must be boolean.`);
              }
            });
          }
        });
      }
    });
  });

  return errors;
}

export function assertValidCases(input) {
  const errors = validateCases(input);
  if (errors.length > 0) {
    const error = new TypeError(`Invalid Geo Evidence Atlas data:\n- ${errors.join("\n- ")}`);
    error.validationErrors = errors;
    throw error;
  }
  return input;
}

export function normalizeCases(input) {
  assertValidCases(input);

  return input.map((item) => ({
    ...item,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    startingImage: item.startingImage ? { ...item.startingImage } : null,
    visual: {
      code: item.visual?.code ?? item.city.slice(0, 3).toUpperCase(),
      accent: item.visual?.accent ?? "#d9ff6b",
      motif: item.visual?.motif ?? "grid",
    },
    runs: item.runs.map((run) => ({
      ...run,
      confidence: run.confidence ?? null,
      durationSeconds: run.durationSeconds ?? null,
      notes: run.notes ?? "",
      isMock: run.isMock ?? false,
      accuracy: {
        country: run.accuracy?.country ?? null,
        region: run.accuracy?.region ?? null,
      },
      exploration: normalizeExploration(run.exploration),
      hypothesis: run.hypothesis ?? "",
      cues: (run.cues ?? []).map((cue, index) => ({
        id: cue.id ?? `${run.id}-cue-${index + 1}`,
        ...cue,
        ratings: {
          visible: cue.ratings?.visible ?? null,
          correct: cue.ratings?.correct ?? null,
          useful: cue.ratings?.useful ?? null,
          consistent: cue.ratings?.consistent ?? null,
        },
      })),
      errorKm: run.prediction ? haversineKm(item.groundTruth, run.prediction) : null,
    })),
  }));
}

export function upsertCase(cases, nextCase) {
  const copy = [...cases];
  const index = copy.findIndex((item) => item.id === nextCase.id);

  if (index === -1) {
    copy.push(nextCase);
  } else {
    copy[index] = nextCase;
  }

  return normalizeCases(copy);
}

function collectStreetViewErrors(errors, value, path) {
  collectCoordinateError(
    errors,
    value?.viewpoint ?? value,
    `${path}.viewpoint`,
  );

  if (value?.heading !== undefined && !Number.isFinite(value.heading)) {
    errors.push(`${path}.heading must be a finite number.`);
  }

  if (
    value?.pitch !== undefined &&
    (!Number.isFinite(value.pitch) || value.pitch < -90 || value.pitch > 90)
  ) {
    errors.push(`${path}.pitch must be between -90 and 90.`);
  }

  if (
    value?.fov !== undefined &&
    (!Number.isFinite(value.fov) || value.fov < 10 || value.fov > 100)
  ) {
    errors.push(`${path}.fov must be between 10 and 100.`);
  }
}

function collectCoordinateError(errors, value, path) {
  try {
    assertCoordinate(value, path);
  } catch (error) {
    errors.push(error.message);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
