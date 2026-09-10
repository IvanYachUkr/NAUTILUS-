const COLORS = {
  signage: "#6ea8ff", landmark: "#ff9b52", architecture: "#bf86ff",
  infrastructure: "#42d5cf", vegetation: "#66d17a", geography: "#c99568", linguistic: "#f0d45c",
};
const els = Object.fromEntries([...document.querySelectorAll("[data-location], [data-clue-set], [data-status-filter], [data-cue-list], [data-image], [data-stage], [data-box-layer], [data-inspector], [data-progress], [data-save], [data-next-pending], [data-stage-note], [data-toast]")].map((element) => [Object.keys(element.dataset)[0], element]));
let documents = [];
let locationIndex = 0;
let clueSetIndex = 0;
let selectedCueId = null;
let dirty = false;
let gesture = null;

boot().catch((error) => showToast(error.message, true));

async function boot() {
  const response = await fetch("/api/clues", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Start the NAUTILUS local server before opening the clue reviewer.");
  const payload = await response.json();
  documents = payload.documents ?? [];
  if (!documents.length) throw new Error("No clue documents were found. Run npm run clues:extract first.");
  els.location.innerHTML = documents.map((document, index) => `<option value="${index}">${escapeHtml(document.locationId)}</option>`).join("");
  bindEvents();
  selectFirstUnresolved();
  render();
}

function bindEvents() {
  els.location.addEventListener("change", () => { locationIndex = Number(els.location.value); clueSetIndex = 0; selectedCueId = null; render(); });
  els.clueSet.addEventListener("change", () => { clueSetIndex = Number(els.clueSet.value); selectedCueId = null; render(); });
  els.statusFilter.addEventListener("change", render);
  els.save.addEventListener("click", saveCurrent);
  els.nextPending.addEventListener("click", () => { selectNextUnresolved(); render(); });
  els.cueList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cue-id]");
    if (!button) return;
    selectedCueId = button.dataset.cueId;
    render();
  });
  els.inspector.addEventListener("input", updateFromInspector);
  els.inspector.addEventListener("change", updateFromInspector);
  els.inspector.addEventListener("click", handleInspectorAction);
  els.boxLayer.addEventListener("pointerdown", startBoxGesture);
  els.stage.addEventListener("pointerdown", startDrawGesture);
  window.addEventListener("pointermove", updateGesture);
  window.addEventListener("pointerup", endGesture);
  window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCurrent(); }
    if (event.key === "ArrowDown" && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) { event.preventDefault(); selectAdjacentCue(1); }
    if (event.key === "ArrowUp" && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) { event.preventDefault(); selectAdjacentCue(-1); }
  });
}

function render() {
  const document = currentDocument();
  const clueSets = document.clueSets ?? [];
  clueSetIndex = Math.min(clueSetIndex, Math.max(0, clueSets.length - 1));
  const clueSet = currentClueSet();
  els.location.value = String(locationIndex);
  els.clueSet.innerHTML = clueSets.map((item, index) => `<option value="${index}">${escapeHtml(item.model)} · ${escapeHtml(item.reasoning ?? "")}</option>`).join("");
  els.clueSet.value = String(clueSetIndex);
  els.image.src = `/${document.imagePath}`;

  const visibleCues = (clueSet?.cues ?? []).filter((cue) => !els.statusFilter.value || cue.annotationStatus === els.statusFilter.value);
  if (!selectedCueId || !visibleCues.some((cue) => cue.id === selectedCueId)) selectedCueId = visibleCues[0]?.id ?? clueSet?.cues?.[0]?.id ?? null;
  els.cueList.innerHTML = visibleCues.map((cue) => {
    const index = clueSet.cues.indexOf(cue) + 1;
    return `<li><button type="button" class="${cue.id === selectedCueId ? "is-active" : ""}" data-cue-id="${escapeHtml(cue.id)}"><i class="status-dot ${escapeHtml(cue.annotationStatus)}"></i><span>${index}. ${escapeHtml(cue.label)}</span><small>${escapeHtml(cue.annotationStatus)}</small></button></li>`;
  }).join("");
  renderBoxes(clueSet);
  renderInspector();
  renderProgress();
}

