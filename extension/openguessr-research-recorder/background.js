import {
  DEFAULT_SETTINGS,
  EXTENSION_VERSION,
  RECORDER_NAME,
  loadSettings,
  saveSettings,
} from "./lib/config.js";

const TAB_STATE_PREFIX = "ogrr-tab-state:";
const RECOVERY_STATE_PREFIX = "ogrr-recovery-state:";
const tabStateCache = new Map();
const finalizeTimers = new Map();
let settingsCache = null;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) await saveSettings(DEFAULT_SETTINGS);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void closeTabSession(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "OGRR_EVENT":
      return handleRecorderEvent(message, sender);
    case "OGRR_GET_STATUS":
      return { status: await getActiveTabStatus(), settings: await getSettings() };
    case "OGRR_GET_PAGE_UI_STATE":
      return await getPageUiState(sender, Boolean(message.includeCollector));
    case "OGRR_ARM_TAB":
      return await armSenderTab(sender, message.setup ?? {});
    case "OGRR_ARM_ACTIVE":
      return { status: await armActiveTab(message.setup ?? {}) };
    case "OGRR_STOP_TAB":
      return { status: await stopSenderTab(sender, "user_stop") };
    case "OGRR_DONE_DISARM_TAB":
      return { status: await doneAndDisarmSenderTab(sender) };
    case "OGRR_STOP_ACTIVE":
      return { status: await stopActiveTab("user_stop") };
    case "OGRR_SAVE_SETTINGS": {
      settingsCache = await saveSettings(message.settings ?? {});
      return { settings: settingsCache };
    }
    case "OGRR_TEST_COLLECTOR":
      return { collector: await testCollector() };
    case "OGRR_SAVE_CHECKPOINT":
      return await saveActiveCheckpoint();
    case "OGRR_EXPORT_DIAGNOSTICS":
      return await exportActiveDiagnostics();
    case "OGRR_FINALIZE_ACTIVE":
      return { status: await finalizeActiveTab("manual") };
    case "OGRR_RESET_ACTIVE":
      return { status: await resetActiveTab() };
    default:
      return {};
  }
}

async function handleRecorderEvent(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return {};

  const settings = await getSettings();
  const state = await getTabState(tabId);
  const effectiveSettings = settingsForState(state, settings);
  state.updatedAt = new Date().toISOString();

  if (message.source === "openguessr-page") {
    await handlePageEvent(tabId, state, message.event, message.payload, effectiveSettings);
  } else if (message.source === "google-frame") {
    await handleGoogleEvent(tabId, state, message.event, message.payload, effectiveSettings);
  }

  await persistTabState(tabId, state);
  return { status: publicStatus(state) };
}

async function handlePageEvent(tabId, state, event, payload, settings) {
  if (event === "page-context") {
    const previousHint = state.pageContext?.competitionHint ?? null;
    const nextHint = payload?.competitionHint ?? null;
    state.pageContext = {
      ...payload,
      tabUrl: payload?.pageUrl ?? state.pageContext?.tabUrl ?? null,
    };

    if (previousHint && nextHint && previousHint !== nextHint) {
      state.pendingSessionReset = true;
      if (captureIsArmed(state, settings) && state.currentRound) {
        await finalizeRound(tabId, state, "competition_changed");
      }
    }
    return;
  }

  if (event === "dom-probe") {
    const previousProbe = state.pageProbe;
    state.pageProbe = sanitizePageProbe(payload);
    const startConfirmedNow = maybeConfirmCompetitionStartFromProbe(
      state,
      previousProbe,
      state.pageProbe,
      settings,
    );
    if (captureSessionReady(state, settings)) {
      if (
        startConfirmedNow &&
        !state.currentRound &&
        !state.pageProbe?.resultVisible &&
        isCoordinate(state.pageProbe?.primaryView)
      ) {
        await ensureRoundFromProbe(
          tabId,
          state,
          settings,
          "competition_start_transition",
          { force: true },
        );
      }
      await handleDomProbe(tabId, state, state.pageProbe, settings);
    }
    return;
  }

  if (event === "competition-start-intent") {
    if (captureIsArmed(state, settings) && !state.sessionId) {
      const confirmed = confirmCompetitionStart(
        state,
        payload?.label === "manual-overlay-confirmation" ? "manual confirmation" : "Start control",
        payload?.at,
      );
      if (
        confirmed &&
        !state.currentRound &&
        !state.pageProbe?.resultVisible &&
        isCoordinate(state.pageProbe?.primaryView) &&
        state.pageProbe?.competitionStartPromptVisible === false
      ) {
        await ensureRoundFromProbe(
          tabId,
          state,
          settings,
          "competition_start_control",
          { force: true },
        );
      }
    }
    return;
  }

  if (!captureSessionReady(state, settings)) return;

  if (event === "diagnostic") {
    if (state.currentRound) {
      addDiagnostic(state.currentRound, payload?.name ?? "page_diagnostic", payload);
    }
    return;
  }

  if (event === "prediction-intent") {
    if (!state.currentRound) {
      await ensureRoundFromProbe(tabId, state, settings, "prediction_intent");
    }
    if (state.currentRound) {
      if (eventPredatesRound(state.currentRound, payload, ["at"])) {
        addDiagnostic(state.currentRound, "stale_prediction_intent_ignored", payload);
        return;
      }
      state.currentRound.predictionIntentAt = payload?.at ?? new Date().toISOString();
      addDiagnostic(state.currentRound, "prediction_intent", payload);
    }
    return;
  }

  if (event === "prediction-candidate") {
    if (!isCoordinate(payload)) return;
    if (!state.currentRound) {
      await ensureRoundFromProbe(tabId, state, settings, "prediction_candidate", {
        force: true,
      });
    }
    if (!state.currentRound) return;
    if (eventPredatesRound(state.currentRound, payload, ["detectedAt", "at"])) {
      addDiagnostic(state.currentRound, "stale_prediction_candidate_ignored", payload);
      return;
    }
    state.currentRound.prediction = {
      lat: Number(payload.lat),
      lng: Number(payload.lng),
      capturedAt: payload.detectedAt ?? new Date().toISOString(),
      source:
        payload.transport === "leaflet-map-click"
          ? "leaflet-map-click"
          : "outgoing-request",
      requestPath: payload.requestPath ?? null,
      evidencePath: payload.evidencePath ?? null,
    };
    addDiagnostic(state.currentRound, "prediction_captured", {
      requestPath: payload.requestPath ?? null,
      transport: payload.transport ?? null,
    });
    scheduleFinalize(tabId, 850, "prediction_submitted", state.currentRound);
    return;
  }

  if (event === "result-visible") {
    // A result event can be emitted repeatedly while the result screen remains
    // visible. Never create a new round from that screen: if the previous round
    // has already been finalized, this event belongs to the completed round.
    if (!state.currentRound) return;
    if (eventPredatesRound(state.currentRound, payload, ["at"])) {
      addDiagnostic(state.currentRound, "stale_result_visible_ignored", payload);
      return;
    }
    addDiagnostic(state.currentRound, "result_visible", payload);
    freezeRound(state.currentRound, payload?.at, "result_visible");
    scheduleFinalize(
      tabId,
      state.currentRound.prediction ? 500 : 1600,
      state.currentRound.prediction
        ? "prediction_submitted"
        : "prediction_submitted_coordinates_unresolved",
      state.currentRound,
    );
    return;
  }

  if (event === "round-advance-intent") {
    const intentAt = payload?.at ?? new Date().toISOString();
    // "Continue" lives on the result screen. If the round is already finalized,
    // remember the transition intent so only a genuinely new panorama can start
    // the next round.
    if (!state.currentRound) {
      state.advanceIntentAt = intentAt;
      return;
    }
    // Page events can cross the round boundary asynchronously. If the original
    // Continue click happened before this round started, it belongs to the
    // previous result screen and must never freeze/finalize the new round.
    if (eventPredatesRound(state.currentRound, payload, ["at"])) {
      addDiagnostic(state.currentRound, "stale_round_advance_intent_ignored", payload);
      return;
    }
    // Continue is a navigation signal, not sufficient evidence that the current
    // round itself is complete. In particular, a result-screen camera event can
    // race ahead and look like a new round; a subsequent Continue must not turn
    // that transient camera state into a saved partial round. Only a round with
    // an actually captured prediction may be finalized by Continue.
    if (!state.currentRound.prediction) {
      addDiagnostic(state.currentRound, "round_advance_without_prediction_ignored", payload);
      return;
    }
    state.advanceIntentAt = intentAt;
    addDiagnostic(state.currentRound, "round_advance_intent", payload);
    freezeRound(state.currentRound, payload?.at, "round_advance_intent");
    scheduleFinalize(tabId, 100, "prediction_submitted", state.currentRound);
  }
}


