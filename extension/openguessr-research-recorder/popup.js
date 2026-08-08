const elements = {
  form: document.querySelector("#settings-form"),
  enabled: document.querySelector("#enabled"),
  competitionId: document.querySelector("#competition-id"),
  competitionOptions: document.querySelector("#competition-options"),
  model: document.querySelector("#model"),
  condition: document.querySelector("#condition"),
  collectorUrl: document.querySelector("#collector-url"),
  downloadSubfolder: document.querySelector("#download-subfolder"),
  fallbackDownload: document.querySelector("#fallback-download"),
  testCollector: document.querySelector("#test-collector"),
  armRecording: document.querySelector("#arm-recording"),
  stopRecording: document.querySelector("#stop-recording"),
  saveCheckpoint: document.querySelector("#save-checkpoint"),
  exportDiagnostics: document.querySelector("#export-diagnostics"),
  finalizeRound: document.querySelector("#finalize-round"),
  resetSession: document.querySelector("#reset-session"),
  statusDot: document.querySelector("#status-dot"),
  statusTitle: document.querySelector("#status-title"),
  statusDetail: document.querySelector("#status-detail"),
  sessionProgress: document.querySelector("#session-progress"),
  predictionState: document.querySelector("#prediction-state"),
  captureMode: document.querySelector("#capture-mode"),
  pageState: document.querySelector("#page-state"),
  lastSave: document.querySelector("#last-save"),
};

init().catch(showError);

async function init() {
  const response = await send({ type: "OGRR_GET_STATUS" });
  applySettings(response.settings);
  renderStatus(response.status);
  void refreshCollector();

  elements.form.addEventListener("submit", saveForm);
  elements.enabled.addEventListener("change", saveForm);
  elements.testCollector.addEventListener("click", refreshCollector);
  elements.armRecording.addEventListener("click", () => runAction(
    elements.armRecording,
    "Arming…",
    {
      type: "OGRR_ARM_ACTIVE",
      setup: {
        competitionId: elements.competitionId.value,
        model: elements.model.value,
        condition: elements.condition.value,
      },
    },
    (result) => {
      renderStatus(result.status);
      elements.statusDetail.textContent = "Recorder armed. Start the OpenGuessr competition when ready.";
    },
  ));
  elements.stopRecording.addEventListener("click", () => runAction(
    elements.stopRecording,
    "Stopping…",
    { type: "OGRR_STOP_ACTIVE" },
    (result) => {
      renderStatus(result.status);
      elements.statusDetail.textContent = "Recorder stopped. It will not start again until explicitly armed.";
    },
  ));
  elements.saveCheckpoint.addEventListener("click", () => runAction(
    elements.saveCheckpoint,
    "Saving…",
    { type: "OGRR_SAVE_CHECKPOINT" },
    (result) => {
      const checkpoint = result.checkpoint;
      elements.statusDetail.textContent = checkpoint?.success
        ? `Live state saved${checkpoint.path ? ` to ${checkpoint.path}` : "."}`
        : checkpoint?.error ?? "Checkpoint could not be saved.";
    },
  ));
  elements.exportDiagnostics.addEventListener("click", () => runAction(
    elements.exportDiagnostics,
    "Exporting…",
    { type: "OGRR_EXPORT_DIAGNOSTICS" },
    (result) => {
      elements.statusDetail.textContent = result.diagnostics?.success
        ? "Diagnostics JSON downloaded."
        : result.diagnostics?.error ?? "Diagnostics export failed.";
    },
  ));
  elements.finalizeRound.addEventListener("click", () => runAction(
    elements.finalizeRound,
    "Finalizing…",
    { type: "OGRR_FINALIZE_ACTIVE" },
    (result) => {
      const action = result.status?.lastManualAction;
      if (action?.message) elements.statusDetail.textContent = action.message;
    },
  ));
  elements.resetSession.addEventListener("click", () => runAction(
    elements.resetSession,
    "Resetting…",
    { type: "OGRR_RESET_ACTIVE" },
    () => {
      elements.statusDetail.textContent = "Tab session reset.";
    },
  ));

  setInterval(async () => {
    try {
      const current = await send({ type: "OGRR_GET_STATUS" });
      renderStatus(current.status);
    } catch {
      // A service worker restart is normally resolved by the next poll.
    }
  }, 1000);
}