function renderBoxes(clueSet) {
  els.boxLayer.innerHTML = (clueSet?.cues ?? []).filter((cue) => cue.region && cue.annotationStatus !== "excluded").map((cue, index) => {
    const region = cue.region;
    return `<div class="annotation-box ${cue.id === selectedCueId ? "is-active" : ""}" data-cue-id="${escapeHtml(cue.id)}" data-index="${index + 1}" style="left:${region.x * 100}%;top:${region.y * 100}%;width:${region.w * 100}%;height:${region.h * 100}%;--box-color:${COLORS[cue.category] ?? COLORS.signage}"><span class="resize-handle" data-resize></span></div>`;
  }).join("");
}

function renderInspector() {
  const clue = currentCue();
  if (!clue) { els.inspector.innerHTML = '<div class="empty">Select a clue to review it.</div>'; return; }
  els.inspector.innerHTML = `
    <h2>${escapeHtml(clue.label)}</h2>
    <p class="inspector__meta">${escapeHtml(clue.sourceRuns.join(", "))} · ${escapeHtml(clue.annotationStatus)}</p>
    <label>Label<input data-field="label" value="${escapeHtml(clue.label)}" /></label>
    <label>Description<textarea data-field="description">${escapeHtml(clue.description)}</textarea></label>
    <div class="field-row">
      <label>Category<select data-field="category">${Object.keys(COLORS).map((category) => `<option ${category === clue.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
      <label>Status<select data-field="annotationStatus">${["needs-review", "reviewed", "text-only", "not-grounded", "excluded"].map((status) => `<option ${status === clue.annotationStatus ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    </div>
    <div class="ratings">${["visible", "correct", "useful", "consistent"].map((rating) => `<label><input type="checkbox" data-rating="${rating}" ${clue.ratings?.[rating] === true ? "checked" : ""} /> ${rating}</label>`).join("")}</div>
    <div class="actions">
      <button type="button" class="primary" data-action="approve">Approve box</button>
      <button type="button" data-action="text-only">Text only</button>
      <button type="button" data-action="clear">Clear box</button>
      <button type="button" data-action="exclude">Exclude clue</button>
      <button type="button" class="wide" data-action="next">Approve and next unresolved</button>
    </div>
    <div class="provenance"><strong>Original reports</strong>${clue.provenance.map((item) => `<details><summary>${escapeHtml(item.runId)}</summary><p>${escapeHtml(item.text)}</p></details>`).join("")}</div>`;
  els.stageNote.textContent = clue.region ? `${clue.label} · ${clue.regionSource ?? "manual region"}` : `${clue.label} · no region`;
}

function updateFromInspector(event) {
  const clue = currentCue();
  if (!clue) return;
  if (event.target.dataset.field) clue[event.target.dataset.field] = event.target.value;
  if (event.target.dataset.rating) clue.ratings[event.target.dataset.rating] = event.target.checked;
  markDirty();
  if (event.type === "change") render();
}

function handleInspectorAction(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const clue = currentCue();
  if (!action || !clue) return;
  if (action === "approve" || action === "next") {
    if (!clue.region) { showToast("Draw or keep a box before approving this clue.", true); return; }
    clue.annotationStatus = "reviewed";
    clue.regionSource = `${clue.regionSource ?? "manual"}+manual-review`;
    clue.ratings.visible = true;
  } else if (action === "text-only") {
    clue.region = null; clue.annotationStatus = "text-only"; clue.regionSource = null;
  } else if (action === "clear") {
    clue.region = null; clue.annotationStatus = "not-grounded"; clue.regionSource = null;
  } else if (action === "exclude") {
    clue.region = null; clue.annotationStatus = "excluded"; clue.regionSource = null;
  }
  markDirty();
  if (action === "next") selectNextUnresolved();
  render();
}

function startBoxGesture(event) {
  const box = event.target.closest("[data-cue-id]");
  if (!box) return;
  event.stopPropagation();
  selectedCueId = box.dataset.cueId;
  const clue = currentCue();
  gesture = { type: event.target.matches("[data-resize]") ? "resize" : "move", clue, startX: event.clientX, startY: event.clientY, region: { ...clue.region } };
  box.setPointerCapture?.(event.pointerId);
  renderInspector();
}

function startDrawGesture(event) {
  if (event.target !== els.stage && event.target !== els.boxLayer) return;
  const clue = currentCue();
  if (!clue) return;
  const point = normalizedPoint(event);
  gesture = { type: "draw", clue, start: point };
  clue.region = { x: point.x, y: point.y, w: 0.001, h: 0.001 };
  clue.annotationStatus = "needs-review";
  clue.regionSource = "manual";
  markDirty();
}

function updateGesture(event) {
  if (!gesture) return;
  const rect = els.stage.getBoundingClientRect();
  if (gesture.type === "draw") {
    const point = normalizedPoint(event);
    gesture.clue.region = normalizedRegion({ x: Math.min(gesture.start.x, point.x), y: Math.min(gesture.start.y, point.y), w: Math.abs(point.x - gesture.start.x), h: Math.abs(point.y - gesture.start.y) });
  } else {
    const dx = (event.clientX - gesture.startX) / rect.width;
    const dy = (event.clientY - gesture.startY) / rect.height;
    const start = gesture.region;
    gesture.clue.region = gesture.type === "move"
      ? normalizedRegion({ ...start, x: start.x + dx, y: start.y + dy })
      : normalizedRegion({ ...start, w: start.w + dx, h: start.h + dy });
    gesture.clue.annotationStatus = "needs-review";
    gesture.clue.regionSource = "manual";
  }
  markDirty();
  renderBoxes(currentClueSet());
}

function endGesture() { if (gesture) { gesture = null; render(); } }
function normalizedPoint(event) { const rect = els.stage.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }; }
function normalizedRegion(region) { const x = clamp(region.x), y = clamp(region.y); return { x, y, w: Math.max(.002, Math.min(1 - x, region.w)), h: Math.max(.002, Math.min(1 - y, region.h)) }; }

async function saveCurrent() {
  const clueDocument = currentDocument();
  const response = await fetch(`/api/clues/${encodeURIComponent(clueDocument.locationId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clueDocument) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Unable to save clue document.");
  dirty = false;
  window.document.body.classList.remove("is-dirty");
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel("nautilus-clue-updates");
    channel.postMessage({ type: "clues-updated", locationId: clueDocument.locationId });
    channel.close();
  }
  showToast(`Saved ${clueDocument.locationId}.`);
}

function selectFirstUnresolved() {
  for (let d = 0; d < documents.length; d += 1) for (let s = 0; s < documents[d].clueSets.length; s += 1) {
    const cue = documents[d].clueSets[s].cues.find(isUnresolved);
    if (cue) { locationIndex = d; clueSetIndex = s; selectedCueId = cue.id; return; }
  }
}
function selectNextUnresolved() {
  const flattened = documents.flatMap((document, d) => document.clueSets.flatMap((set, s) => set.cues.map((cue) => ({ cue, d, s }))));
  const current = flattened.findIndex((item) => item.d === locationIndex && item.s === clueSetIndex && item.cue.id === selectedCueId);
  const next = [...flattened.slice(current + 1), ...flattened.slice(0, current + 1)].find((item) => isUnresolved(item.cue));
  if (next) { locationIndex = next.d; clueSetIndex = next.s; selectedCueId = next.cue.id; }
  else showToast("All clues have been reviewed or intentionally classified.");
}
function selectAdjacentCue(delta) { const cues = currentClueSet()?.cues ?? []; const index = cues.findIndex((cue) => cue.id === selectedCueId); selectedCueId = cues[(index + delta + cues.length) % cues.length]?.id ?? selectedCueId; render(); }
function isUnresolved(cue) { return ["pending-grounding", "needs-review", "not-grounded"].includes(cue.annotationStatus); }
function renderProgress() { const cues = documents.flatMap((document) => document.clueSets.flatMap((set) => set.cues)); const resolved = cues.filter((cue) => !isUnresolved(cue)).length; els.progress.textContent = `${resolved} / ${cues.length} classified · ${cues.length - resolved} unresolved`; }
function currentDocument() { return documents[locationIndex]; }
function currentClueSet() { return currentDocument()?.clueSets?.[clueSetIndex]; }
function currentCue() { return currentClueSet()?.cues?.find((cue) => cue.id === selectedCueId) ?? null; }
function markDirty() { dirty = true; document.body.classList.add("is-dirty"); }
function showToast(message, error = false) { els.toast.textContent = message; els.toast.style.borderColor = error ? "#ff7185" : ""; els.toast.hidden = false; window.setTimeout(() => { els.toast.hidden = true; }, 4000); }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
