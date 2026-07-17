---
type: Guide
title: Using GexSync
description: How the Profiles, Ticker, and Replay modes work, plus panel-collapse sync and the popup settings.
tags: [usage, profiles, ticker, replay, settings]
timestamp: 2026-07-17T00:00:00Z
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

* **Panel-collapse sync** — keeps side panels expanded/collapsed together.
  Scope it *By page* (state and classic tracked separately) or *All tabs*. Works
  in every mode.
* **Add profile to chart watermark** — stamps the active profile name into the
  chart watermark so screenshots are self-labeling.

See [overview](overview.md) for the big picture and [safety](safety.md) for what
the extension can access while doing all this.