async function runAction(button, busyLabel, message, after) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    const result = await send(message);
    renderStatus(result.status);
    after?.(result);
  } catch (error) {
    showError(error);
  } finally {
    button.textContent = original;
    button.disabled = false;
  }
}

async function saveForm(event) {
  event?.preventDefault?.();
  const settings = {
    enabled: elements.enabled.checked,
    competitionId: elements.competitionId.value,
    model: elements.model.value,
    condition: elements.condition.value,
    collectorUrl: elements.collectorUrl.value,
    downloadSubfolder: elements.downloadSubfolder.value,
    fallbackDownload: elements.fallbackDownload.checked,
  };
  const response = await send({ type: "OGRR_SAVE_SETTINGS", settings });
  applySettings(response.settings);
  elements.statusDetail.textContent = "Recorder setup saved.";
}

async function refreshCollector() {
  elements.testCollector.disabled = true;
  elements.testCollector.textContent = "Checking…";
  try {
    const response = await send({ type: "OGRR_TEST_COLLECTOR" });
    const collector = response.collector;
    populateCompetitions(collector?.competitions ?? []);
    if (collector?.connected) {
      elements.testCollector.textContent = "Collector connected";
      elements.statusDetail.textContent = `Local collector ready (${collector.locations ?? 0} locations).`;
    } else {
      elements.testCollector.textContent = "Collector unavailable";
      elements.statusDetail.textContent = collector?.error ?? "Start the repository with npm start.";
    }
  } catch (error) {
    elements.testCollector.textContent = "Collector unavailable";
    showError(error);
  } finally {
    setTimeout(() => {
      elements.testCollector.disabled = false;
      elements.testCollector.textContent = "Test collector";
    }, 1200);
  }
}

function applySettings(settings) {
  elements.enabled.checked = settings.enabled;
  elements.competitionId.value = settings.competitionId;
  elements.model.value = settings.model;
  elements.condition.value = settings.condition;
  elements.collectorUrl.value = settings.collectorUrl;
  elements.downloadSubfolder.value = settings.downloadSubfolder;
  elements.fallbackDownload.checked = settings.fallbackDownload;
}

