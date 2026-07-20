# Changelog

All notable changes to GexSync are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

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

[1.0.1]: https://github.com/dgnsrekt/gexsync/compare/v1.0...v1.0.1
[1.0]: https://github.com/dgnsrekt/gexsync/releases/tag/v1.0
