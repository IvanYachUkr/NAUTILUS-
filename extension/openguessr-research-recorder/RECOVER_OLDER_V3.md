# Recover an in-progress round from the older v3 extension

Use this **before** replacing, reloading, disabling, or removing the older
extension.

## First choice: use the old popup

Open the popup while the OpenGuessr tab is active.

- If it says **Recording round ...**, click **Finalize current round**. This ends
  the buffered round and sends it to the collector. If the collector is not
  running, the extension uses its download fallback.
- Do not click **Reset tab session** first.

## Export the raw extension storage without finalizing

This captures the old session buffer exactly as it exists and does not change the
round.

1. Keep the OpenGuessr tab open.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Find **OpenGuessr Research Round Recorder**.
5. Click the **service worker** link under **Inspect views**.
6. Paste the following whole block into the Console and press Enter:

```js
(async () => {
  const sessionState = chrome.storage.session
    ? await chrome.storage.session.get(null)
    : {};
  const localState = await chrome.storage.local.get(null);
  const snapshot = {
    exportType: "openguessr-v3-emergency-storage-export",
    exportedAt: new Date().toISOString(),
    sessionState,
    localState,
  };
  const stamp = snapshot.exportedAt
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const downloadId = await chrome.downloads.download({
    url:
      "data:application/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(snapshot, null, 2)),
    filename:
      `openguessr-research-recordings/diagnostics/${stamp}__v3-storage-state.json`,
    saveAs: true,
    conflictAction: "uniquify",
  });
  console.log("Recorder state exported. Download ID:", downloadId, snapshot);
})();
```

The downloaded JSON normally contains one or more keys beginning with:

```text
ogrr-tab-state:
```

A key whose `currentRound` is non-null contains the buffered samples. If every
state has `currentRound: null`, the old extension never detected the NMPZ scene;
that round cannot be reconstructed from the old recorder buffer. The new
extension adds a page probe and NMPZ fallback specifically for this case.
