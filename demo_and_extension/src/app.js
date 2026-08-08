import { normalizeCases, upsertCase as mergeCase } from "./data-contract.js";
import {
  explorationDistanceKm,
  nearestSampleIndex,
  normalizeExploration,
  sampleToStreetView,
} from "./exploration.js";
import {
  buildStreetViewUrl,
  errorBand,
  formatCoordinate,
  formatDistance,
} from "./geo.js";
import { createMapController } from "./map-controller.js";

const CONDITION_LABELS = {
  "static-image": "Static image",
  "interactive-panorama": "Interactive panorama",
};

const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8];

export function createExplorer({
  root,
  cases,
  initialCaseId,
  initialRunId,
  mapOptions,
  syncHash = true,
} = {}) {
  const rootElement = resolveRoot(root);
  let data = normalizeCases(cases);
  let destroyed = false;
  let query = "";
  let filters = { competition: "", country: "", difficulty: "", sceneType: "" };
  let lastSelectionSignature = "";
  let drawerMode = null;
  let drawerSample = null;
  let drawerCaseId = null;
  let drawerRunId = null;
  let drawerSeekMs = 0;
  let playbackIndex = 0;
  let playbackTimeMs = 0;
  let playbackSpeed = 1;
  let playbackPlaying = false;
  let playbackFrame = 0;
  let playbackLastTick = 0;

  const hashSelection = syncHash ? readSelectionFromHash() : {};
  let selectedCaseId = initialCaseId ?? hashSelection.caseId ?? null;
  let selectedModel = hashSelection.model ?? null;
  let selectedCondition = hashSelection.condition ?? null;

  if (selectedCaseId && !data.some((item) => item.id === selectedCaseId)) {
    selectedCaseId = null;
  }

  if (initialRunId && selectedCaseId) {
    const initialCase = data.find((item) => item.id === selectedCaseId);
    const initialRun = initialCase?.runs.find((run) => run.id === initialRunId);
    if (initialRun) {
      selectedModel = initialRun.model;
      selectedCondition = initialRun.condition;
    }
  }

  rootElement.classList.add("geo-evidence-atlas-host");
  rootElement.innerHTML = shellMarkup();

  const elements = collectElements(rootElement);
  const mapController = createMapController(elements.map, {
    ...mapOptions,
    onCaseSelect(caseId) {
      selectedCaseId = caseId;
      if (!["stats", "truth", "prediction", "playback"].includes(drawerMode)) {
        clearDrawerState();
      }
      render({ fitMap: true, focusActiveCard: true });
    },
    onMarkerSelect(kind, detail) {
      if (detail?.caseId && data.some((item) => item.id === detail.caseId)) {
        selectedCaseId = detail.caseId;
      }
      if (detail?.runId) {
        const caseItem = getSelectedCase();
        const run = caseItem?.runs.find((item) => item.id === detail.runId);
        if (run) {
          selectedModel = run.model;
          selectedCondition = run.condition;
        }
      }
      drawerMode = kind === "playback" ? "playback" : kind;
      drawerSample = detail?.sample ?? null;
      drawerCaseId = detail?.caseId ?? selectedCaseId ?? drawerCaseId;
      drawerRunId = detail?.runId ?? null;
      render({ fitMap: false });
    },
  });
  const disposers = [];

  const api = {
    setCases(nextCases) {
      assertAlive();
      stopPlayback();
      data = normalizeCases(nextCases);
      if (selectedCaseId && !data.some((item) => item.id === selectedCaseId)) {
        selectedCaseId = null;
      }
      clearDrawerState();
      renderFilterOptions();
      render({ announceData: true, fitMap: true });
      return api;
    },

    upsertCase(nextCase) {
      assertAlive();
      stopPlayback();
      data = mergeCase(data, nextCase);
      selectedCaseId = nextCase.id;
      clearDrawerState();
      renderFilterOptions();
      render({ announceData: true, focusActiveCard: true, fitMap: true });
      return api;
    },

    selectCase(caseId) {
      assertAlive();
      if (caseId === null || caseId === "all") {
        enterOverview();
        render({ fitMap: true });
        return api;
      }
      if (!data.some((item) => item.id === caseId)) {
        throw new RangeError(`Unknown case id: ${caseId}`);
      }
      selectedCaseId = caseId;
      if (!["stats", "truth", "prediction", "playback"].includes(drawerMode)) {
        clearDrawerState();
      }
      render({ focusActiveCard: true, fitMap: true });
      return api;
    },

    selectRun(runId) {
      assertAlive();
      const caseItem = getSelectedCase();
      if (!caseItem) throw new Error("Select a location before selecting a run.");
      const run = caseItem.runs.find((item) => item.id === runId);
      if (!run) {
        throw new RangeError(`Unknown run id for ${caseItem.id}: ${runId}`);
      }
      selectedModel = run.model;
      selectedCondition = run.condition;
      drawerSample = null;
      render({ fitMap: true });
      return api;
    },

    select({ caseId, model, condition, runId } = {}) {
      assertAlive();
      if (caseId !== undefined) {
        if (caseId === null || caseId === "all") {
          enterOverview();
        } else if (!data.some((item) => item.id === caseId)) {
          throw new RangeError(`Unknown case id: ${caseId}`);
        } else {
          selectedCaseId = caseId;
        }
      }

      if (runId !== undefined) {
        const caseItem = getSelectedCase();
        const run = caseItem?.runs.find((item) => item.id === runId);
        if (!run) throw new RangeError(`Unknown run id: ${runId}`);
        selectedModel = run.model;
        selectedCondition = run.condition;
      } else {
        if (model !== undefined) selectedModel = model;
        if (condition !== undefined) selectedCondition = condition;
      }

      drawerSample = null;
      render({ fitMap: true });
      return api;
    },

    attachExploration({ caseId = selectedCaseId, runId, recorder } = {}) {
      assertAlive();
      if (!caseId) throw new Error("A caseId is required to attach exploration data.");
      const caseItem = data.find((item) => item.id === caseId);
      if (!caseItem) throw new RangeError(`Unknown case id: ${caseId}`);
      const run = runId
        ? caseItem.runs.find((item) => item.id === runId)
        : getSelectedRun(caseItem);
      if (!run) throw new RangeError(`Unknown run id: ${runId}`);

      const exploration = normalizeExploration(recorder);
      if (!exploration) {
        throw new TypeError("Recorder JSON contains no valid movement or camera samples.");
      }
      run.exploration = exploration;
      selectedCaseId = caseItem.id;
      selectedModel = run.model;
      selectedCondition = run.condition;
      drawerMode = "playback";
      drawerSample = exploration.samples[0] ?? null;
      playbackIndex = 0;
      playbackTimeMs = drawerSample?.tMs ?? 0;
      render({ fitMap: true });
      return api;
    },

    getState() {
      assertAlive();
      const filteredCases = getFilteredCases();
      ensureRunControlState(getSelectedCase(), filteredCases);
      const caseItem = getSelectedCase();
      const run = caseItem ? getSelectedRun(caseItem) : null;
      return {
        caseId: caseItem?.id ?? null,
        runId: run?.id ?? null,
        model: run?.model ?? selectedModel,
        condition: run?.condition ?? selectedCondition,
        query,
        filters: { ...filters },
        caseCount: data.length,
        visibleCaseCount: getStatsCases(caseItem, filteredCases).length,
        errorKm: run?.errorKm ?? null,
        drawer: drawerMode,
        playbackIndex: run?.exploration?.samples?.length ? playbackIndex : null,
      };
    },

    getCases() {
      assertAlive();
      return structuredCloneSafe(data);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopPlayback();
      for (const dispose of disposers) dispose();
      mapController.destroy();
      delete rootElement.geoEvidenceAtlas;
      rootElement.classList.remove("geo-evidence-atlas-host");
      rootElement.replaceChildren();
    },
  };

  rootElement.geoEvidenceAtlas = api;

  bindEvents();
  renderFilterOptions();
  render({ fitMap: true });

  queueMicrotask(() => {
    rootElement.dispatchEvent(
      new CustomEvent("geoatlas:ready", {
        bubbles: true,
        detail: { api, caseCount: data.length },
      }),
    );
  });

  return api;

  function bindEvents() {
    const onClick = (event) => {
      const overviewButton = event.target.closest("[data-overview]");
      if (overviewButton && rootElement.contains(overviewButton)) {
        enterOverview();
        render({ fitMap: true });
        return;
      }

      const caseButton = event.target.closest("[data-case-id]");
      if (caseButton && rootElement.contains(caseButton)) {
        selectedCaseId = caseButton.dataset.caseId;
        if (!["stats", "truth", "prediction", "playback"].includes(drawerMode)) {
          clearDrawerState();
        }
        render({ focusActiveCard: true, fitMap: true });
        return;
      }

      const resetButton = event.target.closest("[data-reset-map]");
      if (resetButton && rootElement.contains(resetButton)) {
        mapController.resetView();
        return;
      }

      const clearButton = event.target.closest("[data-clear-filters]");
      if (clearButton && rootElement.contains(clearButton)) {
        query = "";
        filters = { competition: "", country: "", difficulty: "", sceneType: "" };
        elements.search.value = "";
        renderFilterOptions();
        render({ updateHash: false, fitMap: true });
        return;
      }

      const statsButton = event.target.closest("[data-stats-button]");
      if (statsButton && rootElement.contains(statsButton)) {
        drawerMode = "stats";
        drawerSample = null;
        render({ fitMap: false });
        return;
      }

      const closeDrawerButton = event.target.closest("[data-close-drawer]");
      if (closeDrawerButton && rootElement.contains(closeDrawerButton)) {
        clearDrawerState();
        renderDrawer(getSelectedCase(), getSelectedCase() ? getSelectedRun(getSelectedCase()) : null, getFilteredCases());
        return;
      }

      const openCurrentViewButton = event.target.closest("[data-open-current-view]");
      if (openCurrentViewButton && rootElement.contains(openCurrentViewButton)) {
        const caseItem = getSelectedCase();
        const run = caseItem ? getSelectedRun(caseItem) : null;
        const sample = run?.exploration?.samples?.[playbackIndex] ?? null;
        const frame = run?.exploration && sample ? playbackFrameForSample(run.exploration, sample) : null;
        const capturedImageUrl = assetImageUrl(frame?.image);
        const roundVideoUrl = assetVideoUrl(run?.exploration?.video);
        if (roundVideoUrl && !capturedImageUrl) {
          event.preventDefault();
          drawerMode = "playback";
          drawerSample = sample;
          drawerSeekMs = Number.isFinite(playbackTimeMs)
            ? playbackTimeMs
            : sample?.tMs ?? 0;
          drawerCaseId = caseItem?.id ?? null;
          drawerRunId = run?.id ?? null;
          render({ fitMap: false });
          return;
        }
      }

      const momentButton = event.target.closest("[data-moment-index]");
      if (momentButton && rootElement.contains(momentButton)) {
        const index = Number(momentButton.dataset.momentIndex);
        const momentTimeMs = Number(momentButton.dataset.momentTimeMs);

        if (Number.isInteger(index)) {
          const caseItem = getSelectedCase();
          const run = caseItem ? getSelectedRun(caseItem) : null;

          // Open the playback sidebar automatically.
          drawerMode = "playback";
          drawerCaseId = caseItem?.id ?? null;
          drawerRunId = run?.id ?? null;

          // Jump both timeline and video to the exact semantic keypoint.
          setPlaybackIndex(index, {
            keepPlaying: false,
            exactTimeMs: Number.isFinite(momentTimeMs)
              ? momentTimeMs
              : null,
          });
        }

        return;
      }
    };

    const onSearch = (event) => {
      query = event.target.value.trim().toLocaleLowerCase();
      if (selectedCaseId && !getFilteredCases().some((item) => item.id === selectedCaseId)) {
        enterOverview();
      }
      render({ updateHash: false, fitMap: true });
    };

    const onFilterChange = () => {
      filters = {
        competition: elements.competitionFilter.value,
        country: elements.countryFilter.value,
        difficulty: elements.difficultyFilter.value,
        sceneType: elements.sceneFilter.value,
      };
      if (selectedCaseId && !getFilteredCases().some((item) => item.id === selectedCaseId)) {
        enterOverview();
      }
      render({ updateHash: false, fitMap: true });
    };

    const onModelChange = (event) => {
      selectedModel = event.target.value || null;
      drawerSample = null;
      render({ fitMap: true });
    };

    const onConditionChange = (event) => {
      selectedCondition = event.target.value || null;
      drawerSample = null;
      render({ fitMap: true });
    };

    const onPlayToggle = () => {
      if (playbackPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
      renderPlaybackView();
    };

    const onTimelineInput = (event) => {
      const index = Number(event.target.value);
      if (Number.isInteger(index)) {
        setPlaybackIndex(index, { keepPlaying: playbackPlaying });
      }
    };

    const onSpeedChange = (event) => {
      playbackSpeed = Number(event.target.value) || 1;
      renderPlaybackView();
    };

    const onHashChange = () => {
      if (!syncHash) return;
      const selection = readSelectionFromHash();
      selectedCaseId =
        selection.caseId && data.some((item) => item.id === selection.caseId)
          ? selection.caseId
          : null;
      if (selection.model) selectedModel = selection.model;
      if (selection.condition) selectedCondition = selection.condition;
      clearDrawerState();
      render({ updateHash: false, fitMap: true });
    };

    rootElement.addEventListener("click", onClick);
    elements.search.addEventListener("input", onSearch);
    elements.competitionFilter.addEventListener("change", onFilterChange);
    elements.countryFilter.addEventListener("change", onFilterChange);
    elements.difficultyFilter.addEventListener("change", onFilterChange);
    elements.sceneFilter.addEventListener("change", onFilterChange);
    elements.modelSelect.addEventListener("change", onModelChange);
    elements.conditionSelect.addEventListener("change", onConditionChange);
    elements.playToggle.addEventListener("click", onPlayToggle);
    elements.timeline.addEventListener("input", onTimelineInput);
    elements.speedSelect.addEventListener("change", onSpeedChange);
    window.addEventListener("hashchange", onHashChange);

    disposers.push(() => rootElement.removeEventListener("click", onClick));
    disposers.push(() => elements.search.removeEventListener("input", onSearch));
    disposers.push(() => elements.competitionFilter.removeEventListener("change", onFilterChange));
    disposers.push(() => elements.countryFilter.removeEventListener("change", onFilterChange));
    disposers.push(() => elements.difficultyFilter.removeEventListener("change", onFilterChange));
    disposers.push(() => elements.sceneFilter.removeEventListener("change", onFilterChange));
    disposers.push(() => elements.modelSelect.removeEventListener("change", onModelChange));
    disposers.push(() => elements.conditionSelect.removeEventListener("change", onConditionChange));
    disposers.push(() => elements.playToggle.removeEventListener("click", onPlayToggle));
    disposers.push(() => elements.timeline.removeEventListener("input", onTimelineInput));
    disposers.push(() => elements.speedSelect.removeEventListener("change", onSpeedChange));
    disposers.push(() => window.removeEventListener("hashchange", onHashChange));
  }

  function render({
    updateHash = true,
    fitMap = false,
    focusActiveCard = false,
    announceData = false,
  } = {}) {
    assertAlive();

    const filteredCases = getFilteredCases();
    const caseItem = getSelectedCase();
    ensureRunControlState(caseItem, filteredCases);
    const run = caseItem ? getSelectedRun(caseItem) : null;

    resetPlaybackIfSelectionChanged(caseItem, run);
    renderLocationList(filteredCases);
    renderRunControls(caseItem, run, filteredCases);
    renderMapHeader(caseItem, run, filteredCases);
    renderComparison(caseItem, run);
    renderExplorationPlayer(caseItem, run);
    renderDrawer(caseItem, run, getStatsCases(caseItem, filteredCases));

    const mapCases = caseItem
      ? [caseItem]
      : getOverviewMapCases(filteredCases);

    mapController.update(
      {
        cases: mapCases,
        caseItem,
        run,
        overview: !caseItem,
        playback: getPlaybackDescriptor(run),
      },
      { fit: fitMap },
    );

    if (syncHash && updateHash) {
      writeSelectionToHash(caseItem, run);
    }

    const signature = caseItem && run ? `${caseItem.id}:${run.id}` : "overview";
    if (signature !== lastSelectionSignature) {
      lastSelectionSignature = signature;
      rootElement.dispatchEvent(
        new CustomEvent("geoatlas:selectionchange", {
          bubbles: true,
          detail: {
            caseId: caseItem?.id ?? null,
            runId: run?.id ?? null,
            model: run?.model ?? selectedModel,
            condition: run?.condition ?? selectedCondition,
            errorKm: run?.errorKm ?? null,
          },
        }),
      );
    }

    if (announceData) {
      rootElement.dispatchEvent(
        new CustomEvent("geoatlas:datachange", {
          bubbles: true,
          detail: { caseCount: data.length },
        }),
      );
    }

    if (focusActiveCard && selectedCaseId) {
      window.requestAnimationFrame(() => {
        elements.locationList
          .querySelector(`[data-case-id="${cssEscape(selectedCaseId)}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  function renderFilterOptions() {
    const competitions = uniqueBy(
      data.flatMap((item) => item.competitions ?? []),
      (item) => item.competitionId,
    ).sort(
      (a, b) =>
        (a.competitionOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.competitionOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.competitionName.localeCompare(b.competitionName),
    );

    setSelectOptions(
      elements.competitionFilter,
      competitions.map((item) => item.competitionId),
      "All competitions",
      filters.competition,
      (value) => competitions.find((item) => item.competitionId === value)?.competitionName ?? value,
    );
    setSelectOptions(
      elements.countryFilter,
      unique(data.map((item) => item.country)).sort(),
      "All countries",
      filters.country,
    );
    setSelectOptions(
      elements.difficultyFilter,
      ["easy", "medium", "hard"],
      "All difficulties",
      filters.difficulty,
      (value) => DIFFICULTY_LABELS[value] ?? value,
    );
    setSelectOptions(
      elements.sceneFilter,
      unique(data.map((item) => item.sceneType).filter(Boolean)).sort(),
      "All scene types",
      filters.sceneType,
    );
  }

  function renderLocationList(filteredCases) {
    elements.resultCount.textContent = `${filteredCases.length} / ${data.length}`;
    elements.overviewCount.textContent = String(filteredCases.length);
    elements.overviewButton.classList.toggle("is-active", selectedCaseId === null);
    elements.overviewButton.setAttribute("aria-pressed", String(selectedCaseId === null));

    if (filteredCases.length === 0) {
      elements.locationList.innerHTML = `
        <div class="empty-state">
          <strong>No matching locations</strong>
          <span>Change the search or filters.</span>
        </div>
      `;
      return;
    }

    elements.locationList.innerHTML = filteredCases
      .map((item) => locationCardMarkup(item))
      .join("");
  }

  function renderRunControls(caseItem, run, filteredCases) {
    const scope = getScopeRuns(caseItem, filteredCases);
    const models = unique(scope.map((item) => item.model));
    const conditions = unique(scope.map((item) => item.condition));

    const hasRuns = scope.length > 0;
    elements.modelSelect.disabled = !hasRuns;
    elements.conditionSelect.disabled = !hasRuns;

    if (!hasRuns) {
      elements.modelSelect.innerHTML = `<option value="">No runs yet</option>`;
      elements.conditionSelect.innerHTML = `<option value="">No runs yet</option>`;
      return;
    }

    elements.modelSelect.innerHTML = models
      .map(
        (model) =>
          `<option value="${escapeAttribute(model)}" ${model === (run?.model ?? selectedModel) ? "selected" : ""}>${escapeHtml(model)}</option>`,
      )
      .join("");

    elements.conditionSelect.innerHTML = conditions
      .map(
        (condition) =>
          `<option value="${escapeAttribute(condition)}" ${condition === (run?.condition ?? selectedCondition) ? "selected" : ""}>${escapeHtml(CONDITION_LABELS[condition] ?? condition)}</option>`,
      )
      .join("");
  }

  function renderMapHeader(caseItem, run, filteredCases) {
    if (!caseItem) {
      const competition = filteredCases
        .flatMap((item) => item.competitions ?? [])
        .find((membership) => membership.competitionId === filters.competition);
      elements.mapEyebrow.textContent = competition
        ? `Competition · ${competition.competitionId}`
        : "Location overview";
      const predictedCases = getOverviewMapCases(filteredCases);
      elements.mapTitle.textContent = competition?.competitionName ?? "European evaluation scenes";
      elements.mapSubtitle.textContent = `${predictedCases.length} predicted locations · ${filteredCases.length} matching dataset locations · select a pin or a location on the left`;
      elements.resetMapLabel.textContent = "Fit predictions";
      return;
    }

    const membership = preferredMembership(caseItem, filters.competition);
    const competitionLabel = membership
      ? `${membership.competitionName} · ${membership.partCount > 1 ? `Part ${membership.part}/${membership.partCount} · ` : ""}Round ${membership.round}`
      : "Unassigned competition";

    elements.mapEyebrow.textContent = `${competitionLabel} · ${DIFFICULTY_LABELS[caseItem.difficulty]} · ${humanizeLabel(caseItem.sceneType)}`;
    elements.mapTitle.textContent = `${caseItem.city}, ${caseItem.country}`;

    if (!run) {
      elements.mapSubtitle.textContent = `${caseItem.localId ?? caseItem.id} · no model result or completed recording imported yet`;
      elements.resetMapLabel.textContent = "Focus location";
      return;
    }

    if (!hasCoordinate(run.prediction)) {
      elements.mapSubtitle.textContent = `${run.model} · ${CONDITION_LABELS[run.condition]} · recording imported · prediction not captured`;
      elements.resetMapLabel.textContent = "Fit recording";
      return;
    }

    elements.mapSubtitle.textContent = `${run.model} · ${CONDITION_LABELS[run.condition]} · ${formatDistance(run.errorKm)} pin error`;
    elements.resetMapLabel.textContent = "Fit run";
  }

  function renderComparison(caseItem, run) {
    elements.comparison.hidden = !caseItem || !run;
    if (!caseItem || !run) return;

    const routeText = run.condition === "static-image"
      ? "Static / NMPZ · fixed view"
      : run.exploration?.path?.length > 1
        ? `${run.exploration.path.length} positions · ${formatDistance(explorationDistanceKm(run.exploration))}`
        : run.exploration?.samples?.length
          ? `${run.exploration.samples.length} camera observations`
          : "—";

    elements.truthLabel.textContent = caseItem.groundTruth.label;
    elements.predictionLabel.textContent = hasCoordinate(run.prediction)
      ? run.prediction.label || "Recorded prediction"
      : "Prediction not captured";
    elements.pinError.textContent = hasCoordinate(run.prediction)
      ? formatDistance(run.errorKm)
      : "—";
    elements.runTime.textContent = run.durationSeconds === null ? "—" : `${Math.round(run.durationSeconds)} s`;
    elements.routeMeta.textContent = routeText;
  }

  function renderExplorationPlayer(caseItem, run) {
    const samples = run?.exploration?.samples ?? [];
    const isStatic = run?.condition === "static-image";

    if (caseItem && run && isStatic) {
      stopPlayback();
      elements.explorationPlayer.hidden = true;
      mapController.setPlayback(null);
      return;
    }

    const hasPlayback = Boolean(caseItem && samples.length > 0);
    elements.explorationPlayer.hidden = !hasPlayback;
    if (!hasPlayback) {
      mapController.setPlayback(null);
      return;
    }

    playbackIndex = clamp(playbackIndex, 0, samples.length - 1);
    const sample = samples[playbackIndex];
    if (!Number.isFinite(playbackTimeMs)) playbackTimeMs = sample.tMs ?? 0;
    const durationMs = run.exploration.durationMs ?? samples.at(-1)?.tMs ?? 0;
    const capturedFrame = playbackFrameForSample(run.exploration, sample);
    const capturedImageUrl = assetImageUrl(capturedFrame?.image);
    const roundVideoUrl = assetVideoUrl(run.exploration?.video);
    const visualUrl = capturedImageUrl || roundVideoUrl;

    elements.playerEyebrow.textContent = "Interactive exploration";
    elements.playToggle.textContent = playbackPlaying ? "Pause" : "Play";
    elements.playToggle.setAttribute("aria-label", playbackPlaying ? "Pause exploration playback" : "Play exploration playback");
    elements.timeline.max = String(Math.max(0, samples.length - 1));
    elements.timeline.value = String(playbackIndex);
    elements.timeline.setAttribute("aria-valuetext", `${formatSeconds(playbackTimeMs)} of ${formatSeconds(durationMs)}`);
    elements.timeLabel.textContent = `${formatSeconds(playbackTimeMs)} / ${formatSeconds(durationMs)}`;
    elements.speedSelect.value = String(playbackSpeed);
    elements.openCurrentView.href = capturedImageUrl || roundVideoUrl || "#";
    elements.openCurrentView.textContent = capturedImageUrl
      ? "Open captured image ↗"
      : roundVideoUrl
        ? "Show round video in side panel"
        : "No visual recording";
    const hasVisualRecording = Boolean(capturedImageUrl || roundVideoUrl);
    elements.openCurrentView.toggleAttribute("aria-disabled", !hasVisualRecording);
    elements.openCurrentView.classList.toggle("is-disabled", !hasVisualRecording);
    if (roundVideoUrl && !capturedImageUrl) elements.openCurrentView.removeAttribute("target");

    elements.keyMoments.innerHTML = keyMomentMarkup(run.exploration.keyMoments ?? [], samples);
    elements.sampleReadout.innerHTML = sampleReadoutMarkup(sample, run.exploration, playbackIndex, capturedFrame);
  }

  function renderDrawer(caseItem, run, filteredCases) {
    if (caseItem && ["truth", "prediction"].includes(drawerMode)) {
      drawerCaseId = caseItem.id;
      drawerRunId = run?.id ?? null;
    }

    const detailCase =
      caseItem ??
      (drawerCaseId ? data.find((item) => item.id === drawerCaseId) ?? null : null);
    const detailRun = detailCase
      ? (drawerRunId ? detailCase.runs.find((item) => item.id === drawerRunId) : null) ??
      chooseRun(detailCase, selectedModel, selectedCondition)
      : null;
    const playbackAllowed = run?.condition !== "static-image";
    const valid =
      drawerMode === "stats" ||
      (drawerMode === "truth" && Boolean(detailCase)) ||
      (drawerMode === "prediction" && Boolean(detailCase && detailRun)) ||
      (caseItem && run && drawerMode === "playback" && playbackAllowed);
    const layoutWasOpen = elements.mapWorkspace.classList.contains("has-drawer");
    elements.drawer.hidden = !valid;
    elements.drawer.classList.toggle("is-open", Boolean(valid));
    elements.mapWorkspace.classList.toggle("has-drawer", Boolean(valid));
    if (layoutWasOpen !== Boolean(valid)) {
      window.requestAnimationFrame(() => mapController.invalidateSize());
    }
    if (!valid) return;

    let title = "Details";
    let body = "";

    if (drawerMode === "stats") {
      title = "Evaluation statistics";
      body = statsDrawerMarkup(filteredCases);
    } else if (drawerMode === "truth") {
      title = "Ground truth";
      body = truthDrawerMarkup(detailCase, detailRun);
    } else if (drawerMode === "prediction") {
      title = "Prediction and cue review";
      body = predictionDrawerMarkup(detailCase, detailRun);
    } else if (drawerMode === "playback") {
      title = "Playback sample";
      const sample = drawerSample ?? run.exploration?.samples?.[playbackIndex] ?? null;
      body = playbackDrawerMarkup(sample, run, drawerSeekMs);
    }

    elements.drawerTitle.textContent = title;
    elements.drawerBody.innerHTML = body;
    primeInlineVideos(elements.drawerBody);
  }

  function enterOverview() {
    selectedCaseId = null;
    if (drawerMode !== "stats") {
      clearDrawerState();
    }
  }

  function clearDrawerState() {
    drawerMode = null;
    drawerSample = null;
    drawerSeekMs = 0;
    drawerCaseId = null;
    drawerRunId = null;
  }

  function renderPlaybackView() {
    const caseItem = getSelectedCase();
    const run = caseItem ? getSelectedRun(caseItem) : null;
    renderExplorationPlayer(caseItem, run);
    if (drawerMode === "playback") {
      drawerSample = run?.exploration?.samples?.[playbackIndex] ?? drawerSample;
      drawerSeekMs = Number.isFinite(playbackTimeMs) ? playbackTimeMs : drawerSample?.tMs ?? 0;
      renderDrawer(caseItem, run, getFilteredCases());
    }
    mapController.setPlayback(getPlaybackDescriptor(run));
  }

  function startPlayback() {
    const run = getSelectedCase() ? getSelectedRun(getSelectedCase()) : null;
    const samples = run?.exploration?.samples ?? [];
    if (samples.length < 2) return;

    if (playbackIndex >= samples.length - 1) {
      playbackIndex = 0;
      playbackTimeMs = samples[0].tMs ?? 0;
    }

    playbackPlaying = true;
    playbackLastTick = 0;
    cancelAnimationFrame(playbackFrame);
    playbackFrame = requestAnimationFrame(playbackLoop);
  }

  function stopPlayback() {
    playbackPlaying = false;
    playbackLastTick = 0;
    if (playbackFrame) {
      cancelAnimationFrame(playbackFrame);
      playbackFrame = 0;
    }
  }

  function playbackLoop(timestamp) {
    if (!playbackPlaying) return;

    const caseItem = getSelectedCase();
    const run = caseItem ? getSelectedRun(caseItem) : null;
    const samples = run?.exploration?.samples ?? [];
    if (samples.length < 2) {
      stopPlayback();
      renderPlaybackView();
      return;
    }

    if (!playbackLastTick) playbackLastTick = timestamp;
    const delta = Math.min(500, timestamp - playbackLastTick);
    playbackLastTick = timestamp;
    playbackTimeMs += delta * playbackSpeed;

    const durationMs = run.exploration.durationMs ?? samples.at(-1)?.tMs ?? 0;
    if (playbackTimeMs >= durationMs) {
      playbackTimeMs = durationMs;
      playbackIndex = samples.length - 1;
      stopPlayback();
      renderPlaybackView();
      return;
    }

    const nextIndex = nearestSampleIndex(samples, playbackTimeMs);
    if (nextIndex !== playbackIndex) {
      playbackIndex = nextIndex;
      renderPlaybackView();
    }

    playbackFrame = requestAnimationFrame(playbackLoop);
  }

  function setPlaybackIndex(index, { keepPlaying = false, exactTimeMs = null } = {}) {
    const caseItem = getSelectedCase();
    const run = caseItem ? getSelectedRun(caseItem) : null;
    const samples = run?.exploration?.samples ?? [];
    if (samples.length === 0) return;

    playbackIndex = clamp(index, 0, samples.length - 1);
    playbackTimeMs = Number.isFinite(exactTimeMs)
      ? Math.max(0, exactTimeMs)
      : samples[playbackIndex].tMs ?? 0;
    drawerSample = samples[playbackIndex];
    drawerSeekMs = playbackTimeMs;
    if (!keepPlaying) stopPlayback();
    renderPlaybackView();
  }

  function getPlaybackDescriptor(run) {
    if (run?.condition === "static-image") return null;
    const samples = run?.exploration?.samples ?? [];
    if (!samples.length) return null;

    playbackIndex = clamp(playbackIndex, 0, samples.length - 1);
    const sample = samples[playbackIndex];
    return {
      index: playbackIndex,
      sample,
      trace: samples.slice(0, playbackIndex + 1),
    };
  }

  function resetPlaybackIfSelectionChanged(caseItem, run) {
    const signature = caseItem && run ? `${caseItem.id}:${run.id}` : "overview";
    if (signature === lastSelectionSignature) return;
    stopPlayback();
    playbackIndex = 0;
    playbackTimeMs = run?.exploration?.samples?.[0]?.tMs ?? 0;
    if (drawerMode === "playback") {
      drawerSample = run?.exploration?.samples?.[0] ?? null;
      drawerSeekMs = playbackTimeMs;
      drawerCaseId = caseItem?.id ?? null;
      drawerRunId = run?.id ?? null;
    }
  }

  function getFilteredCases() {
    return data.filter((item) => {
      if (
        filters.competition &&
        !(item.competitions ?? []).some(
          (membership) => membership.competitionId === filters.competition,
        )
      ) {
        return false;
      }
      if (filters.country && item.country !== filters.country) return false;
      if (filters.difficulty && item.difficulty !== filters.difficulty) return false;
      if (filters.sceneType && item.sceneType !== filters.sceneType) return false;
      if (!query) return true;

      return [
        item.title,
        item.landmark,
        item.city,
        item.region,
        item.country,
        item.sceneType,
        item.difficulty,
        item.primaryClueType,
        item.selectionNotes,
        item.summary,
        item.groundTruth?.label,
        item.localId,
        ...(item.competitions ?? []).flatMap((membership) => [
          membership.competitionId,
          membership.competitionName,
          membership.competitionShortName,
          membership.competitionDatasetId,
          membership.partId,
        ]),
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }

  function getOverviewMapCases(filteredCases) {
    return filteredCases.filter((item) => {
      const matchingRun = chooseRun(item, selectedModel, selectedCondition);
      return Boolean(matchingRun && hasCoordinate(matchingRun.prediction));
    });
  }

  function getStatsCases(caseItem, filteredCases) {
    return caseItem ? [caseItem] : getOverviewMapCases(filteredCases);
  }

  function getSelectedCase() {
    if (!selectedCaseId) return null;
    return data.find((item) => item.id === selectedCaseId) ?? null;
  }

  function getSelectedRun(caseItem) {
    if (!caseItem) return null;
    return chooseRun(caseItem, selectedModel, selectedCondition);
  }

  function ensureRunControlState(caseItem, filteredCases) {
    const scope = getScopeRuns(caseItem, filteredCases);
    const models = unique(scope.map((item) => item.model));
    const conditions = unique(scope.map((item) => item.condition));

    if (!selectedModel || !models.includes(selectedModel)) {
      selectedModel = models[0] ?? null;
    }
    if (!selectedCondition || !conditions.includes(selectedCondition)) {
      selectedCondition = conditions[0] ?? null;
    }
  }

  function getScopeRuns(caseItem, filteredCases) {
    return caseItem?.runs ?? filteredCases.flatMap((item) => item.runs);
  }

  function locationCardMarkup(item) {
    const active = item.id === selectedCaseId;
    const matchingRun = chooseRun(item, selectedModel, selectedCondition);
    const membership = preferredMembership(item, filters.competition);
    const runMeta = matchingRun
      ? `<span>${escapeHtml(CONDITION_LABELS[matchingRun.condition] ?? matchingRun.condition)}</span><b>${hasCoordinate(matchingRun.prediction) ? escapeHtml(formatDistance(matchingRun.errorKm)) : "Recording only"}</b>`
      : `<span>${escapeHtml(DIFFICULTY_LABELS[item.difficulty])}</span><b>Awaiting run</b>`;
    const competitionTag = membership
      ? `<em class="location-card__competition" title="${escapeAttribute(membership.competitionName)}">${escapeHtml(compactMembershipLabel(membership))}</em>`
      : "";

    return `
      <button
        class="location-card ${active ? "is-active" : ""}"
        type="button"
        data-case-id="${escapeAttribute(item.id)}"
        aria-pressed="${active}"
      >
        <span class="location-card__pin" aria-hidden="true"></span>
        <span class="location-card__body">
          <strong>${escapeHtml(item.city)}</strong>
          <small>${escapeHtml(item.localId ?? item.id)} · ${escapeHtml(item.country)}</small>
          ${competitionTag}
        </span>
        <span class="location-card__meta">${runMeta}</span>
      </button>
    `;
  }

  function statsDrawerMarkup(filteredCases) {
    const stats = computeStats(filteredCases, selectedModel, selectedCondition);
    const competitionName = filteredCases
      .flatMap((item) => item.competitions ?? [])
      .find((membership) => membership.competitionId === filters.competition)
      ?.competitionName;
    const selectedStatsCase = getSelectedCase();
    const filterText = [
      selectedStatsCase ? `${selectedStatsCase.city} (${selectedStatsCase.localId ?? selectedStatsCase.id})` : null,
      competitionName,
      selectedModel,
      selectedCondition ? CONDITION_LABELS[selectedCondition] : null,
      filters.country || null,
      filters.difficulty ? DIFFICULTY_LABELS[filters.difficulty] : null,
      filters.sceneType || null,
      query ? `search: ${query}` : null,
    ].filter(Boolean).join(" · ");

    return `
      <div class="drawer-section">
        <p class="drawer-muted">Current slice: ${escapeHtml(filterText || "all visible locations")}</p>
      </div>
      <div class="stat-grid">
        ${metricMarkup("Visible cases", String(stats.caseCount), `${stats.pinRunCount} predictions in the current map view`)}
        ${metricMarkup("Median error", formatDistance(stats.medianErrorKm), "robust location score")}
        ${metricMarkup("Mean error", formatDistance(stats.meanErrorKm), "sensitive to large misses")}
        ${metricMarkup("Country accuracy", formatPercent(stats.countryAccuracy), `${stats.countryRated} rated`)}
        ${metricMarkup("Within 25 km", formatPercent(stats.within25), "regional hit rate")}
        ${metricMarkup("Cue useful", formatPercent(stats.cueUseful), `${stats.cueCount} cues`)}
      </div>
      <div class="drawer-section">
        <h4>Error buckets</h4>
        ${bucketMarkup(stats.bands)}
      </div>
      <div class="drawer-section">
        <h4>Explanation review</h4>
        ${progressMarkup("Visible", stats.cueVisible)}
        ${progressMarkup("Correct", stats.cueCorrect)}
        ${progressMarkup("Useful", stats.cueUseful)}
        ${progressMarkup("Consistent", stats.cueConsistent)}
      </div>
      <div class="drawer-section">
        <h4>Interactive exploration</h4>
        <dl class="detail-list">
          <div><dt>Runs with path</dt><dd>${stats.explorationRuns}</dd></div>
          <div><dt>Average route</dt><dd>${formatDistance(stats.meanRouteKm)}</dd></div>
          <div><dt>Average time</dt><dd>${stats.meanDurationMs === null ? "—" : formatSeconds(stats.meanDurationMs)}</dd></div>
        </dl>
      </div>
    `;
  }

  function truthDrawerMarkup(caseItem, run) {
    const imageUrl = assetImageUrl(caseItem.startingImage);
    const interactive = run?.condition === "interactive-panorama";
    const videoUrl = interactive ? assetVideoUrl(run?.exploration?.video) : null;
    const visualMarkup = interactive
      ? videoUrl
        ? evidenceVideoMarkup(videoUrl, imageUrl, `Interactive round video · ${caseItem.city}, ${caseItem.country}`, 0)
        : `<div class="evidence-image evidence-image--missing">
            <strong>No round video yet</strong>
            <span>Record the interactive condition with recorder v0.7.3 and run <code>npm run data:build</code>.</span>
          </div>`
      : imageUrl
        ? evidenceImageMarkup(imageUrl, `Canonical static view · ${caseItem.city}, ${caseItem.country}`)
        : `<div class="evidence-image evidence-image--missing">
            <strong>No canonical static image yet</strong>
            <span>Record the static/NMPZ condition and run <code>npm run data:build</code>.</span>
          </div>`;

    return `
      <div class="detail-hero detail-hero--truth">
        <span class="detail-badge">T</span>
        <div>
          <h3>${escapeHtml(caseItem.landmark || caseItem.title)}</h3>
          <p>${escapeHtml(caseItem.city)}, ${escapeHtml(caseItem.country)}</p>
        </div>
      </div>
      ${visualMarkup}
      <dl class="detail-list">
        <div><dt>Condition</dt><dd>${escapeHtml(interactive ? "Interactive panorama video" : "Static / NMPZ image")}</dd></div>
        <div><dt>Difficulty</dt><dd>${escapeHtml(DIFFICULTY_LABELS[caseItem.difficulty] ?? caseItem.difficulty)}</dd></div>
        <div><dt>Scene type</dt><dd>${escapeHtml(caseItem.sceneType || "—")}</dd></div>
        <div><dt>Coordinates</dt><dd><code>${escapeHtml(formatCoordinate(caseItem.groundTruth))}</code></dd></div>
      </dl>
    `;
  }

  function predictionDrawerMarkup(caseItem, run) {
    const route = run.condition === "static-image"
      ? "Static / NMPZ · fixed view"
      : run.exploration?.path?.length > 1
        ? `${run.exploration.path.length} positions · ${formatDistance(explorationDistanceKm(run.exploration))}`
        : run.exploration?.samples?.length
          ? `${run.exploration.samples.length} camera observations`
          : "—";
    const predictionAvailable = hasCoordinate(run.prediction);
    const predictionStreetView = predictionAvailable ? safeStreetViewUrl(run.prediction) : "#";

    return `
      <div class="detail-hero detail-hero--prediction">
        <span class="detail-badge">${predictionAvailable ? "P" : "R"}</span>
        <div>
          <h3>${escapeHtml(predictionAvailable ? (run.prediction.label || `${caseItem.city} prediction`) : "Recording imported")}</h3>
          <p>${escapeHtml(run.model)} · ${escapeHtml(CONDITION_LABELS[run.condition] ?? run.condition)}</p>
        </div>
      </div>
      ${predictionAvailable ? "" : `<p class="drawer-muted">The exploration was recorded, but the submitted guess coordinate was not captured. Playback is available; the prediction pin, error line, and location-error statistics are unavailable for this run.</p>`}
      <dl class="detail-list">
        <div><dt>Pin error</dt><dd>${predictionAvailable ? escapeHtml(formatDistance(run.errorKm)) : "—"}</dd></div>
        <div><dt>Run time</dt><dd>${run.durationSeconds === null ? "—" : `${Math.round(run.durationSeconds)} s`}</dd></div>
        <div><dt>Country</dt><dd>${predictionAvailable ? accuracyLabel(run.accuracy?.country) : "—"}</dd></div>
        <div><dt>Region / city</dt><dd>${predictionAvailable ? accuracyLabel(run.accuracy?.region) : "—"}</dd></div>
        <div><dt>Exploration</dt><dd>${escapeHtml(route)}</dd></div>
        <div><dt>Coordinates</dt><dd>${predictionAvailable ? `<code>${escapeHtml(formatCoordinate(run.prediction))}</code>` : "Not captured"}</dd></div>
      </dl>
      ${predictionAvailable ? `<a class="drawer-action" href="${escapeAttribute(predictionStreetView)}" target="_blank" rel="noopener noreferrer">Open Street View at prediction ↗</a>` : ""}
      ${run.hypothesis ? `<div class="drawer-section"><h4>Initial hypothesis</h4><p>${escapeHtml(run.hypothesis)}</p></div>` : ""}
      <div class="drawer-section">
        <h4>Reported cues</h4>
        <ol class="cue-list">${cueListMarkup(run.cues)}</ol>
      </div>
      ${run.notes ? `<div class="drawer-section"><h4>Run notes</h4><p>${escapeHtml(run.notes)}</p></div>` : ""}
    `;
  }

  function playbackDrawerMarkup(sample, run, exactSeekMs = null) {
    if (!sample) {
      return `<p class="drawer-muted">No playback sample selected.</p>`;
    }
    const frame = playbackFrameForSample(run.exploration, sample);
    const imageUrl = assetImageUrl(frame?.image);
    const videoUrl = assetVideoUrl(run.exploration?.video);
    const seekMs = Number.isFinite(exactSeekMs)
      ? Math.max(0, exactSeekMs)
      : Number.isFinite(sample.tMs)
        ? sample.tMs
        : 0;
    return `
      <div class="detail-hero detail-hero--playback">
        <span class="detail-badge">▶</span>
        <div>
          <h3>${escapeHtml(frame?.label || sample.label || "Timeline sample")}</h3>
          <p>${formatSeconds(sample.tMs)} · ${escapeHtml(frame?.type || sample.reason || "sample")}</p>
        </div>
      </div>
      ${imageUrl
        ? evidenceImageMarkup(imageUrl, `${frame?.label || "Captured exploration frame"} · ${formatSeconds(frame?.tMs ?? sample.tMs)}`)
        : videoUrl
          ? evidenceVideoMarkup(videoUrl, null, `Recorded interactive round · ${formatSeconds(seekMs)}`, seekMs)
          : `<div class="evidence-image evidence-image--missing">
              <strong>No visual recording for this point</strong>
              <span>The timeline still uses the recorded API camera samples.</span>
            </div>`}
      <dl class="detail-list">
        <div><dt>Video time</dt><dd>${formatSeconds(seekMs)}</dd></div>
        <div><dt>Heading</dt><dd>${formatDegrees(sample.heading)}</dd></div>
        <div><dt>Pitch</dt><dd>${formatDegrees(sample.pitch)}</dd></div>
        <div><dt>Zoom</dt><dd>${formatNumber(sample.zoom)}</dd></div>
        <div><dt>FOV</dt><dd>${formatDegrees(sample.fov)}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(sample.source || run.exploration?.source || "—")}</dd></div>
        <div><dt>Coordinates</dt><dd><code>${escapeHtml(formatCoordinate(sample))}</code></dd></div>
      </dl>
      ${videoUrl ? `<p class="drawer-muted">The player contains only this location/round. Use its native timeline to inspect any moment; selecting a playback action seeks this player near the same recorded time.</p>` : ""}
    `;
  }

  function assertAlive() {
    if (destroyed) throw new Error("This explorer instance has been destroyed.");
  }
}

function shellMarkup() {
  return `
    <div class="atlas-app">
      <header class="app-header">
        <div class="app-brand">
          <span class="app-brand__mark" aria-hidden="true">N</span>
          <div>
            <strong>NAUTILUS-</strong>
            <small>MLLM geolocation evaluation</small>
          </div>
        </div>

        <div class="run-controls" aria-label="Run controls">
          <label>
            <span>Model</span>
            <select data-model-select></select>
          </label>
          <label>
            <span>Condition</span>
            <select data-condition-select></select>
          </label>
          <button class="stats-button" type="button" data-stats-button>Stats</button>
        </div>
      </header>

      <div class="workspace">
        <aside class="location-rail" aria-label="Location selection">
          <div class="rail-heading">
            <div>
              <span class="section-label">Dataset</span>
              <h1>Locations</h1>
            </div>
            <span class="result-count" data-result-count></span>
          </div>

          <label class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
            <input data-search type="search" placeholder="Search location" autocomplete="off" />
          </label>

          <div class="filter-grid" aria-label="Location filters">
            <label class="filter-grid__wide"><span>Competition</span><select data-competition-filter></select></label>
            <label><span>Country</span><select data-country-filter></select></label>
            <label><span>Difficulty</span><select data-difficulty-filter></select></label>
            <label class="filter-grid__wide"><span>Scene type</span><select data-scene-filter></select></label>
            <button class="text-button filter-grid__clear" type="button" data-clear-filters>Clear filters</button>
          </div>

          <button class="overview-card is-active" type="button" data-overview aria-pressed="true">
            <span class="overview-card__icon" aria-hidden="true"><i></i><i></i><i></i></span>
            <span><strong>All locations</strong><small>Overview map</small></span>
            <b data-overview-count></b>
          </button>

          <div class="location-list" data-location-list></div>
        </aside>

        <main class="map-workspace" data-map-workspace>
          <section class="map-panel">
            <header class="map-toolbar">
              <div class="map-toolbar__title">
                <span class="section-label" data-map-eyebrow></span>
                <h2 data-map-title></h2>
                <p data-map-subtitle></p>
              </div>
              <div class="map-toolbar__actions">
                <button class="secondary-button" type="button" data-reset-map>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.34-5.66L20 7.7"></path><path d="M20 3v4.7h-4.7"></path></svg>
                  <span data-reset-map-label>Fit all</span>
                </button>
              </div>
            </header>

            <div class="map-stage" data-map></div>

            <div class="map-legend" aria-label="Map legend">
              <span><i class="legend-dot legend-dot--location"></i> Location</span>
              <span><i class="legend-dot legend-dot--truth"></i> Truth</span>
              <span><i class="legend-dot legend-dot--prediction"></i> Prediction</span>
              <span><i class="legend-line"></i> Exploration</span>
              <span><i class="legend-line legend-line--active"></i> Playback</span>
            </div>

            <section class="exploration-player" data-exploration-player hidden>
              <div class="player-header">
                <div>
                  <span class="section-label" data-player-eyebrow>Recorded exploration</span>
                  <h3>Playback timeline</h3>
                </div>
                <a class="secondary-button player-open" data-open-current-view target="_blank" rel="noopener noreferrer">Open captured image ↗</a>
              </div>
              <div class="player-controls">
                <button class="play-toggle" type="button" data-play-toggle>Play</button>
                <input class="timeline" data-timeline type="range" min="0" max="0" value="0" step="1" aria-label="Exploration timeline" />
                <select class="speed-select" data-speed-select aria-label="Playback speed">
                  ${PLAYBACK_SPEEDS.map((speed) => `<option value="${speed}">${speed}×</option>`).join("")}
                </select>
                <div class="time-label" data-time-label>0.0 s / 0.0 s</div>
              </div>
              <div class="key-moments" data-key-moments aria-label="Key moments"></div>
              <div class="sample-readout" data-sample-readout></div>
            </section>

            <footer class="comparison-bar" data-comparison hidden>
              <div class="comparison-item comparison-item--truth">
                <span class="comparison-item__badge">T</span>
                <div><small>Ground truth</small><strong data-truth-label></strong></div>
              </div>
              <div class="comparison-separator" aria-hidden="true"></div>
              <div class="comparison-item comparison-item--prediction">
                <span class="comparison-item__badge">P</span>
                <div><small>Prediction</small><strong data-prediction-label></strong></div>
              </div>
              <div class="comparison-stat"><small>Pin error</small><strong data-pin-error></strong></div>
              <div class="comparison-stat"><small>Run time</small><strong data-run-time></strong></div>
              <div class="comparison-stat comparison-stat--wide"><small>Exploration</small><strong data-route-meta></strong></div>
            </footer>
          </section>

          <aside class="detail-drawer" data-drawer hidden>
            <div class="detail-drawer__panel">
              <header class="detail-drawer__header">
                <div>
                  <span class="section-label">Selected pin</span>
                  <h2 data-drawer-title>Details</h2>
                </div>
                <button class="icon-button" type="button" data-close-drawer aria-label="Close details">×</button>
              </header>
              <div class="detail-drawer__body" data-drawer-body></div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  `;
}

function collectElements(root) {
  const selectors = {
    search: "[data-search]",
    resultCount: "[data-result-count]",
    competitionFilter: "[data-competition-filter]",
    countryFilter: "[data-country-filter]",
    difficultyFilter: "[data-difficulty-filter]",
    sceneFilter: "[data-scene-filter]",
    overviewButton: "[data-overview]",
    overviewCount: "[data-overview-count]",
    locationList: "[data-location-list]",
    modelSelect: "[data-model-select]",
    conditionSelect: "[data-condition-select]",
    mapWorkspace: "[data-map-workspace]",
    map: "[data-map]",
    mapEyebrow: "[data-map-eyebrow]",
    mapTitle: "[data-map-title]",
    mapSubtitle: "[data-map-subtitle]",
    resetMapLabel: "[data-reset-map-label]",
    comparison: "[data-comparison]",
    truthLabel: "[data-truth-label]",
    predictionLabel: "[data-prediction-label]",
    pinError: "[data-pin-error]",
    runTime: "[data-run-time]",
    routeMeta: "[data-route-meta]",
    explorationPlayer: "[data-exploration-player]",
    playerEyebrow: "[data-player-eyebrow]",
    playToggle: "[data-play-toggle]",
    timeline: "[data-timeline]",
    speedSelect: "[data-speed-select]",
    timeLabel: "[data-time-label]",
    openCurrentView: "[data-open-current-view]",
    keyMoments: "[data-key-moments]",
    sampleReadout: "[data-sample-readout]",
    drawer: "[data-drawer]",
    drawerTitle: "[data-drawer-title]",
    drawerBody: "[data-drawer-body]",
  };

  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => {
      const element = root.querySelector(selector);
      if (!element) throw new Error(`Explorer template is missing ${selector}.`);
      return [key, element];
    }),
  );
}

function chooseRun(caseItem, model, condition) {
  return (
    caseItem.runs.find((run) => run.model === model && run.condition === condition) ??
    caseItem.runs.find((run) => run.model === model) ??
    caseItem.runs.find((run) => run.condition === condition) ??
    caseItem.runs[0]
  );
}

function keyMomentMarkup(moments, samples) {
  if (!moments.length) {
    return `<span class="key-moments__empty">No key moments defined</span>`;
  }

  return moments
    .map((moment) => {
      const sampleIndex = Number.isInteger(moment.sampleIndex)
        ? moment.sampleIndex
        : nearestSampleIndex(samples, moment.tMs);

      return `
        <button
          type="button"
          data-moment-index="${sampleIndex}"
          data-moment-time-ms="${Number.isFinite(moment.tMs) ? Math.max(0, moment.tMs) : 0}"
          title="${escapeAttribute(moment.description)}"
        >
          <strong>${escapeHtml(moment.label)}</strong>
          <small>${formatSeconds(moment.tMs)}</small>
        </button>
      `;
    })
    .join("");
}

function sampleReadoutMarkup(sample, exploration, index, frame = null) {
  const imageUrl = assetImageUrl(frame?.image);
  return [
    readoutCell("Sample", `${index + 1} / ${exploration.samples.length}`),
    readoutCell("Heading", formatDegrees(sample.heading)),
    readoutCell("Pitch", formatDegrees(sample.pitch)),
    readoutCell("Zoom", formatNumber(sample.zoom)),
    readoutCell("FOV", formatDegrees(sample.fov)),
    readoutCell("Frame", imageUrl
      ? (frame?.label || frame?.type || "Captured")
      : frame?.video
        ? (frame?.label || "Recorded video")
        : "—"),
  ].join("");
}

function cueListMarkup(cues) {
  if (!cues.length) return `<li class="cue-empty">No cues reported.</li>`;
  return cues
    .map((cue) => {
      const evidence = cue.evidenceView
        ? `<a href="${escapeAttribute(safeStreetViewUrl(cue.evidenceView))}" target="_blank" rel="noopener noreferrer">Evidence view ↗</a>`
        : "";
      return `
        <li class="cue-card">
          <div>
            <strong>${escapeHtml(cue.text)}</strong>
            <small>${escapeHtml(sourceLabel(cue.source))}</small>
          </div>
          <div class="cue-ratings">${ratingPills(cue.ratings)}</div>
          ${evidence}
        </li>
      `;
    })
    .join("");
}

function ratingPills(ratings = {}) {
  return [
    ["Visible", ratings.visible],
    ["Correct", ratings.correct],
    ["Useful", ratings.useful],
    ["Consistent", ratings.consistent],
  ]
    .map(([label, value]) => `<span class="rating-pill ${value === true ? "is-good" : value === false ? "is-bad" : ""}">${escapeHtml(label)} ${value === true ? "✓" : value === false ? "×" : "—"}</span>`)
    .join("");
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

function computeStats(cases, model, condition) {
  const runs = cases
    .map((caseItem) => chooseRun(caseItem, model, condition))
    .filter(Boolean);
  const errors = runs.map((run) => run.errorKm).filter(Number.isFinite).sort((a, b) => a - b);
  const cueRatings = runs.flatMap((run) => run.cues ?? []).map((cue) => cue.ratings ?? {});
  const explorations = runs.map((run) => run.exploration).filter((exploration) => exploration?.path?.length > 1);

  return {
    caseCount: cases.length,
    runCount: runs.length,
    pinRunCount: errors.length,
    medianErrorKm: median(errors),
    meanErrorKm: mean(errors),
    within25: ratio(errors.filter((km) => km <= 25).length, errors.length),
    within250: ratio(errors.filter((km) => km <= 250).length, errors.length),
    within750: ratio(errors.filter((km) => km <= 750).length, errors.length),
    countryAccuracy: booleanRatio(runs.map((run) => run.accuracy?.country)),
    countryRated: runs.filter((run) => typeof run.accuracy?.country === "boolean").length,
    cueCount: cueRatings.length,
    cueVisible: booleanRatio(cueRatings.map((ratings) => ratings.visible)),
    cueCorrect: booleanRatio(cueRatings.map((ratings) => ratings.correct)),
    cueUseful: booleanRatio(cueRatings.map((ratings) => ratings.useful)),
    cueConsistent: booleanRatio(cueRatings.map((ratings) => ratings.consistent)),
    bands: summarizeBands(errors),
    explorationRuns: explorations.length,
    meanRouteKm: mean(explorations.map((exploration) => explorationDistanceKm(exploration))),
    meanDurationMs: explorations.length ? mean(explorations.map((exploration) => exploration.durationMs).filter(Number.isFinite)) : null,
  };
}

function summarizeBands(errors) {
  const labels = {
    exact: "≤25 m",
    local: "≤250 m",
    regional: "≤25 km",
    country: "≤250 km",
    miss: ">250 km",
  };
  const counts = { exact: 0, local: 0, regional: 0, country: 0, miss: 0 };
  errors.forEach((km) => {
    counts[errorBand(km)] += 1;
  });
  return Object.entries(counts).map(([key, count]) => ({
    key,
    label: labels[key],
    count,
    share: ratio(count, errors.length),
  }));
}

function bucketMarkup(bands) {
  return `<div class="bucket-list">${bands.map((band) => `
    <div class="bucket-row">
      <span>${escapeHtml(band.label)}</span>
      <b>${band.count}</b>
      <i><em style="width:${Math.round((band.share ?? 0) * 100)}%"></em></i>
    </div>`).join("")}</div>`;
}

function progressMarkup(label, value) {
  const percent = value === null ? 0 : Math.round(value * 100);
  return `
    <div class="progress-row">
      <span>${escapeHtml(label)}</span>
      <b>${value === null ? "—" : `${percent}%`}</b>
      <i><em style="width:${percent}%"></em></i>
    </div>
  `;
}

function metricMarkup(label, value, note) {
  return `
    <div class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function readoutCell(label, value) {
  return `<div class="readout-cell"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function setSelectOptions(select, values, emptyLabel, selected, labeler = (value) => value) {
  select.innerHTML = [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...values.map(
      (value) =>
        `<option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labeler(value))}</option>`,
    ),
  ].join("");
}

function resolveRoot(root) {
  if (root instanceof HTMLElement) return root;
  if (typeof root === "string") {
    const element = document.querySelector(root);
    if (element instanceof HTMLElement) return element;
  }
  throw new TypeError("createExplorer requires a root HTMLElement or selector.");
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueBy(values, keyer) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyer(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactMembershipLabel(membership) {
  const name =
    membership?.competitionShortName ??
    membership?.competitionName ??
    membership?.competitionId ??
    "Competition";
  const part = membership?.partCount > 1 ? ` · P${membership.part}` : "";
  return `${name}${part} · R${membership?.round ?? "?"}`;
}

function preferredMembership(caseItem, competitionId) {
  const memberships = caseItem?.competitions ?? [];
  return (
    memberships.find((membership) => membership.competitionId === competitionId) ??
    memberships[0] ??
    null
  );
}

function humanizeLabel(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readSelectionFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    caseId: params.get("case") || null,
    model: params.get("model") || null,
    condition: params.get("condition") || null,
  };
}

function writeSelectionToHash(caseItem, run) {
  const params = new URLSearchParams();
  if (caseItem) params.set("case", caseItem.id);
  if (run?.model) params.set("model", run.model);
  if (run?.condition) params.set("condition", run.condition);

  const next = params.toString();
  const current = window.location.hash.replace(/^#/, "");
  if (next === current) return;

  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next ? `#${next}` : ""}`);
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function assetImageUrl(image) {
  const raw = typeof image?.path === "string" ? image.path.trim() : "";
  if (!raw) return null;
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  return `/${raw.replace(/^[/\\]+/, "")}`;
}

function assetVideoUrl(video) {
  const raw = typeof video?.path === "string" ? video.path.trim() : "";
  if (!raw) return null;
  if (/^(?:https?:|blob:)/i.test(raw)) return raw;
  return `/${raw.replace(/^[/\\]+/, "")}`;
}

function videoFrameInspectorUrl(exploration, sample, label = "Recorded Street View frame") {
  const video = exploration?.video;
  const videoUrl = assetVideoUrl(video);
  if (!videoUrl || !sample) return null;
  const roundOffsetMs = Number.isFinite(video.roundOffsetMs) ? video.roundOffsetMs : 0;
  const sampleMs = Number.isFinite(sample.tMs) ? sample.tMs : 0;
  const targetMs = Math.max(0, roundOffsetMs + sampleMs);
  const durationMs = Number.isFinite(exploration?.durationMs) ? exploration.durationMs : null;
  const params = new URLSearchParams({
    video: videoUrl,
    t: (targetMs / 1000).toFixed(3),
    label: String(label),
  });
  if (Number.isFinite(durationMs)) {
    params.set("min", (roundOffsetMs / 1000).toFixed(3));
    params.set("max", ((roundOffsetMs + durationMs) / 1000).toFixed(3));
  }
  const crop = video.crop;
  if (crop?.rect && crop?.viewport) {
    params.set("x", String(crop.rect.x));
    params.set("y", String(crop.rect.y));
    params.set("w", String(crop.rect.width));
    params.set("h", String(crop.rect.height));
    params.set("vw", String(crop.viewport.width));
    params.set("vh", String(crop.viewport.height));
  }
  return `/frame-inspector.html?${params.toString()}`;
}

function playbackFrameForSample(exploration, sample) {
  if (!exploration || !sample) return null;
  if (sample.image && assetImageUrl(sample.image)) {
    return {
      id: sample.playbackActionId ?? `sample-${sample.seq ?? 0}`,
      label: sample.label || "Captured sample",
      type: sample.reason || "sample",
      tMs: sample.tMs ?? 0,
      camera: sample,
      image: sample.image,
    };
  }

  const actions = Array.isArray(exploration.playbackActions)
    ? exploration.playbackActions.filter((action) => assetImageUrl(action.image))
    : [];
  if (!actions.length) {
    if (exploration.finalView?.image) return exploration.finalView;
    if (exploration.video?.path) {
      const targetMs = Number.isFinite(sample.tMs) ? sample.tMs : 0;
      const moments = Array.isArray(exploration.keyMoments) ? exploration.keyMoments : [];
      let moment = moments[0] ?? null;
      for (const candidate of moments) {
        if ((candidate.tMs ?? 0) > targetMs) break;
        moment = candidate;
      }
      return {
        id: moment?.id ?? `video-sample-${sample.seq ?? 0}`,
        label: moment?.label ?? "Recorded Street View frame",
        type: moment?.actionType ?? sample.reason ?? "video-frame",
        tMs: targetMs,
        camera: sample,
        video: exploration.video,
      };
    }
    return null;
  }

  const targetMs = Number.isFinite(sample.tMs) ? sample.tMs : 0;
  let frame = actions[0];
  for (const action of actions) {
    if ((action.tMs ?? 0) > targetMs) break;
    frame = action;
  }
  return frame;
}

function evidenceImageMarkup(url, alt) {
  return `
    <a class="evidence-image" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" loading="lazy" />
      <span>Click image to inspect full resolution ↗</span>
    </a>
  `;
}

function evidenceVideoMarkup(url, posterUrl, label, seekMs = 0) {
  return `
    <div class="evidence-video">
      <video
        class="evidence-video__player"
        controls
        playsinline
        preload="metadata"
        ${posterUrl ? `poster="${escapeAttribute(posterUrl)}"` : ""}
        data-inline-round-video
        data-seek-ms="${Number.isFinite(seekMs) ? Math.max(0, seekMs) : 0}"
        aria-label="${escapeAttribute(label)}"
      >
        <source src="${escapeAttribute(url)}" type="video/webm" />
      </video>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function primeInlineVideos(container) {
  if (!container?.querySelectorAll) return;

  container
    .querySelectorAll("video[data-inline-round-video]")
    .forEach((video) => {
      const seekMs = Number(video.dataset.seekMs ?? 0);
      const seekSeconds = Number.isFinite(seekMs)
        ? Math.max(0, seekMs / 1000)
        : 0;

      let seekApplied = false;

      const cleanup = () => {
        for (const eventName of [
          "loadedmetadata",
          "durationchange",
          "loadeddata",
          "canplay",
          "progress",
        ]) {
          video.removeEventListener(eventName, applySeek);
        }
      };

      const applySeek = () => {
        if (seekApplied) return;

        // We need at least metadata before currentTime can reliably be assigned.
        if (video.readyState < 1) return;

        let targetSeconds = seekSeconds;

        // If the browser knows the real duration, clamp against it.
        // WebM may temporarily report Infinity, so do NOT require a finite
        // duration before attempting the seek.
        if (Number.isFinite(video.duration) && video.duration > 0) {
          targetSeconds = Math.min(
            seekSeconds,
            Math.max(0, video.duration - 0.04),
          );
        }

        try {
          video.pause();
          video.currentTime = targetSeconds;
          seekApplied = true;
          cleanup();
        } catch {
          // Browser may not have a usable seek range yet.
          // A later media event will retry.
        }
      };

      for (const eventName of [
        "loadedmetadata",
        "durationchange",
        "loadeddata",
        "canplay",
        "progress",
      ]) {
        video.addEventListener(eventName, applySeek);
      }

      if (video.readyState >= 1) {
        applySeek();
      }
    });
}

function safeStreetViewUrl(view) {
  try {
    return buildStreetViewUrl(view);
  } catch {
    return "#";
  }
}

function formatSeconds(ms) {
  if (!Number.isFinite(ms)) return "0.0 s";
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatDegrees(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°` : "—";
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function formatPercent(value) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function accuracyLabel(value) {
  if (value === true) return "Correct";
  if (value === false) return "Incorrect";
  return "Not rated";
}

function sourceLabel(source) {
  return {
    "starting-image": "Starting image",
    panorama: "Panorama",
    map: "Map",
  }[source] ?? source;
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function mean(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function booleanRatio(values) {
  const rated = values.filter((value) => typeof value === "boolean");
  if (!rated.length) return null;
  return rated.filter(Boolean).length / rated.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
