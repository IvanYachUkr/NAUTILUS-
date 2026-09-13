import { buildStreetViewUrl } from "./geo.js";

export function walkHereUrl(caseItem) {
  if (!caseItem) return null;

  try {
    return buildStreetViewUrl(caseItem.startingView ?? caseItem.groundTruth);
  } catch {
    return null;
  }
}

export function mapsEmbedUrl(caseItem, apiKey, mode = "streetview") {
  if (!caseItem || typeof apiKey !== "string" || !apiKey.trim()) return null;
  if (!["streetview", "view"].includes(mode)) return null;

  try {
    const source = new URL(walkHereUrl(caseItem));
    const url = new URL(`https://www.google.com/maps/embed/v1/${mode}`);
    url.searchParams.set("key", apiKey.trim());
    const position = source.searchParams.get("viewpoint");
    if (mode === "view") {
      url.searchParams.set("center", position);
      url.searchParams.set("zoom", "16");
    } else {
      // Keep coordinates as a fallback when Google retires a panorama ID.
      url.searchParams.set("location", position);
      for (const name of ["pano", "heading", "pitch", "fov"]) {
        if (source.searchParams.has(name)) {
          url.searchParams.set(name, source.searchParams.get(name));
        }
      }
    }
    return url.href;
  } catch {
    return null;
  }
}

export function streetViewMarkup() {
  return `
    <dialog class="street-view-dialog" data-street-view-dialog aria-label="Explore this location">
      <header class="street-view-header">
        <div>
          <span class="street-view-eyebrow">Explore the location</span>
          <h2 data-street-view-title></h2>
        </div>
        <button type="button" data-street-view-close autofocus aria-label="Close Street View">
          <i class="ph ph-x" aria-hidden="true"></i><span>Close</span>
        </button>
      </header>
      <div class="street-view-toolbar">
        <div class="street-view-modes" role="group" aria-label="Google Maps view">
          <button type="button" data-street-view-mode="streetview" aria-pressed="true">Street View</button>
          <button type="button" data-street-view-mode="view" aria-pressed="false">Map</button>
        </div>
        <button type="button" data-street-view-reset>Back to start</button>
        <a data-street-view-external target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
      </div>
      <iframe class="street-view-frame" data-street-view-frame title="Google Street View"
        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      <p class="street-view-caption">Explore from the benchmark starting point. Google imagery may have changed since the recorded run. If Street View is unavailable, switch to Map.</p>
    </dialog>`;
}

export function createStreetViewController(root, apiKey) {
  const dialog = root.querySelector("[data-street-view-dialog]");
  const frame = dialog.querySelector("[data-street-view-frame]");
  const trigger = root.querySelector("[data-walk-here]");
  const title = dialog.querySelector("[data-street-view-title]");
  const external = dialog.querySelector("[data-street-view-external]");
  const modes = [...dialog.querySelectorAll("[data-street-view-mode]")];
  let selectedCase = null;

  function load(mode = "streetview") {
    const url = mapsEmbedUrl(selectedCase, apiKey, mode);
    if (!url) return false;
    frame.title = `${mode === "view" ? "Google Map" : "Google Street View"} — ${selectedCase.city}, ${selectedCase.country}`;
    frame.src = url;
    for (const button of modes) {
      button.setAttribute("aria-pressed", String(button.dataset.streetViewMode === mode));
    }
    return true;
  }

  function unload() {
    frame.removeAttribute("src");
  }

  function onClick(event) {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;
    if (button === trigger) {
      const externalUrl = walkHereUrl(selectedCase);
      if (!externalUrl) return;
      if (load()) {
        title.textContent = `${selectedCase.city}, ${selectedCase.country}`;
        dialog.showModal();
      } else {
        window.open(externalUrl, "_blank", "noopener,noreferrer");
      }
    } else if (button.hasAttribute("data-street-view-close")) {
      dialog.close();
    } else if (button.hasAttribute("data-street-view-mode")) {
      load(button.dataset.streetViewMode);
    } else if (button.hasAttribute("data-street-view-reset")) {
      load();
    }
  }

  root.addEventListener("click", onClick);
  dialog.addEventListener("close", unload);

  return {
    setCase(caseItem) {
      if (caseItem?.id !== selectedCase?.id) {
        if (dialog.open) dialog.close();
        unload();
      }
      selectedCase = caseItem;
      const externalUrl = walkHereUrl(caseItem);
      trigger.hidden = !externalUrl;
      if (externalUrl) external.href = externalUrl;
      else external.removeAttribute("href");
    },
    destroy() {
      if (dialog.open) dialog.close();
      unload();
      root.removeEventListener("click", onClick);
      dialog.removeEventListener("close", unload);
    },
  };
}
