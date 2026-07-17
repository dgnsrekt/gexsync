# GexSync

A Chrome extension (Manifest V3) that keeps multiple [GEXbot](https://www.gexbot.com)
trading tabs in sync. Pick one of three modes — **Profiles**, **Ticker**, or
**Replay** — and GexSync mirrors that dimension across your open `/state` and
`/classic` tabs so you don't have to click every tab by hand.

No build step, no npm, no external services. It runs only on `gexbot.com` and
nothing ever leaves your browser.

## Install (Load unpacked)

GexSync isn't on the Chrome Web Store yet, so you load it from this repo:

1. **Get the files.** Either `git clone https://github.com/dgnsrekt/gexsync.git`,
   or click the green **Code** button on GitHub → **Download ZIP**, then unzip it.
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

Details for every mode and setting: [`knowledge/usage.md`](knowledge/usage.md).

## Is it safe?

Short version: yes, and you can check for yourself.

- It requests only the `storage` permission and only runs on `https://www.gexbot.com/*`.
- It makes **no external network requests** — all syncing happens locally through `chrome.storage.local`.
- Fonts are bundled in the repo; there is no build step, so every line is plain, readable source.

Full breakdown of permissions and how to audit it: [`knowledge/safety.md`](knowledge/safety.md).

## For AI agents

This repo ships a knowledge bundle in [`knowledge/`](knowledge/) written in
[OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
Point your agent at that directory (start at `knowledge/index.md`) to answer
install, usage, and safety questions from the source itself.

## License

[MIT](LICENSE).