async function handleDomProbe(tabId, state, probe, settings) {
  if (!probe) return;

  state.pageContext = {
    ...(state.pageContext ?? {}),
    pageUrl: probe.pageUrl ?? state.pageContext?.pageUrl ?? null,
    pathname: probe.pathname ?? state.pageContext?.pathname ?? null,
    title: probe.title ?? state.pageContext?.title ?? null,
    at: probe.at ?? new Date().toISOString(),
  };

  if (Number.isInteger(probe.roundTotal)) {
    state.expectedRoundCount ??= probe.roundTotal;
  }

  const currentRoundNumber = state.currentRound?.pageRoundNumber ?? null;
  if (
    state.currentRound &&
    Number.isInteger(currentRoundNumber) &&
    Number.isInteger(probe.roundNumber) &&
    currentRoundNumber !== probe.roundNumber
  ) {
    await finalizeRound(tabId, state, "dom_round_number_changed");
  }

  if (probe.roundLikelyActive) {
    await ensureRoundFromProbe(tabId, state, settings, "dom_probe");
  }

  const round = state.currentRound;
  if (!round) return;

  round.pageRoundNumber ??= probe.roundNumber ?? null;
  round.pageRoundTotal ??= probe.roundTotal ?? null;
  round.captureMode = normalizeCaptureMode(
    probe.modeHint,
    round.settingsSnapshot?.condition ?? settings.condition,
  );
  round.lastPageProbeAt = probe.at ?? new Date().toISOString();

  const probeSignature = JSON.stringify({
    state: probe.pageState,
    round: probe.roundNumber,
    mode: probe.modeHint,
    view: probe.primaryView
      ? [
          probe.primaryView.lat,
          probe.primaryView.lng,
          probe.primaryView.panoId,
          probe.primaryView.urlFingerprint,
        ]
      : null,
  });
  if (probeSignature !== round.lastProbeSignature) {
    round.lastProbeSignature = probeSignature;
    addDiagnostic(round, "dom_probe", {
      pageState: probe.pageState,
      roundNumber: probe.roundNumber,
      roundTotal: probe.roundTotal,
      modeHint: probe.modeHint,
      streetViewCandidateCount:
        probe.diagnostics?.streetViewCandidateCount ?? null,
    });
  }

  if (probe.resultVisible) {
    freezeRound(round, probe.at, "dom_result_visible");
    if (!finalizeTimers.has(tabId)) {
      scheduleFinalize(
        tabId,
        round.prediction ? 500 : 1600,
        round.prediction
          ? "prediction_submitted"
          : "prediction_submitted_coordinates_unresolved",
        round,
      );
    }
    return;
  }

  const view = normalizeProbeView(probe.primaryView);
  if (view) {
    round.spawnRequested ??= view;
    // The iframe/embed URL is a reliable fixed-view heartbeat for NMPZ, but in
    // interactive Street View it usually remains pinned to the ORIGINAL spawn.
    // Once the live Maps API is available, feeding those DOM coordinates into
    // the exploration timeline creates fake jumps back to the start. Keep a DOM
    // point only as an initial fallback until the first API sample arrives.
    const isInteractive = round.captureMode === "interactive";
    const hasApiSamples = (round.captureSources?.api ?? 0) > 0;
    if (!isInteractive || (!hasApiSamples && round.samples.length === 0)) {
      captureSample(round, {
        ...view,
        capturedAt: probe.at ?? new Date().toISOString(),
        capturedAtMs: probe.atMs ?? Date.now(),
        source: probe.modeHint === "nmpz" ? "openguessr-nmpz" : "openguessr-dom",
        reason: probe.modeHint === "nmpz" ? "nmpz_heartbeat" : "dom_probe_initial_fallback",
        frameInstanceId: round.frameInstanceId,
      });
    }
  }

}

async function ensureRoundFromProbe(
  tabId,
  state,
  settings,
  reason,
  { force = false } = {},
) {
  if (!captureSessionReady(state, settings)) return null;
  if (state.currentRound) return state.currentRound;
  const probe = state.pageProbe;
  if (!probe) return null;
  // A result screen is never a valid starting point for a new round. Repeated
  // result probes/events are common while OpenGuessr waits for Continue.
  if (probe.resultVisible || probe.pageState === "result") return null;
  if (!force && !probe.roundLikelyActive) return null;

  const sameFinishedRound =
    Number.isInteger(probe.roundNumber) &&
    probe.roundNumber === state.lastFinishedRoundNumber;
  const resultAlreadySaved =
    sameFinishedRound &&
    probe.pageState === "result" &&
    Number.isFinite(parseTime(state.lastFinishedAt));
  if (resultAlreadySaved) return null;

  const view = normalizeProbeView(probe.primaryView);
  const fingerprint =
    probe.primaryView?.urlFingerprint ??
    `${probe.roundNumber ?? "unknown"}-${probe.atMs ?? Date.now()}`;
  startRound(state, settings, {
    frameInstanceId: `dom-${probe.roundNumber ?? state.roundCounter + 1}-${fingerprint}`,
    spawnRequested: view,
    detectedAt: probe.at,
    pageRoundNumber: probe.roundNumber,
    pageRoundTotal: probe.roundTotal,
    captureMode: normalizeCaptureMode(probe.modeHint, settings.condition),
    startSource: reason,
    provisional: !view,
  });

  if (view) {
    captureSample(state.currentRound, {
      ...view,
      capturedAt: probe.at ?? new Date().toISOString(),
      capturedAtMs: probe.atMs ?? Date.now(),
      source: probe.modeHint === "nmpz" ? "openguessr-nmpz" : "openguessr-dom",
      reason: `${reason}_initial_view`,
      frameInstanceId: state.currentRound.frameInstanceId,
    });
  } else {
    addDiagnostic(state.currentRound, "round_started_without_view_coordinate", {
      reason,
      pageState: probe.pageState,
      roundNumber: probe.roundNumber,
      modeHint: probe.modeHint,
    });
  }

  await persistTabState(tabId, state);
  return state.currentRound;
}

function sanitizePageProbe(value) {
  if (!value || typeof value !== "object") return null;
  const primaryView = normalizeProbeView(value.primaryView, { keepUrl: true });
  return {
    trigger: stringOrNull(value.trigger, 40),
    at: stringOrNull(value.at, 80) ?? new Date().toISOString(),
    atMs: finiteOrNull(value.atMs) ?? Date.now(),
    pageUrl: stringOrNull(value.pageUrl, 1200),
    pathname: stringOrNull(value.pathname, 500),
    title: stringOrNull(value.title, 300),
    pageState: stringOrNull(value.pageState, 40),
    roundLikelyActive: Boolean(value.roundLikelyActive),
    competitionStartPromptVisible: Boolean(value.competitionStartPromptVisible),
    competitionStartLabel: stringOrNull(value.competitionStartLabel, 160),
    competitionStartSignature: stringOrNull(value.competitionStartSignature, 160),
    guessControlVisible: Boolean(value.guessControlVisible),
    nextControlVisible: Boolean(value.nextControlVisible),
    resultVisible: Boolean(value.resultVisible),
    roundNumber: positiveIntegerOrNull(value.roundNumber),
    roundTotal: positiveIntegerOrNull(value.roundTotal),
    modeHint: ["nmpz", "streetview", "interactive", "static"].includes(
      value.modeHint,
    )
      ? value.modeHint
      : null,
    primaryView,
    controlLabels: Array.isArray(value.controlLabels)
      ? value.controlLabels.slice(0, 12).map((item) => String(item).slice(0, 160))
      : [],
    diagnostics: {
      iframeCount: finiteOrNull(value.diagnostics?.iframeCount),
      imageCount: finiteOrNull(value.diagnostics?.imageCount),
      streetViewCandidateCount: finiteOrNull(
        value.diagnostics?.streetViewCandidateCount,
      ),
      nmpzTextDetected: Boolean(value.diagnostics?.nmpzTextDetected),
    },
  };
}

function normalizeProbeView(value, { keepUrl = false } = {}) {
  if (!isCoordinate(value)) return null;
  const point = normalizeCameraPoint(value);
  if (!point) return null;
  if (keepUrl) {
    point.url = stringOrNull(value.url, 1200);
    point.urlFingerprint = stringOrNull(value.urlFingerprint, 100);
    point.source = stringOrNull(value.source, 80);
  }
  return point;
}

async function handleGoogleEvent(tabId, state, event, payload, settings) {
  observeGoogleFrameState(state, event, payload);
  maybeConfirmCompetitionStartFromGoogle(state, event, payload, settings);
  if (!captureSessionReady(state, settings)) return;

  if (state.currentRound?.frozenAtMs) {
    if (event === "diagnostic" || event === "panorama-attached" || event === "api-constructor-hooked") {
      addDiagnostic(state.currentRound, `ignored_after_freeze:${event}`, payload);
    }
    return;
  }

  if (event === "frame-ready") {
    const spawn = payload?.spawnRequested;
    if (!isCoordinate(spawn)) return;

    const isNewFrame =
      payload.frameInstanceId &&
      payload.frameInstanceId !== state.currentRound?.frameInstanceId;

    if (state.currentRound && isNewFrame) {
      if (!adoptGoogleFrameIfCompatible(state.currentRound, payload)) {
        await finalizeRound(tabId, state, "new_streetview_frame");
      }
    }

    if (
      !state.currentRound &&
      canStartNewRoundFromGoogle(state, {
        ...spawn,
        frameInstanceId: payload.frameInstanceId,
        capturedAt: payload.at,
      })
    ) {
      startRound(state, settings, {
        frameInstanceId: payload.frameInstanceId,
        spawnRequested: spawn,
        detectedAt: payload.at,
      });
    }
    return;
  }

  if (event === "spawn-requested") {
    if (!isCoordinate(payload)) return;

    if (
      state.currentRound &&
      payload.frameInstanceId !== state.currentRound.frameInstanceId
    ) {
      if (!adoptGoogleFrameIfCompatible(state.currentRound, payload)) {
        await finalizeRound(tabId, state, "new_spawn_requested");
      }
    }

    if (!state.currentRound && canStartNewRoundFromGoogle(state, payload)) {
      startRound(state, settings, {
        frameInstanceId: payload.frameInstanceId,
        spawnRequested: payload,
        detectedAt: payload.at,
      });
    } else if (state.currentRound) {
      state.currentRound.spawnRequested = normalizeCameraPoint(payload);
    }
    return;
  }

  if (event === "sample") {
    if (!isCoordinate(payload)) return;

    if (!state.currentRound) {
      if (!canStartNewRoundFromGoogle(state, payload)) return;
      startRound(state, settings, {
        frameInstanceId: payload.frameInstanceId,
        spawnRequested: payload,
        detectedAt: payload.capturedAt,
      });
    }

    if (payload.frameInstanceId !== state.currentRound.frameInstanceId) {
      if (!adoptGoogleFrameIfCompatible(state.currentRound, payload)) return;
    }
    captureSample(state.currentRound, payload);
    return;
  }

  if (event === "panorama-attached" || event === "api-constructor-hooked") {
    if (state.currentRound) addDiagnostic(state.currentRound, event, payload);
    return;
  }

  if (event === "diagnostic" && state.currentRound) {
    addDiagnostic(state.currentRound, payload?.name ?? "google_diagnostic", payload);
  }
}


