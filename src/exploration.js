import { haversineKm } from "./geo.js";

const DEFAULT_MIN_DISTANCE_METERS = 0.75;
const DEFAULT_MAX_POINTS = 3000;
const DEFAULT_MAX_SAMPLES = 5000;

export function normalizeExploration(input, options = {}) {
  if (!input) return null;

  const samples = extractTimelineSamples(input, options);
  const path = extractMovementPath(input, options);
  if (samples.length === 0 && path.length === 0) return null;

  const source = Array.isArray(input)
    ? "coordinate-array"
    : input.recorder?.name ?? input.source ?? "recorded-exploration";

  const durationMs = Number.isFinite(input.durationMs)
    ? input.durationMs
    : inferDurationMs(samples, path);

  const keyMoments = normalizeKeyMoments(input.keyMoments ?? input.moments ?? [], samples);

  return {
    source,
    path: path.length ? path : extractMovementPath(samples, options),
    samples: samples.length ? samples : path,
    keyMoments,
    startedAt: input.startedAt ?? null,
    stoppedAt: input.stoppedAt ?? null,
    durationMs,
    sampleCount: Number.isFinite(input.sampleCount)
      ? input.sampleCount
      : Array.isArray(input.samples)
        ? input.samples.length
        : samples.length || path.length,
    pointCount: path.length,
    captureSources: input.captureSources ?? summarizeSources(samples),
    recorder: input.recorder ? { ...input.recorder } : undefined,
  };
}

export function extractTimelineSamples(
  input,
  {
    maxSamples = DEFAULT_MAX_SAMPLES,
  } = {},
) {
  const rawPoints = getRawPoints(input);
  const samples = [];

  for (const sample of rawPoints) {
    const point = toPoint(sample);
    if (!point) continue;
    samples.push(point);
  }

  samples.sort((a, b) => (a.tMs ?? 0) - (b.tMs ?? 0) || (a.seq ?? 0) - (b.seq ?? 0));
  return downsample(samples, Math.max(2, maxSamples));
}

export function extractMovementPath(
  input,
  {
    minDistanceMeters = DEFAULT_MIN_DISTANCE_METERS,
    maxPoints = DEFAULT_MAX_POINTS,
  } = {},
) {
  const rawPoints = movementSourcePoints(input);
  const path = [];

  for (const sample of rawPoints) {
    const point = toPoint(sample);
    if (!point) continue;

    const previous = path.at(-1);
    if (!previous) {
      path.push(point);
      continue;
    }

    const movedMeters = haversineKm(previous, point) * 1000;
    if (movedMeters >= minDistanceMeters) {
      path.push(point);
    }
  }

  if (path.length > 1) {
    const final = toPoint(rawPoints.at(-1));
    if (final && haversineKm(path.at(-1), final) * 1000 > 0.05) {
      path.push(final);
    }
  }

  return downsample(path, Math.max(2, maxPoints));
}

export function explorationDistanceKm(exploration) {
  const path = exploration?.path ?? extractMovementPath(exploration);
  let total = 0;

  for (let index = 1; index < path.length; index += 1) {
    total += haversineKm(path[index - 1], path[index]);
  }

  return total;
}

export function sampleToStreetView(sample) {
  if (!sample) return null;
  return {
    viewpoint: { lat: sample.lat, lng: sample.lng },
    ...(Number.isFinite(sample.heading) ? { heading: sample.heading } : {}),
    ...(Number.isFinite(sample.pitch) ? { pitch: sample.pitch } : {}),
    ...(Number.isFinite(sample.fov) ? { fov: Math.min(100, Math.max(10, sample.fov)) } : {}),
    ...(sample.panoId ? { panoId: sample.panoId } : {}),
  };
}

