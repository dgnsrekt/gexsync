---
type: Overview
title: What GexSync is
description: A Manifest V3 Chrome extension that syncs GEXbot trading tabs across profiles, tickers, or historical replay.
tags: [overview, gexbot, chrome-extension, mv3]
timestamp: 2026-07-22T00:00:00Z
---

# What GexSync is

GexSync is a Chrome extension (Manifest V3) for traders who keep several
[GEXbot](https://www.gexbot.com) tabs open at once. Instead of clicking the same
control in every tab, you pick a sync mode in the GexSync popup and the
extension mirrors that one dimension across all your open GEXbot tabs.

It runs only on the GEXbot `state` and `classic` pages
(`https://www.gexbot.com/state*` and `https://www.gexbot.com/classic*`) and is
dependency-free with no build step — the source files load directly into Chrome.

## The three modes

Exactly one mode syncs at a time; you switch between them from the popup.

* **Profiles** — syncs the GEX and options profiles (e.g. 90-day / latest / next)
  across tabs. Each tab keeps its own ticker.
* **Ticker** — syncs the ticker symbol across `state` and `classic` tabs that
  share a color group. Profiles stay independent per tab.
* **Replay** — synchronized historical playback. One tab is the master and the
  others follow it, aligned by time-of-day, so you can compare the same
  instrument across dates or different instruments on the same date.

Two cross-cutting features work alongside whichever mode is active: **panel-collapse
sync** (expanding/collapsing side panels together) and **live zoom sync** (charts on
the same ticker stay zoom-matched in real time and hold their zoom through GEXbot's
periodic refresh; a Save/Recall pair snapshots and restores your zoom layout). A
single **Cross-page scope** setting decides whether `state` and `classic` tabs are
treated as one pool or kept separate for both.

See [usage](usage.md) for how to drive each mode, [install](install.md) to set
it up, and [safety](safety.md) for what it can and cannot access.