function adoptGoogleFrameIfCompatible(round, payload) {
  if (!round || !payload?.frameInstanceId) return false;
  const payloadPoint = isCoordinate(payload?.spawnRequested)
    ? payload.spawnRequested
    : isCoordinate(payload)
      ? payload
      : null;
  const reference = round.actualStart ?? round.spawnRequested ?? round.samples[0] ?? null;
  const coordinateCompatible =
    !payloadPoint ||
    !isCoordinate(reference) ||
    distanceMeters(reference, payloadPoint) <= 25;
  const canAdopt =
    coordinateCompatible &&
    (round.provisional || String(round.frameInstanceId ?? "").startsWith("dom-"));
  if (!canAdopt) return false;

  const previousFrameInstanceId = round.frameInstanceId;
  round.frameInstanceId = payload.frameInstanceId;
  round.provisional = false;
  if (payloadPoint) round.spawnRequested = normalizeCameraPoint(payloadPoint);
  addDiagnostic(round, "google_frame_adopted", {
    previousFrameInstanceId,
    frameInstanceId: payload.frameInstanceId,
  });
  return true;
}

function ensureSessionForRound(state, settings) {
  const pageHint = state.pageContext?.competitionHint ?? null;
  const context = state.sessionContext;
  const settingsChanged =
    context &&
    (context.competitionId !== settings.competitionId ||
      context.model !== settings.model ||
      context.condition !== settings.condition);
  const pageCompetitionChanged =
    context?.openGuessrCompetitionHint &&
    pageHint &&
    context.openGuessrCompetitionHint !== pageHint;

  if (
    !context ||
    state.pendingSessionReset ||
    settingsChanged ||
    pageCompetitionChanged ||
    state.sessionStatus === "complete" ||
    state.sessionStatus === "closed"
  ) {
    startNewSession(state, settings, pageHint);
    return;
  }

  if (!context.openGuessrCompetitionHint && pageHint) {
    context.openGuessrCompetitionHint = pageHint;
  }
}

function startNewSession(state, settings, pageHint = null) {
  const startedAt =
    state.competitionStartedAt ??
    state.competitionStartIntentAt ??
    new Date().toISOString();
  state.sessionId = `session-${safeIsoForId(startedAt)}-${randomId()}`;
  state.sessionStartedAt = startedAt;
  state.sessionStatus = "active";
  state.competitionStartConfirmed = true;
  state.sessionContext = {
    competitionId: settings.competitionId,
    model: settings.model,
    condition: settings.condition,
    openGuessrCompetitionHint: pageHint,
  };
  state.roundCounter = 0;
  state.completedRounds = [];
  state.expectedRoundCount = null;
  state.pendingSessionReset = false;
  state.awaitingNewFrame = false;
  state.lastFinishedFrameInstanceId = null;
  state.lastFinishedCoordinate = null;
  state.lastFinishedPanoId = null;
  state.lastFinishedAt = null;
  state.lastFinishedRoundNumber = null;
  state.lastSessionSave = null;
}

function startRound(
  state,
  settings,
  {
    frameInstanceId,
    spawnRequested,
    detectedAt,
    pageRoundNumber = null,
    pageRoundTotal = null,
    captureMode = null,
    startSource = "streetview-frame",
    provisional = false,
  },
) {
  if (!captureSessionReady(state, settings)) return null;
  clearFinalizeTimer(state.tabId);
  ensureSessionForRound(state, settings);
  const nowMs = parseTime(detectedAt) ?? Date.now();
  const detectedRoundNumber = positiveIntegerOrNull(pageRoundNumber);
  const nextCounter = (state.roundCounter ?? 0) + 1;
  state.roundCounter = Math.max(nextCounter, detectedRoundNumber ?? 0);
  const roundIndex = detectedRoundNumber
    ? detectedRoundNumber - 1
    : state.roundCounter - 1;
  state.awaitingNewFrame = false;
  state.advanceIntentAt = null;
  state.currentRound = {
    id: `round-${roundIndex + 1}`,
    index: roundIndex,
    pageRoundNumber: detectedRoundNumber,
    pageRoundTotal: positiveIntegerOrNull(pageRoundTotal),
    captureMode: normalizeCaptureMode(captureMode, settings.condition),
    startSource,
    provisional: Boolean(provisional),
    frameInstanceId: frameInstanceId ?? `frame-${Date.now()}`,
    startedAtMs: nowMs,
    startedAt: new Date(nowMs).toISOString(),
    spawnRequested: normalizeCameraPoint(spawnRequested),
    actualStart: null,
    samples: [],
    captureSources: {},
    prediction: null,
    predictionIntentAt: null,
    frozenAt: null,
    frozenAtMs: null,
    freezeReason: null,
    lastPageProbeAt: null,
    lastProbeSignature: null,
    diagnostics: {
      events: [],
      firstCaptureAt: null,
      lastCaptureAt: null,
      truncated: false,
    },
    settingsSnapshot: {
      competitionId: settings.competitionId,
      model: settings.model,
      condition: settings.condition,
      collectorUrl: settings.collectorUrl,
      fallbackDownload: settings.fallbackDownload,
      downloadSubfolder: settings.downloadSubfolder,
      sampleIntervalMs: settings.sampleIntervalMs,
      positionThresholdM: settings.positionThresholdM,
      angleThresholdDeg: settings.angleThresholdDeg,
      pitchThresholdDeg: settings.pitchThresholdDeg,
      zoomThreshold: settings.zoomThreshold,
      maxSilentIntervalMs: settings.maxSilentIntervalMs,
      maxSamples: settings.maxSamples,
    },
  };
  if (state.currentRound.pageRoundTotal) {
    state.expectedRoundCount ??= state.currentRound.pageRoundTotal;
  }
  addDiagnostic(state.currentRound, "round_started", {
    frameInstanceId,
    spawnRequested: state.currentRound.spawnRequested,
    pageRoundNumber: state.currentRound.pageRoundNumber,
    pageRoundTotal: state.currentRound.pageRoundTotal,
    captureMode: state.currentRound.captureMode,
    startSource,
    provisional: state.currentRound.provisional,
  });
  return state.currentRound;
}

function freezeRound(round, at, reason) {
  if (!round || Number.isFinite(round.frozenAtMs)) return;
  const atMs = parseTime(at) ?? Date.now();
  round.frozenAtMs = Math.max(round.startedAtMs, atMs);
  round.frozenAt = new Date(round.frozenAtMs).toISOString();
  round.freezeReason = reason ?? "result_visible";
  addDiagnostic(round, "round_frozen", {
    at: round.frozenAt,
    reason: round.freezeReason,
    sampleCount: round.samples.length,
    predictionCaptured: Boolean(round.prediction),
  });
}

function captureSample(round, payload) {
  const settings = round.settingsSnapshot;
  const capturedAtMs =
    Number.isFinite(Number(payload.capturedAtMs))
      ? Number(payload.capturedAtMs)
      : parseTime(payload.capturedAt) ?? Date.now();
  if (
    Number.isFinite(round.frozenAtMs) &&
    capturedAtMs > round.frozenAtMs
  ) {
    return;
  }
  // Exploration ends when the user submits the guess, not when the result DOM
  // finishes rendering. OpenGuessr may reset/recenter Street View during that
  // short transition; those API events must not become fake movement samples.
  const predictionIntentAtMs = parseTime(round.predictionIntentAt);
  if (Number.isFinite(predictionIntentAtMs) && capturedAtMs >= predictionIntentAtMs) {
    return;
  }

  const point = {
    seq: round.samples.length,
    roundIndex: round.index,
    tMs: Math.max(0, capturedAtMs - round.startedAtMs),
    capturedAt: new Date(capturedAtMs).toISOString(),
    receivedAt: new Date().toISOString(),
    ...normalizeCameraPoint(payload),
    source: payload.source ?? "api",
    reason: payload.reason ?? "capture",
    frameInstanceId: payload.frameInstanceId ?? round.frameInstanceId,
  };

  const previous = round.samples.at(-1);
  if (previous && !sampleChanged(previous, point, settings)) return;

  if (round.samples.length >= settings.maxSamples) {
    round.diagnostics.truncated = true;
    round.samples[round.samples.length - 1] = {
      ...point,
      seq: round.samples.length - 1,
    };
  } else {
    round.samples.push(point);
  }

  if (!round.actualStart) {
    round.actualStart = {
      lat: point.lat,
      lng: point.lng,
      capturedAt: point.capturedAt,
      panoId: point.panoId ?? null,
    };
  }

  round.captureSources[point.source] =
    (round.captureSources[point.source] ?? 0) + 1;
  round.diagnostics.firstCaptureAt ??= point.capturedAt;
  round.diagnostics.lastCaptureAt = point.capturedAt;
}

function sampleChanged(previous, current, settings) {
  if ((current.tMs ?? 0) - (previous.tMs ?? 0) >= settings.maxSilentIntervalMs) {
    return true;
  }
  if (current.panoId && current.panoId !== previous.panoId) return true;
  if (
    distanceMeters(previous, current) >= settings.positionThresholdM ||
    angularDifference(previous.heading, current.heading) >=
      settings.angleThresholdDeg ||
    absoluteDifference(previous.pitch, current.pitch) >=
      settings.pitchThresholdDeg ||
    absoluteDifference(previous.zoom, current.zoom) >= settings.zoomThreshold ||
    absoluteDifference(previous.fov, current.fov) >= settings.zoomThreshold
  ) {
    return true;
  }
  return false;
}

