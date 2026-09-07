import { formatDistance } from "./geo.js";

const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const DIFFICULTY_COLORS = {
  easy: "#38bdf8",
  medium: "#fbbf24",
  hard: "#fb7185",
};

export function buildGlobeSceneData({
  cases = [],
  caseItem = null,
  run = null,
  overviewRuns = [],
  overview = !caseItem,
  playback = null,
} = {}) {
  if (overview || !caseItem) {
    const locationById = new Map(cases.map((item) => [item.id, item]));
    const points = cases
      .filter((item) => hasCoordinate(item?.groundTruth))
      .map((item) => ({
        kind: "location",
        caseId: item.id,
        lat: item.groundTruth.lat,
        lng: item.groundTruth.lng,
        label: `${item.city}, ${item.country} · ${DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}`,
        color: DIFFICULTY_COLORS[item.difficulty] ?? "#38bdf8",
        radius: 0.44,
        altitude: 0.026,
      }));
    const arcs = [];

    for (const entry of overviewRuns) {
      const item = locationById.get(entry?.caseId);
      const predictionRun = entry?.run;
      if (!item || !hasCoordinate(item.groundTruth) || !hasCoordinate(predictionRun?.prediction)) {
        continue;
      }

      const pinError = formatDistance(predictionRun.errorKm);
      points.push({
        kind: "prediction",
        caseId: item.id,
        runId: predictionRun.id,
        lat: predictionRun.prediction.lat,
        lng: predictionRun.prediction.lng,
        label: `${predictionRun.model} prediction · ${item.city}, ${item.country} · ${pinError} pin error`,
        color: "#ff8a30",
        radius: 0.24,
        altitude: 0.105,
      });
      arcs.push({
        kind: "overview-error",
        caseId: item.id,
        runId: predictionRun.id,
        startLat: item.groundTruth.lat,
        startLng: item.groundTruth.lng,
        endLat: predictionRun.prediction.lat,
        endLng: predictionRun.prediction.lng,
        label: `${predictionRun.model} · ${pinError} pin error`,
        color: ["#355071", "#ff8a30"],
        stroke: 0.18,
        altitudeScale: 0.08,
      });
    }

    return {
      points,
      arcs,
      paths: [],
    };
  }

  const points = [];
  const arcs = [];
  const paths = [];
  const runId = run?.id ?? null;

  if (hasCoordinate(caseItem.groundTruth)) {
    points.push({
      kind: "truth",
      caseId: caseItem.id,
      runId,
      lat: caseItem.groundTruth.lat,
      lng: caseItem.groundTruth.lng,
      label: `Truth · ${caseItem.groundTruth.label || `${caseItem.city}, ${caseItem.country}`}`,
      color: "#b7f34a",
      radius: 0.48,
      altitude: 0.045,
    });
  }

  if (run && hasCoordinate(run.prediction)) {
    points.push({
      kind: "prediction",
      caseId: caseItem.id,
      runId,
      lat: run.prediction.lat,
      lng: run.prediction.lng,
      label: `${run.model} · ${formatDistance(run.errorKm)} pin error`,
      color: "#ff8a30",
      radius: 0.44,
      altitude: 0.055,
    });

    if (hasCoordinate(caseItem.groundTruth)) {
      arcs.push({
        kind: "error",
        caseId: caseItem.id,
        runId,
        startLat: caseItem.groundTruth.lat,
        startLng: caseItem.groundTruth.lng,
        endLat: run.prediction.lat,
        endLng: run.prediction.lng,
        label: `${formatDistance(run.errorKm)} pin error`,
        color: ["#b7f34a", "#ff8a30"],
      });
    }
  }

  const route = (run?.exploration?.path ?? [])
    .filter(hasCoordinate)
    .map((sample) => [sample.lat, sample.lng, 0.012]);

  if (route.length > 1) {
    paths.push({
      kind: "exploration",
      caseId: caseItem.id,
      runId,
      label: "Recorded exploration",
      color: "#60a5fa",
      points: route,
    });
  }

  const playbackTrace = (playback?.trace ?? [])
    .filter(hasCoordinate)
    .map((sample) => [sample.lat, sample.lng, 0.022]);

  if (playbackTrace.length > 1) {
    paths.push({
      kind: "playback",
      caseId: caseItem.id,
      runId,
      label: "Travelled playback trace",
      color: "#f472b6",
      points: playbackTrace,
    });
  }

  if (hasCoordinate(playback?.sample)) {
    points.push({
      kind: "playback",
      caseId: caseItem.id,
      runId,
      lat: playback.sample.lat,
      lng: playback.sample.lng,
      label: `Playback · ${formatPlaybackTime(playback.sample.tMs)}`,
      color: "#f472b6",
      radius: 0.38,
      altitude: 0.07,
    });
  }

  return { points, arcs, paths };
}

function formatPlaybackTime(tMs = 0) {
  return `${((tMs ?? 0) / 1000).toFixed(1)} s`;
}

function hasCoordinate(value) {
  return Boolean(
    value &&
      Number.isFinite(value.lat) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      Number.isFinite(value.lng) &&
      value.lng >= -180 &&
      value.lng <= 180,
  );
}
