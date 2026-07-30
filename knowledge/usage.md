---
type: Guide
title: Using GexSync
description: How the Profiles, Ticker, and Replay modes work, plus live zoom sync, panel-collapse sync, and the popup settings.
tags: [usage, profiles, ticker, replay, zoom, settings]
timestamp: 2026-07-23T00:00:00Z
---

# Using GexSync

Everything is driven from the GexSync popup — click the toolbar icon on a GEXbot
`state` or `classic` tab. The popup has two pages, picked with the selector at the top:

* **Sync** — **Global settings** and the **Mode** selector.
* **Data keys** — the opt-in [chart data add-ons](data-addons.md), off by default.

Below both sits a live **Current state** readout of which tabs are participating.

Exactly one sync mode is active at a time. Panel-collapse sync runs in all modes.

## Modes

### Profiles (default)
Syncs the GEX and options profiles across your open GEXbot tabs, by page. When
you change a profile in one tab, the others follow. Each tab keeps its **own**
ticker, so you can watch different instruments with the same profile settings.

### Ticker
Syncs the **ticker symbol** across `state` and `classic` tabs that share a color
group; profiles stay independent. Color groups (green, red, blue, yellow,
purple, cyan, orange, pink) let you split your tabs into separate synchronized
channels — tabs in the green group sync their ticker together, tabs in the red
group sync separately, and so on.

### Replay
Synchronized historical playback across tabs with explicit roles:

1. In each tab, set its ticker and date, then load the history.
2. Pick one tab as the **master**; the others join as **clients**.
3. Clients follow the master aligned by **time-of-day**, so you can compare the
   same instrument across different dates, or different instruments on the same
   date, all scrubbing together.

Replay has two settings in the popup:
* **Play tracking** — *Heartbeat* (master pushes the current time roughly every
  2s, tightest sync) or *On pause* (resync only when playback pauses, quieter).
* **Debug** — shows each tab's master/client role in the on-page pill.

While a replay session is active, only the two settings that would reshape the
running session **lock** (a notice appears): **Cross-page scope** and **Play
tracking**. Everything else stays usable mid-replay — watermark, **Group
screenshot**, **Live zoom sync**, and **Debug**. End the session by switching Mode
off Replay, or hit **Exit** in the on-page replay bar.

## Global settings

* **Cross-page scope** — whether `state` and `classic` tabs count as one pool or
  two. *All tabs* treats them together; *By page* keeps them separate. It governs
  both **panel-collapse sync** (side panels expand/collapse together) and **live
  zoom sync** (below). Works in every mode.
* **Add profile to chart watermark** — stamps the active profile name into the
  chart watermark so screenshots are self-labeling.