async function finalizeRound(tabId, state, stopReason) {
  clearFinalizeTimer(tabId);
  const round = state.currentRound;
  if (!round) return null;

  if (!round.samples.length && isCoordinate(round.spawnRequested)) {
    captureSample(round, {
      ...round.spawnRequested,
      capturedAt: round.startedAt,
      capturedAtMs: round.startedAtMs,
      source: round.captureMode === "nmpz" ? "openguessr-nmpz" : "synthetic",
      reason: "finalize_start_fallback",
      frameInstanceId: round.frameInstanceId,
    });
  }

  const stoppedAtMs = Number.isFinite(round.frozenAtMs)
    ? round.frozenAtMs
    : Date.now();
  const lastSampleMs = round.samples.at(-1)?.tMs ?? 0;
  const durationMs = Math.max(lastSampleMs, stoppedAtMs - round.startedAtMs);
  const stoppedAt = new Date(round.startedAtMs + durationMs).toISOString();
  const settings = round.settingsSnapshot;
  const configuredCondition = settings.condition;
  const condition = effectiveConditionForRound(round, configuredCondition);
  const recordingId = `ogrr-${safeIsoForId(round.startedAt)}-${randomId()}`;
  const roundMetadata = {
    index: round.index,
    id: round.id,
    detectedAt: round.startedAt,
    detectedAtMs: round.startedAtMs,
    endedAt: stoppedAt,
    endedAtMs: round.startedAtMs + durationMs,
    roundSignal: buildRoundSignal(round),
    spawnRequested: round.spawnRequested,
    actualStart: round.actualStart,
    sampleCount: round.samples.length,
    firstSampleSeq: round.samples[0]?.seq ?? null,
    lastSampleSeq: round.samples.at(-1)?.seq ?? null,
    frameInstanceId: round.frameInstanceId,
    pageRoundNumber: round.pageRoundNumber ?? null,
    pageRoundTotal: round.pageRoundTotal ?? null,
    captureMode: round.captureMode ?? null,
    startSource: round.startSource ?? null,
    provisional: Boolean(round.provisional),
    frozenAt: round.frozenAt ?? null,
    freezeReason: round.freezeReason ?? null,
  };

  const recording = {
    schemaVersion: "2.0",
    recordingType: "openguessr-round",
    recorder: {
      name: RECORDER_NAME,
      version: EXTENSION_VERSION,
    },
    id: recordingId,
    sessionId: state.sessionId,
    sourceApplication: "OpenGuessr",
    pageUrl: state.pageContext?.pageUrl ?? null,
    competitionId: settings.competitionId,
    competitionOverallIndex:
      round.pageRoundNumber ?? (Number.isInteger(round.index) ? round.index + 1 : null),
    openGuessrCompetitionHint: state.pageContext?.competitionHint ?? null,
    model: settings.model,
    condition,
    configuredCondition:
      condition === configuredCondition ? null : configuredCondition,
    captureMode: round.captureMode ?? null,
    restriction: round.captureMode === "nmpz" ? "nmpz" : null,
    partial: !round.prediction,
    startedAt: round.startedAt,
    stoppedAt,
    durationMs,
    stopReason,
    prediction: round.prediction,
    config: {
      sampleIntervalMs: settings.sampleIntervalMs,
      positionThresholdM: settings.positionThresholdM,
      angleThresholdDeg: settings.angleThresholdDeg,
      pitchThresholdDeg: settings.pitchThresholdDeg,
      zoomThreshold: settings.zoomThreshold,
      maxSilentIntervalMs: settings.maxSilentIntervalMs,
      maxSamples: settings.maxSamples,
    },
    round: roundMetadata,
    rounds: [roundMetadata],
    captureSources: round.captureSources,
    sampleCount: round.samples.length,
    keyMoments: buildKeyMoments(round.samples, round.prediction, durationMs),
    diagnostics: {
      ...round.diagnostics,
      lastPageProbe: state.pageProbe ?? null,
    },
    samples: round.samples,
  };

  state.currentRound = null;
  state.awaitingNewFrame = true;
  state.lastFinishedFrameInstanceId = round.frameInstanceId;
  // Track the terminal LIVE camera state, not the initial spawn. In interactive
  // rounds the result screen can continue emitting the explored position; using
  // the spawn here makes that old position look like a new round.
  state.lastFinishedCoordinate =
    round.samples.at(-1) ?? round.actualStart ?? round.spawnRequested ?? null;
  state.lastFinishedPanoId = round.samples.at(-1)?.panoId ?? null;
  state.lastFinishedAt = stoppedAt;
  state.lastFinishedRoundNumber =
    round.pageRoundNumber ?? (Number.isInteger(round.index) ? round.index + 1 : null);
  state.lastRecordingId = recordingId;
  await persistTabState(tabId, state);

  const saveResult = await deliverRecording(recording, settings);
  state.lastSave = {
    at: new Date().toISOString(),
    recordingId,
    ...saveResult,
  };

  if (Number.isInteger(saveResult.competitionLocationCount)) {
    state.expectedRoundCount = saveResult.competitionLocationCount;
  }
  state.completedRounds ??= [];
  state.completedRounds.push({
    recordingId,
    roundId: round.id,
    roundIndex: round.index,
    startedAt: round.startedAt,
    stoppedAt,
    stopReason,
    sampleCount: round.samples.length,
    predictionCaptured: Boolean(round.prediction),
    condition,
    captureMode: round.captureMode ?? null,
    saveMethod: saveResult.method,
    saveSuccess: Boolean(saveResult.success),
    path: saveResult.path ?? null,
    locationId: saveResult.locationId ?? null,
    competitionPartId: saveResult.competitionPartId ?? null,
    competitionRound:
      saveResult.competitionRound ?? round.pageRoundNumber ?? round.index + 1,
    competitionOverallIndex:
      saveResult.competitionOverallIndex ?? round.pageRoundNumber ?? round.index + 1,
    locationMatchDistanceMeters: saveResult.locationMatchDistanceMeters ?? null,
  });

  const completedRoundCount = countCompletedRounds(state.completedRounds);
  state.sessionStatus =
    Number.isInteger(state.expectedRoundCount) &&
    completedRoundCount >= state.expectedRoundCount
      ? "complete"
      : "active";
  if (state.sessionStatus === "complete") {
    state.recordingArmed = false;
  }
  state.lastRoundSavedAt = new Date().toISOString();

  const sessionSave = await deliverSessionManifest(state, settings);
  state.lastSessionSave = {
    at: new Date().toISOString(),
    ...sessionSave,
  };
  await persistTabState(tabId, state);
  return recording;
}