function renderStatus(status) {
  elements.statusDot.className = "status-dot";
  if (!status) {
    elements.statusTitle.textContent = "No active browser tab";
    elements.statusDetail.textContent = "Open an OpenGuessr tab.";
    setReadouts("—", "—", "—", "—", "—");
    elements.finalizeRound.disabled = true;
    elements.saveCheckpoint.disabled = true;
    elements.exportDiagnostics.disabled = true;
    elements.armRecording.disabled = true;
    elements.stopRecording.disabled = true;
    return;
  }

  elements.saveCheckpoint.disabled = false;
  elements.exportDiagnostics.disabled = false;
  elements.armRecording.disabled = Boolean(status.recordingArmed || status.currentRound);
  elements.stopRecording.disabled = !status.recordingArmed && !status.currentRound;
  const completed = status.session?.completedRoundCount ?? 0;
  const expected = status.session?.expectedRoundCount;
  elements.sessionProgress.textContent = Number.isInteger(expected)
    ? `${completed}/${expected}`
    : status.session
      ? String(completed)
      : status.recordingArmed
        ? "Armed"
        : "Idle";

  const probe = status.pageProbe;
  elements.pageState.textContent = probe
    ? `${probe.pageState ?? "unknown"}${probe.roundNumber ? ` · R${probe.roundNumber}` : ""}`
    : "No signal";

  if (status.currentRound) {
    const roundNumber = status.currentRound.pageRoundNumber ?? status.currentRound.index + 1;
    const nmpz = status.currentRound.captureMode === "nmpz";
    elements.statusDot.classList.add("live");
    elements.statusTitle.textContent = `Recording round ${roundNumber}`;
    elements.statusDetail.textContent = status.currentRound.predictionCaptured
      ? "Prediction captured; the round will be saved automatically."
      : nmpz
        ? "NMPZ/static view detected. Fixed view, timing, round state, and guess events are being recorded."
        : status.currentRound.provisional
          ? "Round detected from the OpenGuessr page; waiting for Street View coordinates."
          : "Camera, movement, zoom, and panorama events are being recorded.";
    elements.predictionState.textContent = status.currentRound.predictionCaptured
      ? "Captured"
      : "Waiting";
    elements.captureMode.textContent = formatCaptureMode(status.currentRound.captureMode);
    elements.finalizeRound.disabled = false;
  } else if (status.session?.status === "complete") {
    elements.statusDot.classList.add("live");
    elements.statusTitle.textContent = "Competition captured";
    elements.statusDetail.textContent = "All expected rounds were saved as separate JSON files.";
    elements.predictionState.textContent = "—";
    elements.captureMode.textContent = formatCaptureMode(probe?.modeHint);
    elements.finalizeRound.disabled = true;
  } else if (status.recordingArmed && probe?.roundLikelyActive) {
    elements.statusDot.classList.add("warn");
    elements.statusTitle.textContent = "Round visible — capture recovering";
    elements.statusDetail.textContent = "Use Save checkpoint now. The page fallback is trying to create the round even without a movable Street View frame.";
    elements.predictionState.textContent = "Waiting";
    elements.captureMode.textContent = formatCaptureMode(probe.modeHint);
    elements.finalizeRound.disabled = false;
  } else if (status.recordingArmed && status.awaitingNewFrame) {
    elements.statusDot.classList.add("warn");
    elements.statusTitle.textContent = "Round saved automatically";
    elements.statusDetail.textContent = "Waiting for the next location; no manual start is needed.";
    elements.predictionState.textContent = "—";
    elements.captureMode.textContent = formatCaptureMode(probe?.modeHint);
    elements.finalizeRound.disabled = true;
  } else if (status.recordingArmed) {
    elements.statusDot.classList.add("warn");
    elements.statusTitle.textContent = "Recorder armed";
    elements.statusDetail.textContent = "Waiting for the first live round. Lobby pages and competition lists are not recorded.";
    elements.predictionState.textContent = "—";
    elements.captureMode.textContent = formatCaptureMode(probe?.modeHint);
    elements.finalizeRound.disabled = true;
  } else {
    elements.statusTitle.textContent = "Idle — not recording";
    elements.statusDetail.textContent = "Open a competition. When its start dialog appears, the recorder will ask whether you want to arm it.";
    elements.predictionState.textContent = "—";
    elements.captureMode.textContent = "—";
    elements.finalizeRound.disabled = true;
  }

  if (status.lastSave) {
    const method = status.lastSave.method === "collector" ? "Repository" : "Download";
    elements.lastSave.textContent = status.lastSave.success ? method : "Failed";
    if (!status.lastSave.success) elements.statusDot.classList.add("error");
  } else if (status.lastCheckpoint) {
    elements.lastSave.textContent = status.lastCheckpoint.success ? "Checkpoint" : "Checkpoint failed";
  } else {
    elements.lastSave.textContent = "None";
  }

  if (status.lastProbeError && !status.pageProbe) {
    elements.statusDot.classList.add("warn");
  }
}

function setReadouts(session, prediction, capture, page, lastSave) {
  elements.sessionProgress.textContent = session;
  elements.predictionState.textContent = prediction;
  elements.captureMode.textContent = capture;
  elements.pageState.textContent = page;
  elements.lastSave.textContent = lastSave;
}

function formatCaptureMode(value) {
  if (value === "nmpz") return "NMPZ";
  if (value === "interactive" || value === "streetview") return "Interactive";
  if (value === "static") return "Static";
  return "—";
}

function populateCompetitions(competitions) {
  elements.competitionOptions.replaceChildren();
  for (const competition of competitions) {
    const option = document.createElement("option");
    option.value = competition.id;
    option.label = `${competition.shortName ?? competition.name} (${competition.count})`;
    elements.competitionOptions.append(option);
  }
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? "Extension request failed.");
  return response;
}

function showError(error) {
  elements.statusDot.className = "status-dot error";
  elements.statusTitle.textContent = "Recorder error";
  elements.statusDetail.textContent = error instanceof Error ? error.message : String(error);
}