* **Show days to expiry (DTE)** — appends the selected profile's DTE to that watermark:
  **latest**/**next** show `{n}DTE` (e.g. `VIX NEXT 12DTE`), **90d** shows `(AGG)` since
  it spans many expiries. Counted from the chart's own update date, so it **follows
  replay**. Rides on the watermark, so it's disabled when the watermark is off, and each
  tab computes its own — nothing syncs.
* **Sync settings navigation** — with it on, opening the **Settings** panel and moving
  between **Alerts**, **Alerts History** and **Home** mirrors across your synced tabs.
  Follows **Cross-page scope**. Off, each tab's Settings panel is independent.
* **Sync chart settings** — mirrors the Settings panel's **Chart Type** (Line/Candles),
  **Profile Alignment** (Left/Center/Right) and **Time Zone** across tabs, following
  **Cross-page scope**. GEXbot only renders those controls while the Settings panel is
  open, so this syncs **only while every in-scope tab has Settings open**: a colored box
  marks the synced section (one color for all-tabs, distinct state/classic colors for
  by-page), and when panels are missing an `N/M panels open` hint shows why it's waiting.
  The tab where you click a control is the authority. Nothing is stored — it's a live
  mirror, like panel-collapse sync.
* **Live zoom sync** — when on, charts on the **same ticker** stay zoom-matched in
  real time (zoom or pan one, the rest follow) and each holds its zoom through
  GEXbot's periodic chart refresh — even on a single tab, **and during a replay
  session** (your framing holds while you scrub). Sync is keyed to the ticker, not
  the color group; the tab under your mouse is the authority, so your adjustment
  always wins. The pill's leading indicator reacts as you go
  (*master → setting… → synced →*). Off, each chart uses GEXbot's own zoom
  independently. *If a chart's zoom indicator ever snags, double-click the chart to
  reset it.*
* **Save / Recall zoom layout** — **Save** snapshots every open ticker's current
  zoom into one slot; **Recall** restores them all in one click. Works with or
  without live zoom sync.
* **Group screenshot** — when on, it changes what GEXbot's chart **camera** button
  does: instead of shooting one chart, clicking it captures **every synced pane at
  once** and downloads a single ZIP to `Downloads/gexsync/`. Inside: `grid.png`
  (all panes stitched into one image, each captioned with its ticker/page/profile
  and the date/time of the data shown), the individual pane images, and a
  `manifest.json` describing each. Crucially, each pane records the **data's**
  date/time — in live that's the latest point, in replay it's whatever that tab is
  parked on — so a shot taken today of a replay from last week is labeled with last
  week's timestamps. Panels briefly collapse so each chart is captured full-width.
  Off, the camera works as GEXbot's normal single-shot menu.

## Chart tools — trigger & draw modes

The bottom pill has a **tool button** (a crosshair-circle icon, just after the loop mark).
Clicking it **cycles** `off → trigger → draw → off`, and the mode is **global** — it turns
on for every open GEXbot pane at once.

### Trigger mode

The button glows **amber**. Trigger mode is for reading prices and managing lines:

* An amber **reticle** (crosshair + a small ring + a price tag) tracks your cursor over the
  chart, so you can read the exact price at any point.
* The chart's **pan and zoom lock** while armed — a stray drag, scroll, or double-click
  can't move or reset it. A **"zoom locked"** badge shows in the top-left. Left-click does
  nothing; leaving trigger mode restores normal pan/zoom.
* Arming is **global**: it turns on for every open GEXbot pane at once.

While armed, **right-click the chart** for the action menu:

* **Copy price** — the price under the cursor, to your clipboard.
* **Add line here** — drops a horizontal line at that price (per-ticker, persists across
  reloads, shows on every chart of that ticker). Right-click *on* a line instead → **Remove
  line**.
* **Add to / Remove from watchlist** — the chart's ticker, the same watchlist the pill's
  cycle arrows step through.
* **Clear lines** — removes all of the current ticker's lines.

### Draw mode

Click the button again and it glows **blue** — draw mode. Same locked chart + reticle, but now
**left-drag on the chart paints** a stroke:

* **Freehand** or **straight arrow** — switch the tool from the right-click menu.
* Drawings are anchored to **time-of-day + price**. Because GEXbot shows one day at a time, a
  mark drawn at, say, 11:00 shows at the **11:00 slot every day**, across every DTE package
  (latest / next / 90d), and tracks zoom, pan, and replay.
* Choose where each drawing lives with the menu's **Scope** — **global** (every chart of the
  ticker), **page** (this ticker on classic *or* state), or **tab** (just this tab, cleared when
  you close it). The badge shows the active scope. The menu also has **Undo last** and a
  scope-aware **Clear** (they act on the active scope only).

### Colors & switching

* **Colors** — the popup's **Tools** page gives each mode one color, picked from your group
  palette: Trigger tints its reticle, price guide, and lines; Draw tints its reticle and strokes.
  Change one and everything in that mode recolors live. The two can't be the same.
* **Switch from the menu** — the right-click menu has **Off** and the **other mode**, so you can
  jump Trigger ⇄ Draw or turn the tools off without cycling the pill.

With the tool button off, right-click gives you the browser's normal menu back.

## Data keys — the chart add-ons

The popup's second page holds the add-ons that pull in **outside** data, as opposed to
syncing your own tabs. They are **all off by default**:

* **Reddit buzz** — the current ticker's Reddit mention rank. No key, no signup; the
  toggle is the only gate.
* **Massive.com data** — company details (name, exchange, market cap) for the current
  ticker. Paste your own [Massive.com](https://massive.com) API key; a **free** key
  covers it, and with no key saved nothing is requested at all.
* **Previous-day levels** — draws the previous trading day's Open/High/Low/Close as
  labelled lines (`PDO`/`PDH`/`PDL`/`PDC`), each independently toggleable, with the label
  position selectable. Uses the same Massive key and follows replay. Stocks & ETFs only.

The first two show up in a details panel that grows out of the **bottom pill**: hover the
pill's ticker segment to peek, **click** it to pin the panel open, **Esc** to close. If a
source is failing, an amber dot appears on that segment and the panel explains why.

Full detail — what each request contains, what a free key's limits mean in practice, and
every message you might see: [data-addons](data-addons.md).

## Current state

The popup's **Current state** section lists every participating tab
(`#id · group · ticker · page · profile`). Its **⧉ copy** button (or clicking the
list) puts a full plain-text snapshot — global settings, mode, and the whole tab
roster — on your clipboard, handy for sharing your setup or reporting an issue.

See [overview](overview.md) for the big picture, [data-addons](data-addons.md) for the
opt-in outside-data features, and [safety](safety.md) for what the extension can access
while doing all this.