async function deliverRecording(recording, settings) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(settings.collectorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(recording),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? `Collector returned HTTP ${response.status}.`);
    }
    return {
      method: "collector",
      success: true,
      path: payload.path ?? null,
      locationId: payload.locationId ?? null,
      locationMatchDistanceMeters: payload.locationMatchDistanceMeters ?? null,
      competitionPartId: payload.competitionPartId ?? null,
      competitionRound: payload.competitionRound ?? null,
      competitionOverallIndex: payload.competitionOverallIndex ?? null,
      competitionLocationCount: Number.isInteger(payload.competitionLocationCount)
        ? payload.competitionLocationCount
        : null,
    };
  } catch (error) {
    if (!settings.fallbackDownload) {
      return {
        method: "collector",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const filename = buildFallbackFilename(recording, settings);
      const url = `data:application/json;charset=utf-8,${encodeURIComponent(
        `${JSON.stringify(recording, null, 2)}\n`,
      )}`;
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify",
      });
      return {
        method: "download-fallback",
        success: true,
        downloadId,
        collectorError: error instanceof Error ? error.message : String(error),
      };
    } catch (downloadError) {
      return {
        method: "download-fallback",
        success: false,
        error:
          downloadError instanceof Error
            ? downloadError.message
            : String(downloadError),
        collectorError: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function deliverSessionManifest(state, settings) {
  if (!state.sessionId || !state.sessionContext) {
    return { success: false, error: "Session has not started." };
  }

  let endpoint;
  try {
    endpoint = new URL(settings.collectorUrl);
    endpoint.pathname = "/api/sessions";
    endpoint.search = "";
    endpoint.hash = "";
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildSessionManifest(state)),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? `Collector returned HTTP ${response.status}.`);
    }
    return {
      success: true,
      method: "collector",
      path: payload.path ?? null,
      roundCount: payload.roundCount ?? countCompletedRounds(state.completedRounds),
    };
  } catch (error) {
    return {
      success: false,
      method: "collector",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSessionManifest(state) {
  const rounds = Array.isArray(state.completedRounds) ? state.completedRounds : [];
  const completedConditions = [
    ...new Set(rounds.map((round) => round.condition).filter(Boolean)),
  ];
  const effectiveCondition =
    completedConditions.length === 1
      ? completedConditions[0]
      : state.sessionContext?.condition ?? "interactive-panorama";
  return {
    schemaVersion: "1.0",
    sessionId: state.sessionId,
    sourceApplication: "OpenGuessr",
    recorder: {
      name: RECORDER_NAME,
      version: EXTENSION_VERSION,
    },
    competitionId: state.sessionContext?.competitionId ?? "unassigned",
    openGuessrCompetitionHint:
      state.sessionContext?.openGuessrCompetitionHint ??
      state.pageContext?.competitionHint ??
      null,
    model: state.sessionContext?.model ?? "Unknown model",
    condition: effectiveCondition,
    configuredCondition: state.sessionContext?.condition ?? null,
    pageUrl: state.pageContext?.pageUrl ?? null,
    startedAt: state.sessionStartedAt ?? null,
    updatedAt: new Date().toISOString(),
    status: state.sessionStatus ?? "active",
    expectedRoundCount: state.expectedRoundCount ?? null,
    completedRoundCount: countCompletedRounds(rounds),
    rounds,
  };
}


function normalizeCaptureMode(modeHint, configuredCondition) {
  if (configuredCondition === "static-image") return "nmpz";
  if (configuredCondition === "interactive-panorama") return "interactive";
  return modeHint === "nmpz" ? "nmpz" : "interactive";
}

function effectiveConditionForRound(round, configuredCondition) {
  if (configuredCondition === "static-image" || configuredCondition === "interactive-panorama") {
    return configuredCondition;
  }
  return round?.captureMode === "nmpz" ? "static-image" : "interactive-panorama";
}

function countCompletedRounds(rounds) {
  const keys = new Set();
  for (const round of rounds ?? []) {
    // A formal experiment round is only complete once its prediction was captured
    // and its JSON was successfully saved. Partial transition artifacts may still
    // be preserved for diagnostics, but they must never advance 7/8 to 8/8.
    if (!round?.predictionCaptured || round?.saveSuccess === false) continue;
    const key = Number.isInteger(round.competitionOverallIndex)
      ? `overall:${round.competitionOverallIndex}`
      : Number.isInteger(round.competitionRound)
        ? `round:${round.competitionRound}`
        : `local:${round.roundIndex ?? round.recordingId}`;
    keys.add(key);
  }
  return keys.size;
}

function buildKeyMoments(samples, prediction, durationMs) {
  if (!samples.length) {
    return prediction
      ? [
          {
            id: "prediction-submitted",
            label: "Prediction submitted",
            description: "The final pin was submitted.",
            tMs: durationMs,
          },
        ]
      : [];
  }

  const moments = [
    {
      id: "exploration-start",
      label: "Exploration start",
      description: "Initial Street View camera state.",
      tMs: samples[0].tMs ?? 0,
    },
  ];

  const movement = samples.find(
    (sample) => distanceMeters(samples[0], sample) >= 5,
  );
  if (movement) {
    moments.push({
      id: "first-movement",
      label: "First movement",
      description: "The model moved to another panorama position.",
      tMs: movement.tMs,
    });
  }

  const strongestZoom = [...samples]
    .filter((sample) => Number.isFinite(sample.fov) || Number.isFinite(sample.zoom))
    .sort((a, b) => zoomStrength(b) - zoomStrength(a))[0];
  if (
    strongestZoom &&
    strongestZoom !== samples[0] &&
    strongestZoom !== movement
  ) {
    moments.push({
      id: "strongest-zoom",
      label: "Strongest zoom",
      description: "The narrowest recorded camera view.",
      tMs: strongestZoom.tMs,
    });
  }

  if (prediction) {
    moments.push({
      id: "prediction-submitted",
      label: "Prediction submitted",
      description: "The final OpenGuessr pin was submitted.",
      tMs: durationMs,
    });
  }

  return moments.sort((a, b) => a.tMs - b.tMs);
}

function zoomStrength(sample) {
  if (Number.isFinite(sample.fov)) return 200 - sample.fov;
  if (Number.isFinite(sample.zoom)) return sample.zoom;
  return -Infinity;
}

function scheduleFinalize(tabId, delayMs, reason, round = null) {
  clearFinalizeTimer(tabId);
  const expectedRound = round
    ? { id: round.id, startedAt: round.startedAt }
    : null;
  const timer = setTimeout(async () => {
    finalizeTimers.delete(tabId);
    const state = await getTabState(tabId);
    if (
      expectedRound &&
      (state.currentRound?.id !== expectedRound.id ||
        state.currentRound?.startedAt !== expectedRound.startedAt)
    ) {
      return;
    }
    await finalizeRound(tabId, state, reason);
  }, delayMs);
  finalizeTimers.set(tabId, timer);
}

function clearFinalizeTimer(tabId) {
  const timer = finalizeTimers.get(tabId);
  if (timer) clearTimeout(timer);
  finalizeTimers.delete(tabId);
}

async function closeTabSession(tabId) {
  clearFinalizeTimer(tabId);
  try {
    const state = await getTabState(tabId);
    const settings = await getSettings();
    if (state.currentRound) {
      await finalizeRound(tabId, state, "tab_closed");
    }
    if (state.sessionId && (state.completedRounds?.length ?? 0) > 0) {
      if (state.sessionStatus !== "complete") state.sessionStatus = "closed";
      state.lastSessionSave = {
        at: new Date().toISOString(),
        ...(await deliverSessionManifest(state, settings)),
      };
    }
  } catch {
    // A tab-closing cleanup must never surface an extension error to the user.
  } finally {
    tabStateCache.delete(tabId);
    await removePersistedTabState(tabId);
  }
}


async function saveActiveCheckpoint() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) {
    return {
      status: null,
      checkpoint: { success: false, error: "No active browser tab." },
    };
  }

  const settings = await getSettings();
  const state = await getTabState(tab.id);
  await refreshPageProbe(tab.id, state, settings);
  state.updatedAt = new Date().toISOString();
  const checkpoint = buildCheckpoint(state, settings, tab);
  const result = await deliverCheckpoint(checkpoint, settings);
  state.lastCheckpoint = {
    at: checkpoint.savedAt,
    checkpointId: checkpoint.id,
    ...result,
  };
  await persistTabState(tab.id, state, { forceRecovery: true });
  return {
    status: publicStatus(state),
    checkpoint: state.lastCheckpoint,
  };
}

async function exportActiveDiagnostics() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) {
    return {
      status: null,
      diagnostics: { success: false, error: "No active browser tab." },
    };
  }

  const settings = await getSettings();
  const state = await getTabState(tab.id);
  await refreshPageProbe(tab.id, state, settings);
  state.updatedAt = new Date().toISOString();
  await persistTabState(tab.id, state, { forceRecovery: true });

  const diagnostics = {
    ...buildCheckpoint(state, settings, tab),
    checkpointType: "openguessr-recorder-diagnostics",
    guidance: {
      currentRoundDetected: Boolean(state.currentRound),
      nmpzDetected:
        state.currentRound?.captureMode === "nmpz" ||
        state.pageProbe?.modeHint === "nmpz",
      note:
        "This diagnostics file is not treated as a completed round. Use Save checkpoint to preserve live state or Finalize current round to create a round recording.",
    },
  };
  const filename = `${settings.downloadSubfolder}/diagnostics/${safeIsoForId(
    diagnostics.savedAt,
  )}__recorder-diagnostics.json`;
  const result = await downloadJson(diagnostics, filename);
  state.lastDiagnosticsExport = {
    at: diagnostics.savedAt,
    ...result,
  };
  await persistTabState(tab.id, state);
  return {
    status: publicStatus(state),
    diagnostics: state.lastDiagnosticsExport,
  };
}

async function refreshPageProbe(tabId, state, settings) {
  if (typeof chrome.tabs.sendMessage !== "function") return null;
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "OGRR_PROBE_PAGE",
    });
    if (response?.probe) {
      state.pageProbe = sanitizePageProbe(response.probe);
      if (settings.enabled) {
        await handleDomProbe(tabId, state, state.pageProbe, settings);
      }
      return state.pageProbe;
    }
  } catch (error) {
    state.lastProbeError = {
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return null;
}

function buildCheckpoint(state, settings, tab) {
  const savedAt = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    checkpointType: "openguessr-live-state",
    id: `checkpoint-${safeIsoForId(savedAt)}-${randomId()}`,
    savedAt,
    recorder: {
      name: RECORDER_NAME,
      version: EXTENSION_VERSION,
    },
    tab: {
      id: tab?.id ?? state.tabId ?? null,
      url: state.pageContext?.pageUrl ?? tab?.url ?? null,
      title: tab?.title ?? state.pageContext?.title ?? null,
    },
    settings: {
      enabled: settings.enabled,
      competitionId: settings.competitionId,
      model: settings.model,
      condition: settings.condition,
      collectorUrl: settings.collectorUrl,
      fallbackDownload: settings.fallbackDownload,
      sampleIntervalMs: settings.sampleIntervalMs,
      maxSamples: settings.maxSamples,
    },
    status: publicStatus(state),
    pageContext: state.pageContext ?? null,
    pageProbe: state.pageProbe ?? null,
    currentRound: state.currentRound ?? null,
    completedRounds: state.completedRounds ?? [],
    recovery: {
      canFinalize: Boolean(state.currentRound),
      hasCoordinate:
        isCoordinate(state.currentRound?.actualStart) ||
        isCoordinate(state.currentRound?.spawnRequested) ||
        isCoordinate(state.currentRound?.samples?.[0]),
      roundCanBeMatchedByOrder:
        Boolean(settings.competitionId) &&
        (Number.isInteger(state.currentRound?.pageRoundNumber) ||
          Number.isInteger(state.currentRound?.index)),
    },
  };
}

