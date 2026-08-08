import { createExplorer, loadCasesFromUrl } from "./api.js";
import { installMessageBridge } from "./message-bridge.js";

boot().catch((error) => {
  const root = document.querySelector("#app");
  if (root) {
    root.innerHTML = `
      <main class="fatal-error">
        <span>Visualization error</span>
        <h1>The explorer could not start.</h1>
        <pre>${escapeHtml(error instanceof Error ? error.message : String(error))}</pre>
      </main>
    `;
  }
  console.error(error);
});

async function boot() {
  const root = document.querySelector("#app");
  const params = new URLSearchParams(window.location.search);
  const dataUrl = params.get("data");
  const cases = await loadCasesFromUrl(
    dataUrl || "./data/generated/atlas-cases.json",
  );

  const api = createExplorer({
    root,
    cases,
    syncHash: params.get("syncHash") !== "false",
    mapOptions: {
      disableLeaflet: params.get("offline") === "1",
    },
  });

  window.geoEvidenceAtlas = api;

  const allowedOrigin = params.get("parentOrigin");
  const disposeBridge = installMessageBridge(api, {
    allowedOrigins: allowedOrigin
      ? [allowedOrigin]
      : [window.location.origin, ...(window.location.origin === "null" ? ["null"] : [])],
  });

  window.addEventListener(
    "pagehide",
    () => {
      disposeBridge();
    },
    { once: true },
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