export function nearestSampleIndex(samples, targetMs) {
  if (!Array.isArray(samples) || samples.length === 0) return -1;
  if (!Number.isFinite(targetMs)) return 0;

  let bestIndex = 0;
  let bestDelta = Infinity;
  samples.forEach((sample, index) => {
    const delta = Math.abs((sample.tMs ?? 0) - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
}


function movementSourcePoints(input) {
  const raw = Array.isArray(input?.samples) ? input.samples : getRawPoints(input);
  const ordered = [...raw].sort(
    (a, b) => (a?.tMs ?? 0) - (b?.tMs ?? 0) || (a?.seq ?? 0) - (b?.seq ?? 0),
  );

  const interactive =
    input?.condition === "interactive-panorama" ||
    input?.captureMode === "interactive" ||
    input?.round?.captureMode === "interactive";
  if (!interactive) return ordered;

  // OpenGuessr's iframe URL remains anchored to the original spawn while the
  // live Google Maps API camera moves. Late DOM heartbeat samples therefore can
  // falsely draw a route back to the start. When live API samples exist, they
  // are the authoritative movement trace.
  let movement = ordered.filter((sample) => sample?.source === "api");
  if (!movement.length) movement = ordered;

  // Repair both new and already-recorded runs: once Guess was submitted,
  // result-screen camera resets are UI transitions rather than exploration.
  const cutoff = explorationTerminalOffsetMs(input);
  if (Number.isFinite(cutoff)) {
    movement = movement.filter((sample) => !Number.isFinite(sample?.tMs) || sample.tMs < cutoff);
  }
  return movement;
}

function explorationTerminalOffsetMs(input) {
  const startedAtMs = Date.parse(input?.startedAt ?? input?.round?.detectedAt ?? "");
  if (!Number.isFinite(startedAtMs)) return null;

  const events = Array.isArray(input?.diagnostics?.events) ? input.diagnostics.events : [];
  const terminal =
    events.find((event) => event?.name === "prediction_intent") ??
    events.find((event) => event?.name === "result_visible") ??
    null;
  const terminalAtMs = Date.parse(terminal?.at ?? terminal?.details?.at ?? "");
  if (!Number.isFinite(terminalAtMs)) return null;
  return Math.max(0, terminalAtMs - startedAtMs);
}

function getRawPoints(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.samples)) return input.samples;
  if (Array.isArray(input?.path)) return input.path;
  if (Array.isArray(input?.recorderSession?.samples)) return input.recorderSession.samples;
  return [];
}

function toPoint(sample) {
  if (!sample || !Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) {
    return null;
  }

  if (sample.lat < -90 || sample.lat > 90 || sample.lng < -180 || sample.lng > 180) {
    return null;
  }

  return {
    lat: sample.lat,
    lng: sample.lng,
    ...(Number.isFinite(sample.seq) ? { seq: sample.seq } : {}),
    ...(Number.isFinite(sample.roundIndex) ? { roundIndex: sample.roundIndex } : {}),
    ...(Number.isFinite(sample.tMs) ? { tMs: sample.tMs } : {}),
    ...(sample.capturedAt ? { capturedAt: String(sample.capturedAt) } : {}),
    ...(Number.isFinite(sample.heading) ? { heading: sample.heading } : {}),
    ...(Number.isFinite(sample.pitch) ? { pitch: sample.pitch } : {}),
    ...(Number.isFinite(sample.zoom) ? { zoom: sample.zoom } : {}),
    ...(Number.isFinite(sample.fov) ? { fov: Math.min(100, Math.max(10, sample.fov)) } : {}),
    ...(sample.panoId ? { panoId: String(sample.panoId) } : {}),
    ...(sample.source ? { source: String(sample.source) } : {}),
    ...(sample.reason ? { reason: String(sample.reason) } : {}),
    ...(sample.label ? { label: String(sample.label) } : {}),
  };
}

function normalizeKeyMoments(moments, samples) {
  if (!Array.isArray(moments)) return [];

  return moments
    .map((moment, index) => {
      const tMs = Number.isFinite(moment?.tMs)
        ? moment.tMs
        : Number.isFinite(moment?.sampleIndex) && samples[moment.sampleIndex]
          ? samples[moment.sampleIndex].tMs ?? 0
          : null;

      if (!Number.isFinite(tMs)) return null;

      return {
        id: String(moment.id ?? `moment-${index + 1}`),
        label: String(moment.label ?? `Moment ${index + 1}`),
        description: String(moment.description ?? ""),
        tMs,
        sampleIndex: nearestSampleIndex(samples, tMs),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.tMs - b.tMs);
}

function inferDurationMs(samples, path) {
  const series = samples.length ? samples : path;
  if (!series.length) return null;
  const max = Math.max(...series.map((sample) => sample.tMs ?? 0));
  return Number.isFinite(max) && max > 0 ? max : null;
}

function summarizeSources(samples) {
  const counts = {};
  for (const sample of samples) {
    const key = sample.source || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;

  const result = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 1; index < maxPoints - 1; index += 1) {
    result.push(points[Math.round(index * step)]);
  }

  result.push(points.at(-1));
  return result;
}
