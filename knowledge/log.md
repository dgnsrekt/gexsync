# Knowledge base update log

## 2026-07-23 (v1.4.1)
* **Replay behavior fix**: documented that during a replay session only **Cross-page
  scope** and **Play tracking** lock now — watermark, Group screenshot, Debug, and
  **Live zoom sync** stay usable — and that Live zoom sync holds through a replay
  session (usage.md).

## 2026-07-23
* **Caught up to v1.4.0**: documented **Group Shot** (camera captures all synced
  panes → one ZIP with a stitched grid, per-pane images, and a manifest recording
  each pane's data date/time) in overview + usage; updated safety for the new
  **`downloads`** permission and the `shot.js` + `background.js` files, keeping the
  "no external network requests" guarantee (images/ZIP are built in-browser).

## 2026-07-22
* **Caught up to v1.3.0**: documented **live zoom sync** and **Save / Recall zoom
  layout** in overview + usage; renamed "Panel-collapse sync" to **Cross-page
  scope** (now governs panel-collapse *and* zoom); added the **Copy full state**
  button; expanded safety's "what it reads" and audit list to cover the two
  page-context helpers (`replaydata.js`, `zoom.js`).

## 2026-07-17
* **Initialization**: Created the OKF v0.1 knowledge bundle for GexSync — overview, install, usage, and safety concepts.
