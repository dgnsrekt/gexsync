# Knowledge base update log

## 2026-07-25 (chart data add-ons)
* **New concept: [data-addons](data-addons.md)** — the opt-in outside-data features
  (Massive.com company details, previous-day OHLC levels, Reddit mention rank), what each
  one needs, what a free key's limits mean in practice, and every failure message a user
  might see. Linked from index, overview and usage.
* **Rewrote safety's network section for accuracy.** The old "makes no external network
  requests" claim was no longer true. It now states the real contract: **zero** outbound
  requests until you switch an add-on on, then names each host, what each request
  contains, and — importantly — that the two add-ons are gated **differently**. Massive
  is inert until you save your own key; Reddit buzz has no key, so its toggle is the only
  gate. Also documented that apewisdom.io is never told which ticker you're viewing
  (the list is matched locally).
* **Corrected safety's storage and audit sections**: documented that the Massive API key
  sits in `chrome.storage.local` in plain text (and that fetched market data is only ever
  cached in memory), added `pdlines.js` to the auditable page-context helpers, and fixed
  the audit list, which still claimed `background.js` made no network calls when it is
  now the extension's entire network surface — three `fetch` call sites, two hosts.
* **Caught usage up three releases**: **Sync chart settings** (v1.7.0), **Show days to
  expiry (DTE)** (v1.6.0) and **Sync settings navigation** (v1.5.0) had all shipped
  without ever reaching the knowledge base — v1.7.0 existed only in the CHANGELOG. Also
  documented the two-page popup and the pill's hover/pin details panel.

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
