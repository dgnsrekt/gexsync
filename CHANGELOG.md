# Changelog

All notable changes to GexSync are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

## [1.6.0] — 2026-07-24

### Added
- **Show days to expiry (DTE)** (popup toggle, off by default; rides on the
  watermark, so it's disabled when the watermark is off). With it on, the chart
  watermark appends the selected profile's DTE — **latest**/**next** show
  `{n}DTE` (e.g. `VIX NEXT 12DTE`), and **90d** shows `(AGG)` since it has no
  single expiry. DTE counts from the chart's own **update date** to the expiry
  in the profile button, so it **follows replay** — a tab parked on a past day
  shows that day's DTE, not today's. Each tab computes its own; nothing syncs.

## [1.5.0] — 2026-07-24

### Added
- **Sync settings navigation** (popup toggle, off by default). With it on, opening
  the **Settings** panel and moving between **Alerts**, **Alerts History**, and
  **Home** mirrors across your synced tabs — click the gear on one chart and the
  others open Settings too. Follows **Cross-page scope** (state & classic as one
  pool or two). Off, each tab's Settings panel is independent, as before.

## [1.4.1] — 2026-07-23

### Fixed
- **Live zoom sync now works during a replay session.** Pan or zoom one chart and
  same-ticker charts follow, held through replay's redraws — it was previously
  suppressed while replay was active. Toggling Live zoom sync off mid-replay clears
  the hold and frees the chart to replay's natural range.
- **Fewer settings lock during replay.** Only the two that reshape a running session —
  **Cross-page scope** and **Play tracking** — stay locked. **Watermark**, **Group
  screenshot**, **Live zoom sync**, and the master/client **Debug** readout are now
  adjustable mid-replay (they were incorrectly disabled).

## [1.4.0] — 2026-07-23

### Added
- **Group Shot.** Turn on *Group screenshot* (popup) and a chart's **camera** button
  captures **every synced pane at once** instead of one chart, downloading a single
  ZIP to `Downloads/gexsync/`. Inside: `grid.png` (all panes stitched into one
  captioned image), the individual pane images, and a `manifest.json`. Each pane
  records the **data's** date/time — the latest point in live, the parked point in
  replay — so a shot taken today of last week's replay is labeled with last week's
  timestamps. Panels briefly collapse so each chart captures full-width. Off, the
  camera behaves as GEXbot's normal single-shot menu.

### Changed
- **New permission: `downloads`.** Used only by Group Shot, and only when you click
  the camera, to save its ZIP into a `Downloads/gexsync/` subfolder (a plain link
  download can't create one). GexSync still makes **no network requests** — the
  images and ZIP are built entirely in your browser. See
  [`knowledge/safety.md`](knowledge/safety.md).

## [1.3.0] — 2026-07-22

### Added
- **Live zoom sync.** Turn it on (popup) and same-ticker charts stay zoom-matched
  in real time — zoom one, the rest follow — and each chart **holds its zoom
  through GEXbot's ~5-minute refresh** (works even on a single tab). Ticker-scoped;
  the tab under your mouse is the authority, so your adjustment always wins. This
  answers the two most-asked GEXbot requests: "remember my zoom per ticker" and
  "stop the refresh from resetting it." *(If the pill's state indicator ever hangs
  on "setting…", double-click the chart to reset its zoom.)*
- **Save / Recall zoom layout.** One click snapshots every open ticker's current
  zoom; one click restores them all. Works with or without Live sync.
- **Live-zoom state on the mode pill.** With Live sync on, the pill's leading loop
  glyph reacts to your gesture — *master* → *setting…* (the glyph spins) → *synced →*
  — and shows *← synced* when a peer's zoom arrives.
- **Copy full state.** A ⧉ copy button on the *Current state* section puts a
  complete snapshot (settings, mode, per-tab roster incl. color group) on the
  clipboard.

### Changed
- **"Panel-collapse sync" is now "Cross-page scope."** It governs whether state and
  classic count as one pool or two — for panel-collapse **and** live zoom sync.

## [1.2.0] — 2026-07-21

### Changed
- **Replay loads near-instantly and calibrates in parallel.** Joining a replay
  session used to make each tab reverse-engineer its time map by scrubbing the
  slider dozens of times — a redraw-heavy step that had to run one tab at a time
  (a shared lock) to avoid freezing the browser, so a group loaded slowly, pane by
  pane. GexSync now reads GEXbot's already-loaded replay data directly and builds
  each tab's time map from it instantly — no scrubbing, no redraws, no cross-tab
  lock. Every pane is ready the moment its history arrives, all at once, and the
  map is exact to the second so seeks and follow land dead-on. (The old scrub
  method stays as an automatic fallback.)
- **Panel-collapse now defaults to "All tabs."** A fresh install previously
  defaulted the panel-collapse scope to "By page"; it now defaults to "All tabs"
  (existing settings are unchanged).

## [1.1.0] — 2026-07-20

### Changed
- **Ticker sync is now instant.** GEXbot fixed the bug where an in-place ticker
  change didn't draw the intraday price line, so Ticker mode no longer full-reloads
  each tab. Followers switch via an in-app hash change and the chart — price line
  and all — updates live with no reload. A group that used to reload one tab at a
  time now updates all at once and near-instantly — roughly 8× faster in testing
  (exact numbers vary with tab count and time of day). This retires the reload
  lock, the per-tab reload serialization, and the "tabs are updating — please
  wait" overlay.

### Added
- **Sync confirmation flash.** With the reload gone, a live ticker switch had no
  feedback. A brief "syncing \<group\> to \<ticker\>" card now flashes on every
  group tab (auto-dismisses, never blocks clicks) — the same lightweight indicator
  the spot↔futures flip already uses.
- **Self-healing on stuck loads.** A fresh full-page load of a synced tab (F5 /
  reopen) can occasionally leave GEXbot's chart blank — "No data to display", or
  gex bars with no price line. Tabs now detect this on load and fix it in place: a
  quick profile re-apply (escalating to a brief ticker bounce only if needed)
  redraws the chart within a few seconds, keeping the tab's own ticker and profile.
  No reload, no manual poke.
- **Watermark hint on Settings/Alerts.** When a tab sits on Settings, Alerts, or
  Alert History there's no chart profile, so the watermark reads `TICKER ?`.
  Hovering the `?` now explains why and points to the panel's home icon to return
  to the chart.

## [1.0.3] — 2026-07-20

### Fixed
- **Chart watermark now shows the profile on futures-converted tickers.** In
  es-future mode GEXbot renders the watermark as the full contract (e.g.
  `NDX⇒NQU6`), which didn't match the spot symbol, so the `LATEST` / `NEXT` /
  `90 DAYS` tag was dropped. The matcher now handles the contract form and
  appends the profile (`NDX⇒NQU6 NEXT`) without clobbering the contract month.
  (Thanks to Moby16 for the report.)

## [1.0.2] — 2026-07-20

### Fixed
- **Spot ↔ futures now syncs for every convertible ticker, not just SPX.** GEXbot
  labels the toggle by product — `es future`, `nq future`, `rty future`,
  `ym future`, `gc future`, `cl future` — so the previous hardcoded "es future"
  match only reached SPX/SPY. The follower now finds the future button
  generically, so NDX, RUT, QQQ, DIA, IWM, GLD, and USO sync too.

### Added
- **Spot ↔ futures sync overlay.** A brief, auto-dismissing card ("syncing
  \<group\> · spot price → \<product\> future") now flashes on every group tab
  when the toggle syncs, matching the ticker-sync flow even though the change
  applies live with no reload.

## [1.0.1] — 2026-07-20

### Fixed
- **Spot / ES-future toggle now syncs.** GEXbot models "es future" by renaming
  the ticker (`SPX` → `SPX⇒ES`), which previously tripped ticker-sync into
  full-reloading the group and only worked classic-to-classic by luck. Ticker
  sync now keys off the base underlying, and spot/es is synced as its own
  ticker-axis in Ticker mode — applied live with no reload and safe across
  `/classic` and `/state`.
- **UI no longer bleeds onto other pages.** GEXbot is a single-page app, so
  navigating to `/research`, `/api`, `/pricing`, etc. left the injected mode
  chip and replay bar on screen and kept the tab counted in its color group. Off
  `/classic` and `/state` a tab now hides its chip, bar, and overlays and drops
  its group presence, restoring everything on return.
- **Replay blocks es-future conversions.** GEXbot disables deep history for
  converted tickers (FAQ #41); our replay load bypassed that lock and pulled the
  wrong data. The "Start replay session?" review now flags any converted tab,
  warns to switch it back to spot price, and disables **Confirm & load** until
  every tab is off es-future.

## [1.0] — 2026-07-17

### Added
- Initial public release.
- **Profiles mode** — mirror the gex/options profile (90d / latest / next),
  greek toggles, and settings-panel collapse across GEXbot tabs; tickers stay
  independent.
- **Ticker mode** — sync the ticker across same-color tab groups while each tab
  keeps its own profile; per-tab color groups keep independent sets apart.
- **Replay mode** — drive the replay transport (play/pause, scrub, speed, 30s
  jumps) in lockstep across tabs from a master, with per-tab role locking, a
  pre-load review, and calibration. Data stays per-tab, so you can compare
  different dates, tickers, and profiles side by side.
- Bundled README, LICENSE, and OKF knowledge base.

[1.6.0]: https://github.com/dgnsrekt/gexsync/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/dgnsrekt/gexsync/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/dgnsrekt/gexsync/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/dgnsrekt/gexsync/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/dgnsrekt/gexsync/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/dgnsrekt/gexsync/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dgnsrekt/gexsync/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/dgnsrekt/gexsync/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/dgnsrekt/gexsync/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dgnsrekt/gexsync/compare/v1.0...v1.0.1
[1.0]: https://github.com/dgnsrekt/gexsync/releases/tag/v1.0
