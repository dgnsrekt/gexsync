---
type: Guide
title: Using GexSync
description: How the Profiles, Ticker, and Replay modes work, plus live zoom sync, panel-collapse sync, and the popup settings.
tags: [usage, profiles, ticker, replay, zoom, settings]
timestamp: 2026-07-22T00:00:00Z
---

# Using GexSync

Everything is driven from the GexSync popup — click the toolbar icon on a GEXbot
`state` or `classic` tab. The popup has **Global settings**, a **Mode** selector,
and a live **Current state** readout of which tabs are participating.

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

While a replay session is active the popup settings **lock** (a notice appears).
End the session by switching Mode off Replay, or hit **Exit** in the on-page
replay bar, to unlock them.

## Global settings

* **Cross-page scope** — whether `state` and `classic` tabs count as one pool or
  two. *All tabs* treats them together; *By page* keeps them separate. It governs
  both **panel-collapse sync** (side panels expand/collapse together) and **live
  zoom sync** (below). Works in every mode.
* **Add profile to chart watermark** — stamps the active profile name into the
  chart watermark so screenshots are self-labeling.
* **Live zoom sync** — when on, charts on the **same ticker** stay zoom-matched in
  real time (zoom or pan one, the rest follow) and each holds its zoom through
  GEXbot's periodic chart refresh — even on a single tab. Sync is keyed to the
  ticker, not the color group; the tab under your mouse is the authority, so your
  adjustment always wins. The pill's leading indicator reacts as you go
  (*master → setting… → synced →*). Off, each chart uses GEXbot's own zoom
  independently. *If a chart's zoom indicator ever snags, double-click the chart to
  reset it.*
* **Save / Recall zoom layout** — **Save** snapshots every open ticker's current
  zoom into one slot; **Recall** restores them all in one click. Works with or
  without live zoom sync.

## Current state

The popup's **Current state** section lists every participating tab
(`#id · group · ticker · page · profile`). Its **⧉ copy** button (or clicking the
list) puts a full plain-text snapshot — global settings, mode, and the whole tab
roster — on your clipboard, handy for sharing your setup or reporting an issue.

See [overview](overview.md) for the big picture and [safety](safety.md) for what
the extension can access while doing all this.