async function deliverCheckpoint(checkpoint, settings) {
  let endpoint;
  try {
    endpoint = new URL(settings.collectorUrl);
    endpoint.pathname = "/api/checkpoints";
    endpoint.search = "";
    endpoint.hash = "";
  } catch {
    endpoint = null;
  }

  if (endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(checkpoint),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `Collector returned HTTP ${response.status}.`);
      }
      return {
        success: true,
        method: "collector",
        path: payload.path ?? null,
      };
    } catch (error) {
      if (!settings.fallbackDownload) {
        return {
          success: false,
          method: "collector",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      const filename = `${settings.downloadSubfolder}/checkpoints/${safeIsoForId(
        checkpoint.savedAt,
      )}__live-checkpoint.json`;
      const fallback = await downloadJson(checkpoint, filename);
      return {
        ...fallback,
        method: fallback.success ? "download-fallback" : "download-fallback",
        collectorError: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const filename = `${settings.downloadSubfolder}/checkpoints/${safeIsoForId(
    checkpoint.savedAt,
  )}__live-checkpoint.json`;
  return downloadJson(checkpoint, filename);
}

async function downloadJson(value, filename) {
  try {
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(
      `${JSON.stringify(value, null, 2)}\n`,
    )}`;
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });
    return { success: true, method: "download", downloadId, path: filename };
  } catch (error) {
    return {
      success: false,
      method: "download",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}



function confirmCompetitionStart(state, source, at = null) {
  if (!state.recordingArmed || state.competitionStartConfirmed || state.sessionId) return false;
  const timestamp = at ?? new Date().toISOString();
  state.competitionStartConfirmed = true;
  state.competitionStartIntentAt = timestamp;
  state.competitionStartedAt = timestamp;
  state.lastManualAction = {
    at: timestamp,
    success: true,
    message: `OpenGuessr start detected (${source}). Waiting for the first live round.`,
  };
  return true;
}

function maybeConfirmCompetitionStartFromProbe(state, previousProbe, probe, settings) {
  if (!captureIsArmed(state, settings) || state.competitionStartConfirmed || state.sessionId || !probe) {
    return false;
  }

  if (probe.competitionStartPromptVisible) {
    state.startPromptSeen = true;
    state.startPromptSignature = probe.competitionStartSignature ?? state.startPromptSignature ?? null;
    state.armPrimaryViewFingerprint ??= probeViewFingerprint(probe.primaryView);
    return false;
  }

  const promptWasVisible = Boolean(
    state.startPromptSeen || previousProbe?.competitionStartPromptVisible,
  );
  if (!promptWasVisible) return false;

  if (!state.startPromptDismissedAt) {
    state.startPromptDismissedAt = probe.at ?? new Date().toISOString();
  }

  if (probe.resultVisible || probe.pageState === "result") return false;

  const currentFingerprint = probeViewFingerprint(probe.primaryView);
  const baselineFingerprint = state.armPrimaryViewFingerprint;
  const viewChanged = Boolean(
    currentFingerprint && baselineFingerprint && currentFingerprint !== baselineFingerprint,
  );
  const explicitRoundSignal = Boolean(
    probe.roundLikelyActive ||
      probe.pageState === "round" ||
      probe.guessControlVisible ||
      Number.isInteger(probe.roundNumber),
  );
  const routeChanged = Boolean(
    previousProbe?.pathname &&
      probe.pathname &&
      previousProbe.pathname !== probe.pathname,
  );
  const promptDismissedIntoPlayableView = Boolean(
    isCoordinate(probe.primaryView) &&
      !probe.competitionStartPromptVisible &&
      (routeChanged || state.competitionStartIntentAt),
  );

  if (explicitRoundSignal || viewChanged || promptDismissedIntoPlayableView) {
    return confirmCompetitionStart(
      state,
      explicitRoundSignal
        ? "live-round transition"
        : viewChanged
          ? "Street View changed after Start"
          : "competition dialog dismissed into live view",
      probe.at,
    );
  }
  return false;
}

function observeGoogleFrameState(state, event, payload) {
  if (!["frame-ready", "spawn-requested", "sample"].includes(event)) return;
  if (payload?.frameInstanceId) {
    state.lastObservedGoogleFrameInstanceId = payload.frameInstanceId;
  }
  const point = isCoordinate(payload?.spawnRequested)
    ? payload.spawnRequested
    : isCoordinate(payload)
      ? payload
      : null;
  if (point) state.lastObservedGoogleView = normalizeCameraPoint(point);
}

function maybeConfirmCompetitionStartFromGoogle(state, event, payload, settings) {
  if (!captureIsArmed(state, settings) || state.competitionStartConfirmed || state.sessionId) {
    return false;
  }
  if (!["frame-ready", "spawn-requested", "sample"].includes(event)) return false;
  if (!state.startPromptSeen) return false;
  if (state.pageProbe?.resultVisible) return false;

  const frameInstanceId = payload?.frameInstanceId ?? null;
  const point = isCoordinate(payload?.spawnRequested)
    ? payload.spawnRequested
    : isCoordinate(payload)
      ? payload
      : null;
  const newFrame = Boolean(
    frameInstanceId && frameInstanceId !== state.armGoogleFrameInstanceId,
  );
  const currentFingerprint = probeViewFingerprint(point);
  const viewChanged = Boolean(
    currentFingerprint &&
      state.armPrimaryViewFingerprint &&
      currentFingerprint !== state.armPrimaryViewFingerprint,
  );

  const explicitStartSeen = Boolean(state.competitionStartIntentAt);
  const promptDismissed = Boolean(
    state.startPromptDismissedAt ||
      state.pageProbe?.competitionStartPromptVisible === false,
  );

  if (!viewChanged && !(newFrame && (explicitStartSeen || promptDismissed))) return false;
  return confirmCompetitionStart(
    state,
    viewChanged
      ? "new Street View location after Start"
      : "new Street View frame after Start",
    payload?.at ?? payload?.capturedAt ?? null,
  );
}

function probeViewFingerprint(value) {
  if (!value || typeof value !== "object") return null;
  if (value.urlFingerprint) return String(value.urlFingerprint);
  if (!isCoordinate(value)) return null;
  const lat = Number(value.lat).toFixed(6);
  const lng = Number(value.lng).toFixed(6);
  const pano = value.panoId ? String(value.panoId) : "none";
  return `${lat},${lng}|${pano}`;
}

function captureIsArmed(state, settings) {
  return settings.enabled !== false && Boolean(state.recordingArmed);
}

function captureSessionReady(state, settings) {
  return (
    captureIsArmed(state, settings) &&
    Boolean(state.sessionId || state.currentRound || state.competitionStartConfirmed)
  );
}

function settingsForState(state, settings) {
  if (!state.armContext) return settings;
  return {
    ...settings,
    competitionId: state.armContext.competitionId ?? settings.competitionId,
    model: state.armContext.model ?? settings.model,
    condition: state.armContext.condition ?? settings.condition,
  };
}

async function resolveTabId(sender) {
  if (Number.isInteger(sender?.tab?.id)) return sender.tab.id;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return Number.isInteger(tab?.id) ? tab.id : null;
}

async function getPageUiState(sender, includeCollector = false) {
  const tabId = await resolveTabId(sender);
  const settings = await getSettings();
  const status = Number.isInteger(tabId)
    ? publicStatus(await getTabState(tabId))
    : null;
  return {
    status,
    settings,
    collector: includeCollector ? await testCollector() : null,
  };
}

async function armSenderTab(sender, setup = {}) {
  const tabId = await resolveTabId(sender);
  if (!Number.isInteger(tabId)) throw new Error("No OpenGuessr tab is available to arm.");
  return armTab(tabId, setup);
}

async function armActiveTab(setup = {}) {
  const tabId = await resolveTabId(null);
  if (!Number.isInteger(tabId)) return null;
  const result = await armTab(tabId, setup);
  return result.status;
}

async function armTab(tabId, setup = {}) {
  const previous = await getTabState(tabId);
  if (previous.currentRound) {
    throw new Error("A round is already recording. Stop or finalize it before arming a new competition.");
  }

  const currentSettings = await getSettings();
  const requestedSettings = {
    ...currentSettings,
    ...setup,
    enabled: true,
  };

  if (previous.recordingArmed) {
    const existing = settingsForState(previous, currentSettings);
    const sameSetup =
      String(existing.competitionId ?? "") === String(requestedSettings.competitionId ?? "") &&
      String(existing.model ?? "") === String(requestedSettings.model ?? "") &&
      String(existing.condition ?? "") === String(requestedSettings.condition ?? "");
    if (!sameSetup) {
      throw new Error("This tab is already armed with a different setup. Stop recording before changing competition, model, or condition.");
    }
    previous.lastManualAction = {
      at: new Date().toISOString(),
      success: true,
      message: "Recorder was already armed for this competition; the existing arm state was kept.",
    };
    await persistTabState(tabId, previous, { forceRecovery: true });
    return { status: publicStatus(previous), settings: currentSettings };
  }

  settingsCache = await saveSettings(requestedSettings);

  if (
    previous.sessionId &&
    (previous.completedRounds?.length ?? 0) > 0 &&
    previous.sessionStatus !== "complete"
  ) {
    previous.sessionStatus = "closed";
    await deliverSessionManifest(previous, settingsForState(previous, settingsCache));
  }

  clearFinalizeTimer(tabId);
  const state = createTabState(tabId);
  state.pageContext = previous.pageContext ?? null;
  state.pageProbe = previous.pageProbe ?? null;
  state.recordingArmed = true;
  state.armedAt = new Date().toISOString();
  state.competitionStartConfirmed = false;
  state.competitionStartIntentAt = null;
  state.competitionStartedAt = null;
  state.startPromptSeen = Boolean(previous.pageProbe?.competitionStartPromptVisible);
  state.startPromptSignature = previous.pageProbe?.competitionStartSignature ?? null;
  state.startPromptDismissedAt = null;
  state.armPrimaryViewFingerprint = probeViewFingerprint(previous.pageProbe?.primaryView);
  state.armGoogleFrameInstanceId = previous.lastObservedGoogleFrameInstanceId ?? null;
  state.sessionStatus = "armed";
  state.armContext = {
    competitionId: settingsCache.competitionId,
    model: settingsCache.model,
    condition: settingsCache.condition,
  };
  state.lastManualAction = {
    at: state.armedAt,
    success: true,
    message: "Recorder armed. Waiting for the competition to actually start.",
  };
  tabStateCache.set(tabId, state);
  await persistTabState(tabId, state, { forceRecovery: true });
  return { status: publicStatus(state), settings: settingsCache };
}

async function stopSenderTab(sender, reason = "user_stop") {
  const tabId = await resolveTabId(sender);
  if (!Number.isInteger(tabId)) return null;
  return stopTab(tabId, reason);
}

async function doneAndDisarmSenderTab(sender) {
  const tabId = await resolveTabId(sender);
  if (!Number.isInteger(tabId)) return null;
  return doneAndDisarmTab(tabId);
}

async function doneAndDisarmTab(tabId) {
  clearFinalizeTimer(tabId);
  const previous = await getTabState(tabId);
  if (previous.currentRound) {
    throw new Error("A round is still active. Finish or stop the round before disarming the completed competition.");
  }
  if (previous.sessionStatus !== "complete") {
    throw new Error("Done & disarm is available after a competition has completed.");
  }

  const state = createTabState(tabId);
  // Keep only live page observations so the next competition start dialog can
  // be detected normally. Saved round/session data has already been written.
  state.pageContext = previous.pageContext ?? null;
  state.pageProbe = previous.pageProbe ?? null;
  state.lastObservedGoogleFrameInstanceId =
    previous.lastObservedGoogleFrameInstanceId ?? null;
  state.lastObservedGoogleView = previous.lastObservedGoogleView ?? null;
  state.lastManualAction = {
    at: new Date().toISOString(),
    success: true,
    message: "Competition finished. Recorder disarmed and waiting for a new competition start dialog.",
  };

  tabStateCache.set(tabId, state);
  await persistTabState(tabId, state, { forceRecovery: true });
  return publicStatus(state);
}

async function stopActiveTab(reason = "user_stop") {
  const tabId = await resolveTabId(null);
  if (!Number.isInteger(tabId)) return null;
  return stopTab(tabId, reason);
}

async function stopTab(tabId, reason) {
  clearFinalizeTimer(tabId);
  const state = await getTabState(tabId);
  const settings = settingsForState(state, await getSettings());
  if (state.currentRound) {
    await finalizeRound(tabId, state, reason);
  }
  state.recordingArmed = false;
  if (state.sessionId && state.sessionStatus !== "complete") {
    state.sessionStatus = "closed";
    state.lastSessionSave = {
      at: new Date().toISOString(),
      ...(await deliverSessionManifest(state, settings)),
    };
  } else if (!state.sessionId) {
    state.sessionStatus = "idle";
  }
  state.lastManualAction = {
    at: new Date().toISOString(),
    success: true,
    message: "Recorder stopped. No new round will start until you arm it again.",
  };
  await persistTabState(tabId, state, { forceRecovery: true });
  return publicStatus(state);
}

async function getActiveTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) return null;
  const state = await getTabState(tab.id);
  return publicStatus(state);
}

async function finalizeActiveTab(reason) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) return null;
  const state = await getTabState(tab.id);
  const settings = await getSettings();
  await refreshPageProbe(tab.id, state, settings);
  if (!state.currentRound) {
    await ensureRoundFromProbe(tab.id, state, settings, "manual_finalize", {
      force: Boolean(state.pageProbe?.roundLikelyActive),
    });
  }
  if (!state.currentRound) {
    state.lastManualAction = {
      at: new Date().toISOString(),
      success: false,
      message:
        "No active round was detected. Save a checkpoint to inspect the page probe and recorder state.",
    };
    await persistTabState(tab.id, state);
    return publicStatus(state);
  }
  await finalizeRound(tab.id, state, reason);
  state.lastManualAction = {
    at: new Date().toISOString(),
    success: true,
    message: "Current round finalized and saved.",
  };
  await persistTabState(tab.id, state);
  return publicStatus(state);
}

async function resetActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) return null;
  clearFinalizeTimer(tab.id);

  const previous = await getTabState(tab.id);
  const settings = await getSettings();
  if (previous.currentRound) {
    await finalizeRound(tab.id, previous, "session_reset");
  }
  if (
    previous.sessionId &&
    (previous.completedRounds?.length ?? 0) > 0 &&
    previous.sessionStatus !== "complete"
  ) {
    previous.sessionStatus = "closed";
    await deliverSessionManifest(previous, settings);
  }

  const state = createTabState(tab.id);
  tabStateCache.set(tab.id, state);
  await persistTabState(tab.id, state);
  return publicStatus(state);
}

async function testCollector() {
  const settings = await getSettings();
  const url = new URL(settings.collectorUrl);
  url.pathname = "/api/health";
  url.search = "";
  url.hash = "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    }
    return { connected: true, ...payload };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getSettings() {
  settingsCache ??= await loadSettings();
  return settingsCache;
}

async function getTabState(tabId) {
  if (tabStateCache.has(tabId)) return tabStateCache.get(tabId);

  const key = `${TAB_STATE_PREFIX}${tabId}`;
  const recoveryKey = `${RECOVERY_STATE_PREFIX}${tabId}`;
  const storage = chrome.storage.session ?? chrome.storage.local;
  const stored = await storage.get(key);
  const recovery = stored[key]
    ? null
    : await chrome.storage.local.get(recoveryKey);
  const state = normalizeTabState(
    stored[key] ?? recovery?.[recoveryKey] ?? createTabState(tabId),
    tabId,
  );
  tabStateCache.set(tabId, state);
  return state;
}

function createTabState(tabId) {
  return {
    tabId,
    sessionId: null,
    sessionStartedAt: null,
    sessionStatus: "idle",
    sessionContext: null,
    recordingArmed: false,
    armContext: null,
    armedAt: null,
    competitionStartConfirmed: false,
    competitionStartIntentAt: null,
    competitionStartedAt: null,
    startPromptSeen: false,
    startPromptSignature: null,
    startPromptDismissedAt: null,
    armPrimaryViewFingerprint: null,
    armGoogleFrameInstanceId: null,
    lastObservedGoogleFrameInstanceId: null,
    lastObservedGoogleView: null,
    lastRoundSavedAt: null,
    completedRounds: [],
    expectedRoundCount: null,
    pendingSessionReset: false,
    roundCounter: 0,
    currentRound: null,
    awaitingNewFrame: false,
    lastFinishedFrameInstanceId: null,
    lastFinishedCoordinate: null,
    lastFinishedPanoId: null,
    lastFinishedAt: null,
    lastFinishedRoundNumber: null,
    advanceIntentAt: null,
    pageContext: null,
    pageProbe: null,
    lastProbeError: null,
    lastSave: null,
    lastCheckpoint: null,
    lastDiagnosticsExport: null,
    lastManualAction: null,
    recoveryBackedUpAt: null,
    recoveryBackupError: null,
    lastRecoveryWriteAtMs: null,
    lastSessionSave: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTabState(state, tabId) {
  state.tabId = tabId;
  state.sessionStartedAt ??= null;
  state.sessionStatus ??= state.sessionId ? "active" : "idle";
  state.sessionContext ??= null;
  state.recordingArmed = Boolean(state.recordingArmed);
  state.armContext ??= null;
  state.armedAt ??= null;
  state.competitionStartConfirmed = Boolean(state.competitionStartConfirmed);
  state.competitionStartIntentAt ??= null;
  state.competitionStartedAt ??= state.competitionStartIntentAt ?? null;
  state.startPromptSeen = Boolean(state.startPromptSeen);
  state.startPromptSignature ??= null;
  state.startPromptDismissedAt ??= null;
  state.armPrimaryViewFingerprint ??= null;
  state.armGoogleFrameInstanceId ??= null;
  state.lastObservedGoogleFrameInstanceId ??= null;
  state.lastObservedGoogleView ??= null;
  state.lastRoundSavedAt ??= null;
  state.completedRounds = Array.isArray(state.completedRounds)
    ? state.completedRounds
    : [];
  state.expectedRoundCount ??= null;
  state.pendingSessionReset ??= false;
  state.lastFinishedRoundNumber ??= null;
  state.pageProbe ??= null;
  state.lastProbeError ??= null;
  state.lastCheckpoint ??= null;
  state.lastDiagnosticsExport ??= null;
  state.lastManualAction ??= null;
  state.recoveryBackedUpAt ??= null;
  state.recoveryBackupError ??= null;
  state.lastRecoveryWriteAtMs ??= null;
  state.lastSessionSave ??= null;
  return state;
}

async function persistTabState(
  tabId,
  state,
  { forceRecovery = false } = {},
) {
  const key = `${TAB_STATE_PREFIX}${tabId}`;
  const recoveryKey = `${RECOVERY_STATE_PREFIX}${tabId}`;
  const storage = chrome.storage.session ?? chrome.storage.local;
  await storage.set({ [key]: state });

  const now = Date.now();
  const shouldWriteRecovery =
    forceRecovery ||
    !state.currentRound ||
    !Number.isFinite(state.lastRecoveryWriteAtMs) ||
    now - state.lastRecoveryWriteAtMs >= 2000;
  if (shouldWriteRecovery) {
    try {
      state.recoveryBackedUpAt = new Date(now).toISOString();
      state.lastRecoveryWriteAtMs = now;
      await chrome.storage.local.set({ [recoveryKey]: state });
      state.recoveryBackupError = null;
    } catch (error) {
      state.recoveryBackupError = {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  tabStateCache.set(tabId, state);
}

async function removePersistedTabState(tabId) {
  const key = `${TAB_STATE_PREFIX}${tabId}`;
  const recoveryKey = `${RECOVERY_STATE_PREFIX}${tabId}`;
  const storage = chrome.storage.session ?? chrome.storage.local;
  await storage.remove(key);
  await chrome.storage.local.remove(recoveryKey);
}

function publicStatus(state) {
  const completedRoundCount = countCompletedRounds(state.completedRounds ?? []);
  const lastCompletedRound = state.completedRounds?.at(-1) ?? null;
  return {
    sessionId: state.sessionId,
    recordingArmed: Boolean(state.recordingArmed),
    armedAt: state.armedAt ?? null,
    competitionStartConfirmed: Boolean(state.competitionStartConfirmed),
    competitionStartIntentAt: state.competitionStartIntentAt ?? null,
    competitionStartedAt: state.competitionStartedAt ?? null,
    startPromptSeen: Boolean(state.startPromptSeen),
    startPromptDismissedAt: state.startPromptDismissedAt ?? null,
    armContext: state.armContext ?? null,
    recordingState: state.currentRound
      ? "recording"
      : state.sessionStatus === "complete"
        ? "complete"
        : state.recordingArmed
          ? "armed"
          : "idle",
    session: state.sessionId
      ? {
          id: state.sessionId,
          status: state.sessionStatus ?? "active",
          startedAt: state.sessionStartedAt ?? null,
          competitionId: state.sessionContext?.competitionId ?? null,
          model: state.sessionContext?.model ?? null,
          condition: state.sessionContext?.condition ?? null,
          completedRoundCount,
          expectedRoundCount: state.expectedRoundCount ?? null,
        }
      : null,
    pageUrl: state.pageContext?.pageUrl ?? null,
    currentRound: state.currentRound
      ? {
          id: state.currentRound.id,
          index: state.currentRound.index,
          startedAt: state.currentRound.startedAt,
          sampleCount: state.currentRound.samples.length,
          predictionCaptured: Boolean(state.currentRound.prediction),
          frameInstanceId: state.currentRound.frameInstanceId,
          pageRoundNumber: state.currentRound.pageRoundNumber ?? null,
          pageRoundTotal: state.currentRound.pageRoundTotal ?? null,
          captureMode: state.currentRound.captureMode ?? null,
          provisional: Boolean(state.currentRound.provisional),
          frozen: Number.isFinite(state.currentRound.frozenAtMs),
          freezeReason: state.currentRound.freezeReason ?? null,
          hasCoordinate:
            isCoordinate(state.currentRound.actualStart) ||
            isCoordinate(state.currentRound.spawnRequested) ||
            isCoordinate(state.currentRound.samples?.[0]),
        }
      : null,
    awaitingNewFrame: state.awaitingNewFrame,
    lastRecordingId: state.lastRecordingId ?? null,
    lastRoundSavedAt: state.lastRoundSavedAt ?? null,
    lastCompletedRound: lastCompletedRound
      ? {
          recordingId: lastCompletedRound.recordingId ?? null,
          roundIndex: lastCompletedRound.roundIndex ?? null,
          competitionRound: lastCompletedRound.competitionRound ?? null,
          competitionOverallIndex: lastCompletedRound.competitionOverallIndex ?? null,
          predictionCaptured: Boolean(lastCompletedRound.predictionCaptured),
          saveSuccess: Boolean(lastCompletedRound.saveSuccess),
          path: lastCompletedRound.path ?? null,
          locationId: lastCompletedRound.locationId ?? null,
        }
      : null,
    pageProbe: state.pageProbe
      ? {
          at: state.pageProbe.at ?? null,
          pageState: state.pageProbe.pageState ?? null,
          roundLikelyActive: Boolean(state.pageProbe.roundLikelyActive),
          roundNumber: state.pageProbe.roundNumber ?? null,
          roundTotal: state.pageProbe.roundTotal ?? null,
          modeHint: state.pageProbe.modeHint ?? null,
          hasStreetViewCoordinate: isCoordinate(state.pageProbe.primaryView),
          streetViewCandidateCount:
            state.pageProbe.diagnostics?.streetViewCandidateCount ?? 0,
        }
      : null,
    lastSave: state.lastSave ?? null,
    lastCheckpoint: state.lastCheckpoint ?? null,
    lastDiagnosticsExport: state.lastDiagnosticsExport ?? null,
    lastManualAction: state.lastManualAction ?? null,
    lastProbeError: state.lastProbeError ?? null,
    recoveryBackedUpAt: state.recoveryBackedUpAt ?? null,
    recoveryBackupError: state.recoveryBackupError ?? null,
    lastSessionSave: state.lastSessionSave ?? null,
    updatedAt: state.updatedAt,
  };
}

function addDiagnostic(round, name, details = {}) {
  round.diagnostics.events.push({
    name,
    at: new Date().toISOString(),
    details: sanitizeDiagnostic(details),
  });
  if (round.diagnostics.events.length > 200) {
    round.diagnostics.events.splice(0, round.diagnostics.events.length - 200);
  }
}

function sanitizeDiagnostic(value) {
  if (!value || typeof value !== "object") return {};
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("key")) {
      continue;
    }
    if (["string", "number", "boolean"].includes(typeof item) || item === null) {
      copy[key] = typeof item === "string" ? item.slice(0, 500) : item;
    } else if (key === "spawnRequested" && isCoordinate(item)) {
      copy[key] = normalizeCameraPoint(item);
    }
  }
  return copy;
}

function normalizeCameraPoint(value) {
  if (!isCoordinate(value)) return null;
  return {
    lat: Number(value.lat),
    lng: Number(value.lng),
    heading: finiteOrNull(value.heading),
    pitch: finiteOrNull(value.pitch),
    zoom: finiteOrNull(value.zoom),
    fov: finiteOrNull(value.fov),
    panoId: value.panoId ? String(value.panoId) : null,
  };
}

function isCoordinate(value) {
  if (value?.lat === null || value?.lat === "" || value?.lat === undefined) return false;
  if (value?.lng === null || value?.lng === "" || value?.lng === undefined) return false;
  return (
    Number.isFinite(Number(value.lat)) &&
    Number(value.lat) >= -90 &&
    Number(value.lat) <= 90 &&
    Number.isFinite(Number(value.lng)) &&
    Number(value.lng) >= -180 &&
    Number(value.lng) <= 180
  );
}

function finiteOrNull(value) {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) ? number : null;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function stringOrNull(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function parseTime(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function eventPredatesRound(round, payload, keys = ["at", "detectedAt"]) {
  if (!round || !Number.isFinite(round.startedAtMs)) return false;
  for (const key of keys) {
    const eventAtMs = parseTime(payload?.[key]);
    if (Number.isFinite(eventAtMs)) {
      return eventAtMs < round.startedAtMs;
    }
  }
  return false;
}

function distanceMeters(a, b) {
  if (!isCoordinate(a) || !isCoordinate(b)) return Infinity;
  const radius = 6371008.8;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(Number(b.lat) - Number(a.lat));
  const dLng = toRadians(Number(b.lng) - Number(a.lng));
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function angularDifference(a, b) {
  const aFinite = Number.isFinite(a);
  const bFinite = Number.isFinite(b);
  if (!aFinite && !bFinite) return 0;
  if (!aFinite || !bFinite) return Infinity;
  return Math.abs(((b - a + 540) % 360) - 180);
}

function absoluteDifference(a, b) {
  const aFinite = Number.isFinite(a);
  const bFinite = Number.isFinite(b);
  if (!aFinite && !bFinite) return 0;
  if (!aFinite || !bFinite) return Infinity;
  return Math.abs(b - a);
}

function canStartNewRoundFromGoogle(state, sample) {
  if (!state.awaitingNewFrame) return true;
  if (!isCoordinate(sample)) return false;

  const eventAtMs =
    parseTime(sample.capturedAt) ?? parseTime(sample.at) ?? Date.now();
  const lastFinishedAtMs = parseTime(state.lastFinishedAt);
  if (Number.isFinite(lastFinishedAtMs) && eventAtMs <= lastFinishedAtMs) {
    return false;
  }

  const advanceAtMs = parseTime(state.advanceIntentAt);
  const probeAtMs = parseTime(state.pageProbe?.at);
  const resultClearedAfterFinish =
    Number.isFinite(lastFinishedAtMs) &&
    Number.isFinite(probeAtMs) &&
    probeAtMs > lastFinishedAtMs &&
    !state.pageProbe?.resultVisible &&
    state.pageProbe?.pageState !== "result";
  const continueConfirmed =
    Number.isFinite(advanceAtMs) &&
    (!Number.isFinite(lastFinishedAtMs) || advanceAtMs >= lastFinishedAtMs) &&
    eventAtMs >= advanceAtMs;

  // Do not let camera events emitted by the still-visible result panorama create
  // a new round. We need either the actual Continue intent or a DOM probe that
  // proves the result screen has cleared.
  if (!continueConfirmed && !resultClearedAfterFinish) return false;

  const moved =
    isCoordinate(state.lastFinishedCoordinate) &&
    distanceMeters(state.lastFinishedCoordinate, sample) >= 20;
  const panoChanged = Boolean(
    sample.panoId &&
      state.lastFinishedPanoId &&
      sample.panoId !== state.lastFinishedPanoId
  );
  const frameChanged = Boolean(
    sample.frameInstanceId &&
      state.lastFinishedFrameInstanceId &&
      sample.frameInstanceId !== state.lastFinishedFrameInstanceId
  );

  // A pure POV/zoom update from the old result panorama is not a new round.
  return moved || panoChanged || frameChanged;
}

function buildRoundSignal(round) {
  const spawn = round.spawnRequested;
  return `${round.frameInstanceId}|${spawn?.lat ?? "none"},${
    spawn?.lng ?? "none"
  }|${spawn?.panoId ?? "none"}`;
}

function buildFallbackFilename(recording, settings) {
  const competition = safeFilenamePart(recording.competitionId, "unassigned");
  const model = safeFilenamePart(recording.model, "unknown-model");
  const condition = safeFilenamePart(recording.condition, "unknown-condition");
  const started = safeIsoForId(recording.startedAt);
  const filename = `${started}__${model}__${condition}__${recording.id}.json`;
  return `${settings.downloadSubfolder}/${competition}/${filename}`;
}

function safeFilenamePart(value, fallback) {
  const result = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return result || fallback;
}

function safeIsoForId(value) {
  const date = new Date(value);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replaceAll(":", "-").replaceAll(".", "-");
}

function randomId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
