---
type: Guide
title: Installing GexSync
description: Load the unpacked extension into Chrome from a local clone, update it, and troubleshoot common issues.
tags: [install, chrome, load-unpacked, update, troubleshooting]
timestamp: 2026-07-17T00:00:00Z
---

# Installing GexSync

GexSync is not on the Chrome Web Store, so you install it as an "unpacked"
extension straight from this repository. There is no build step — the files you
download are the files Chrome runs.

## Steps

1. **Get the files.** Either:
   * clone with git: `git clone https://github.com/dgnsrekt/gexsync.git`, or
   * on the GitHub page click the green **Code** button → **Download ZIP**, then
     unzip it somewhere you'll keep it (don't install from a temporary folder —
     if you delete it, the extension breaks).
2. Open Chrome and navigate to `chrome://extensions`.
3. Turn on **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and choose the `gexsync` folder — the one that
   contains `manifest.json`.
5. GexSync appears in your extensions list and its icon in the toolbar. Open a
   GEXbot page (`https://www.gexbot.com/state` or `/classic`) and click the
   GexSync icon to choose a mode.

## Updating

When a new version lands:

1. Update your local copy — `git pull` in the folder, or download a fresh ZIP
   and replace the files.
2. Go to `chrome://extensions` and click the **reload** (circular arrow) icon on
   the GexSync card.
3. Reload any already-open GEXbot tabs so they pick up the new content scripts.

## Troubleshooting

* **The icon does nothing / no sync happens.** GexSync only activates on
  `https://www.gexbot.com/state*` and `/classic*` pages. On any other site it is
  intentionally idle.
* **Just installed but an open GEXbot tab isn't syncing.** Reload that tab.
  Content scripts only inject on page load, so tabs open from before the install
  need a refresh.
* **After an update, behavior looks stale.** You skipped step 2 or 3 above —
  reload the extension, then reload the GEXbot tabs.
* **"Load unpacked" is greyed out or missing.** Developer mode isn't on (step 3).

See [safety](safety.md) for exactly what the extension can access, and
[usage](usage.md) for what to do once it's installed.
