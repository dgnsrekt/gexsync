# GexSync

[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![No build step](https://img.shields.io/badge/build-none-brightgreen.svg)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
[![Latest release](https://img.shields.io/github/v/release/dgnsrekt/gexsync?label=release&color=16E0A3)](https://github.com/dgnsrekt/gexsync/releases/latest)
[![GitHub stars](https://img.shields.io/github/stars/dgnsrekt/gexsync?style=social)](https://github.com/dgnsrekt/gexsync/stargazers)

A Chrome extension (Manifest V3) that keeps multiple [GEXbot](https://www.gexbot.com)
trading tabs in sync. Pick one of three modes — **Profiles**, **Ticker**, or
**Replay** — and GexSync mirrors that dimension across your open `/state` and
`/classic` tabs so you don't have to click every tab by hand.

No build step, no npm, no dependencies. It runs only on `gexbot.com`, and syncing your
tabs happens entirely inside your browser — GexSync makes **no network requests at all**
unless you switch on one of the opt-in [chart data add-ons](knowledge/data-addons.md),
which are off by default.

## ▶ Watch the 30-second tour

[![GexSync — 30-second tour](docs/gexsync-promo.gif)](https://x.com/DGNSREKT/status/2078327126411907501)

*Click for the full video + a thread on how each mode works. Profiles, ticker, replay, and the opt-in data add-ons — the whole thing in half a minute.*

## Ask an AI instead

Rather read the answers than the docs? Copy the prompt below (hover the box and
click the copy icon) and paste it into ChatGPT, Claude, Gemini, or any AI that
can read a URL — it will answer from this repo's knowledge base.

```text
Read the knowledge base at https://github.com/dgnsrekt/gexsync/blob/master/knowledge/index.md (OKF v0.1 format — start at index.md). Then use the information to answer the following questions:

How do I install this Chrome extension?
What does it do, and is it safe?
```

## Install (Load unpacked)

GexSync isn't on the Chrome Web Store yet, so you load it from this repo:

1. **Get the files.** Download the latest packaged build — the
   `gexsync-vX.Y.Z.zip` on the
   [**Releases page**](https://github.com/dgnsrekt/gexsync/releases/latest) — and
   unzip it (you'll get a `gexsync/` folder). Prefer the source? `git clone
   https://github.com/dgnsrekt/gexsync.git`, or use the green **Code** button →
   **Download ZIP**.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `gexsync` folder (the one containing
   `manifest.json`).
5. Open a GEXbot `https://www.gexbot.com/state` or `/classic` tab and click the
   GexSync toolbar icon to pick a mode.

Full walkthrough, updating, and troubleshooting: [`knowledge/install.md`](knowledge/install.md).

## Using it

- **Profiles** — syncs GEX/options profiles across tabs; each tab keeps its own ticker.
- **Ticker** — syncs the ticker across state + classic tabs (with color groups); profiles stay independent.
- **Replay** — synchronized historical playback; one tab is master, the rest follow by time-of-day.

Plus **Group Shot** — one click on a chart's camera captures every synced pane into
a single ZIP (a stitched grid + each image + a manifest with the data date/time each
pane is showing).

Details for every mode and setting: [`knowledge/usage.md`](knowledge/usage.md).

## Chart data add-ons (opt-in, off by default)

Separately from syncing, the popup's **Data keys** page can pull outside data onto the
chart. These are the only features that touch the network, and each is switched on
individually:

- **Reddit buzz** — the current ticker's Reddit mention rank and 24h rank change. **No key
  or signup**; the toggle is the only gate.
- **Massive.com data** — company details (name, exchange, market cap). Needs **your own**
  [Massive.com](https://massive.com) API key; a **free** key is enough, and with no key
  saved the add-on makes no requests at all.
- **Previous-day levels** — the previous trading day's Open/High/Low/Close as labelled
  chart lines (`PDO`/`PDH`/`PDL`/`PDC`), each independently toggleable. Same key, follows
  replay, stocks & ETFs only.

The first two appear in a details panel that grows out of the bottom pill — hover the
ticker segment to peek, click to pin it open.

What each one requests and what a free key's limits mean:
[`knowledge/data-addons.md`](knowledge/data-addons.md).

## Is it safe?

Short version: yes, and you can check for yourself.

- It requests `storage`, `downloads` and `scripting`, and the only site it **runs on** is
  `https://www.gexbot.com/*`. `downloads` is used solely by Group Shot — when you click a
  chart's camera — to save its ZIP into a `Downloads/gexsync/` folder.
- **Syncing makes no network requests.** It happens locally through
  `chrome.storage.local`, and Group Shot builds its images and ZIP in your browser.
- **The add-ons are the only network access, and they're off until you turn them on.**
  Massive (`api.massive.com`) does nothing until you save your own API key; Reddit buzz
  (`apewisdom.io`) is keyless, so its toggle is the only gate. A Massive request carries
  the ticker and your key, nothing else; apewisdom.io is never told which ticker you're
  viewing, because the list it returns is matched locally.
- Every outbound request in the whole extension lives in `background.js` — three `fetch`
  call sites, two hosts. `content.js` has none, which is why your key never reaches a
  script running on the page.
- Fonts are bundled in the repo; there is no build step, so every line is plain, readable source.

Full breakdown of permissions and how to audit it: [`knowledge/safety.md`](knowledge/safety.md).

## For AI agents

This repo ships a knowledge bundle in [`knowledge/`](knowledge/) written in
[OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
Point your agent at that directory (start at `knowledge/index.md`) to answer
install, usage, and safety questions from the source itself.

## License

[MIT](LICENSE).
