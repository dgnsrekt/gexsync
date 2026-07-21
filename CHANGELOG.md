# Changelog

All notable changes to GexSync are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

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

[1.1.0]: https://github.com/dgnsrekt/gexsync/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/dgnsrekt/gexsync/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/dgnsrekt/gexsync/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dgnsrekt/gexsync/compare/v1.0...v1.0.1
[1.0]: https://github.com/dgnsrekt/gexsync/releases/tag/v1.0
