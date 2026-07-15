# Repository Guidelines

## Project Structure & Module Organization

This repository is a small, dependency-free Chrome Manifest V3 extension. `manifest.json` defines permissions, the popup, and content-script injection for GEXbot pages. `content.js` synchronizes profiles, tickers, panel state, and tab overlays through `chrome.storage.local`. `replay.js` owns replay transport synchronization and calibration. `popup.html` provides the extension UI, with behavior in `popup.js`. Keep browser-facing assets at the repository root unless the project grows enough to justify directories.

## Build, Test, and Development Commands

There is no package manager or build step. Load the source directly in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository.
3. After edits, click the extension's reload button, then reload open GEXbot tabs so their content scripts are refreshed.

Use `git diff --check` before committing to catch whitespace errors. Validate `manifest.json` with `python -m json.tool manifest.json >/dev/null` when changing extension metadata.

## Coding Style & Naming Conventions

Use plain JavaScript, HTML, and browser APIs; do not add dependencies for behavior the platform already provides. Match the existing two-space indentation, semicolons, double-quoted strings, and concise arrow functions. Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for fixed keys or timing constants, and descriptive storage keys prefixed with `gexsync` or `replay`. Keep page-specific DOM queries and synchronization logic close to their consumers. Guard Chrome API access because reloaded extensions can leave orphaned content scripts.

## Testing Guidelines

No automated test suite or coverage threshold currently exists. Manually test all affected modes—Profiles, Ticker, and Replay—across both `/state` and `/classic` tabs. Check single-tab and multi-tab behavior, popup settings persistence, extension reloads, and tabs with different ticker groups. Include exact reproduction and verification steps in the pull request.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-style subjects such as `Add loading overlay during a group ticker sync`. Keep each commit focused on one observable change. Pull requests should explain the user-facing behavior, list manual test cases, and note affected modes/pages. Link relevant issues and include screenshots or a short recording for popup or overlay changes.
