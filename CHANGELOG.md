# Changelog

All notable changes to GexSync are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

## [1.18.0] — 2026-08-05

### Added
- **Español — the on-page chart UI now speaks Spanish too.** Following the popup toggle in 1.17.0,
  the injected on-page interface now follows the same **EN | ES** setting: the mode pill and its
  ticker-details panel (including the Massive·Reddit enrichment), the right-click **Line / Draw**
  tool menu, the **replay** transport bar (roster, the review + exit dialogs, and the panel-lock
  notice), and the **TradingView GEX pill** (alert toasts, level tooltips, and the quick-toggles).
  Flipping the language in the popup updates every open GEXbot and TradingView tab live. Proper nouns
  still stay English so they match the chart — GEXbot, TradingView, the tier names
  (Classic/State/Orderflow/Quant), the GEX level names (Zero Gamma, Major ±Vol), the package labels
  (latest/next/90d), and units (DTE). This completes the localization started in 1.17.0.

## [1.17.0] — 2026-08-05

### Added
- **Español — a language toggle for the popup.** A new **EN | ES** switch in Sync → Global settings
  flips the entire popup between English and Spanish — every setting label, description, button, and
  placeholder. Your choice is saved (in `gexsync-cfg`) and defaults to your browser's language the
  first time. Proper nouns stay put on purpose so they match the chart: GEXbot, TradingView, the tier
  names (Classic/State/Orderflow/Quant), the level names (Zero Gamma, Major ±Vol), the package labels
  (Latest/Next/90 Days), and time units. The on-page chart UI (the pill, right-click menus, TV overlay)
  stays English for now — localizing it is the next step. Under the hood, a small shared `i18n.js`
  string table is bundled (and loaded by the content scripts) so that follow-up is a clean swap.

## [1.16.1] — 2026-08-04

### Fixed
- **Popup no longer stretches extra-wide.** The popup had a `min-width` floor but no ceiling, so the
  non-wrapping **Current state · tabs** dump (`white-space: pre`) could drag the whole popup past
  700px when a few tickers were open and the section was expanded. Both `<html>` and `<body>` are now
  pinned to 384px (Chrome sizes the popup window to `<html>`), so that dump scrolls within its own box
  (it already had `overflow-x: auto`) instead of widening everything.

## [1.16.0] — 2026-08-04

### Added
- **GEXbot levels on TradingView.** A new opt-in overlay for open `tradingview.com/chart` pages
  whose symbol is a GEXbot ticker. Enter a **GEXbot API key** in the Keys tab to reveal a **TV**
  settings tab, and the chart gains:
  - GEXbot's **Classic + State major levels** (Zero Gamma, Major +Vol/−Vol) as horizontal lines,
    each with its own toggle + color, plus a status pill with a live refresh countdown.
  - A per-strike **GEX profile histogram** (right-anchored bars + recent prior-reading dots),
    switchable Classic/State.
  - **Click a level to create a TradingView price alert** at it — single, bulk (add/remove all for
    a ticker), and package-aware (a trash on the shown package, a cue when it's on another).
  - Controls for the **package** (Latest / Next / 90 Days), an **API-tier** selector that disables
    features your key can't power, **opacity** sliders for lines and histogram, and a tunable
    **refresh rate** (1/5/15/30/60s). Your key is stored locally and sent only to GEXbot.

## [1.15.1] — 2026-08-04

### Fixed
- **Ticker sync no longer drops the options profile.** In Ticker mode, when a synced ticker change
  reached a `/state` tab showing the **options profile** at `latest`/`next` with **no greek toggle**
  selected, that tab flipped back to the **gex** profile. (The tab's profile is carried into
  GEXbot's URL hash to switch ticker without a reload; the no-greek options case emitted a bare
  `latest`/`next`, which GEXbot reads as the gex profile.) It now uses the same non-gex `option#…`
  hash form the greek views already used, so the options profile survives the switch. The source
  pane and greek-selected panes were already unaffected.

## [1.15.0] — 2026-08-01

### Changed
- **The chart pill is now a plain on/off tools toggle.** It no longer cycles
  `off → trigger → draw`; one click turns the chart tools on (re-arming the sub-mode you last
  used) and off. Line vs. Draw is chosen in the right-click menu.
- **"Trigger mode" is now "Line mode."** The old name came from an earlier idea; the mode is
  really about reading prices and dropping horizontal lines, so it's renamed everywhere — including
  the popup's **Line** color row (was Trigger). Existing trigger colors carry over automatically.
- **The right-click menu uses direct-select segmented controls.** **Line｜Draw**,
  **Freehand｜Arrow**, and **Page｜Tab｜Global** are now inline pill selectors — pick any value
  directly instead of clicking through a cycle. Selecting one keeps the menu open.
- **All three drawing scopes can be cleared at once.** **Clear page / tab / global drawings** are
  always listed (a scope with nothing to clear is dimmed), so you no longer have to switch to a
  scope before clearing it. Copy price is available in both Line and Draw modes.

## [1.14.1] — 2026-07-31

### Fixed
- **The chart's right-click menu now closes on click-away in draw mode.** A click on the chart to
  dismiss the menu was being swallowed (draw mode's pointer capture suppressed the dismiss click),
  so the menu only closed if you clicked out of the browser entirely. It now closes on any
  click-away — without leaving a stray mark — plus Escape and scroll.

## [1.14.0] — 2026-07-30

### Added
- **Pick your chart-tool colors.** The popup's **Lines** page is now **Tools**, with a color
  per mode chosen from your group palette: **Trigger** tints its reticle, price guide, and
  lines; **Draw** tints its reticle and your strokes. Change one and everything in that mode
  recolors live. The two can't be the same.
- **Switch modes from the chart menu.** The right-click menu now has **Off** and the **other
  mode** (Draw ⇄ Trigger), so you can jump modes or turn the tools off without cycling the pill.

## [1.13.0] — 2026-07-30

### Added
- **Draw mode — freehand + arrows on the chart.** The chart pill's tool button now cycles
  **off → trigger → draw**. In draw mode (blue reticle) you **left-drag** to paint a freehand
  stroke or a straight arrow (switch tool in the right-click menu). Drawings are anchored to
  **time-of-day + price**, so — since GEXbot shows one day at a time — a mark drawn at 11:00
  shows at the 11:00 slot **every day**, across every DTE package (latest/next/90d), and tracks
  zoom/pan/replay.
- **Drawings persist per ticker + page** (classic vs state). The draw menu offers **Undo last**,
  **Clear drawings**, and **Clone drawings here** (copy the other page's drawings onto this one).

## [1.12.0] — 2026-07-30

### Changed
- **Line drawing is now Trigger mode.** The chart pill's line button became a single
  **trigger button** (a crosshair-circle icon). Arming it shows an amber **reticle** that
  tracks your cursor, and **locks pan/zoom** on the chart (with a "zoom locked" badge) so a
  stray drag or double-click can't move or reset it. Arming is **global** — it turns on for
  every open GEXbot pane at once. Leaving trigger mode restores normal pan/zoom.

### Added
- **A right-click action menu on the chart** (while trigger mode is armed): **Copy price**
  (the price under the cursor, to your clipboard), **Add line here** / **Remove line**
  (context-aware), **Add to / Remove from watchlist** for the chart's ticker, and **Clear
  lines**. Placing and removing lines moved here from the old left-click. Right-click with
  trigger mode off gives you the browser's normal menu back.

## [1.11.1] — 2026-07-28

### Fixed
- **The bottom pill no longer drops when the watchlist is short.** With 1 or fewer
  watchlist tickers the pill used to fall to the bottom of the chart and, in Replay mode,
  hide behind the "Be master" transport bar. The pill (and its details panel) now stay at
  one fixed height in every mode and watchlist size; the cycle bar and the replay bar sit
  just below it.

## [1.11.0] — 2026-07-28

### Added
- **A little something hidden.** There's a new toggle you have to find — tap the
  version text in the popup a few times, Android-"build number" style, and a **✨ Secrets**
  block appears at the bottom of the Sync page. What's inside is purely cosmetic, off by
  default, and tinted to your ticker group. Reload the extension, then go tapping. 🟩

## [1.10.0] — 2026-07-28

### Added
- **Horizontal lines on the chart.** A new **line button** on the chart pill (just
  after the loop mark) arms *line mode*: a mint price preview tracks your cursor, a
  click drops a horizontal line at that price, and clicking a line removes it. Lines
  are **per-ticker** — each one belongs to the ticker it was drawn on and only shows
  on charts of that ticker (like a TradingView drawing belongs to its symbol), and
  they **persist** across reloads and GEXbot's chart refresh. A new **Lines** page in
  the popup lists every saved line grouped by ticker, with per-line delete, **clear
  this ticker**, and **clear all**.

### Changed
- **The bottom pill is now consistent across Profiles / Ticker / Replay.** The pill
  (and its details panel) no longer jump vertically when you cycle modes; the loop
  mark stays on the pill in every mode and is **tinted by replay role** (mint master,
  azure client); the Replay transport bar's redundant leading circle is gone and the
  bar sits snug under the pill like the Ticker cycle bar; and the `mode:` prefix is
  dropped so the pill reads just **Ticker / Profiles / Replay**.

## [1.9.0] — 2026-07-27

### Added
- **Watchlist + one-click ticker cycling.** A new **Watchlist** page in the popup
  lets you curate a list of tickers (picked from GEXbot's own ticker list, packaged
  with the extension — no extra API calls at runtime). In **Ticker mode**, once the
  list has 2+ entries, a compact cycle bar appears under the pill showing the
  previous and next ticker (e.g. `AVGO ◂ ▸ NVDA`). One click — on either arrow or on
  the symbol labels themselves — steps your whole color group to that ticker, reusing
  the existing ticker-sync path so every synced tab follows. Cycling only acts in
  Ticker mode; the bar stays hidden otherwise.

### Fixed
- **The chart watermark no longer collides with GEXbot's control panel.** On short
  browser windows the right-side control panel overlapped the end of the
  `TICKER … 0DTE` watermark. The watermark now measures itself against that panel and
  drops the DTE tag onto its own line when they would overlap.

## [1.8.1] — 2026-07-25

### Fixed
- **The extension is called "GexSync" again.** The manifest name had read
  `GexSync (replay)` since the original replay-sync work back at version 1.0 — a working
  suffix that was never removed, and that every version bump since carried forward
  untouched. Chrome shows the manifest name in `chrome://extensions` and in the toolbar
  tooltip, so the install read like a single-feature dev build rather than the whole
  extension. Name only; no behaviour change. Reload the extension to pick it up.

## [1.8.0] — 2026-07-25

### Added
- **Chart data add-ons** — a new **Data keys** page in the popup, holding the first
  features that bring **outside** data onto the chart. All are **off by default**, and
  they are gated differently: **Reddit buzz** needs no key at all, while the two
  Massive.com add-ons do nothing until you save **your own** API key. A **free**
  Massive key covers both.
  - **Reddit buzz** — the current ticker's Reddit mention rank, count, and 24-hour
    rank change, from [apewisdom.io](https://apewisdom.io). No key, no signup. Also
    ranks the current symbol against the other tickers you have open. The list it
    fetches covers roughly the 300 most-mentioned tickers and refreshes hourly, so a
    quiet symbol reads `not in today's top 285` rather than failing.
  - **Massive.com data** — company details (name, exchange, market cap, share count;
    security type and currency for ETFs), fetched once per ticker per trading day.
  - **Previous-day levels** — the previous trading day's **O**pen/**H**igh/**L**ow/
    **C**lose drawn as labelled chart lines (`PDO`/`PDH`/`PDL`/`PDC`), each
    independently toggleable, with selectable label placement. **Follows replay**: the
    "previous day" is measured from the chart's own update date, so a tab parked on a
    past session shows that session's previous day. Stocks & ETFs only.
- **Ticker details panel on the pill.** Hover the pill's ticker segment to peek at the
  add-on data, **click** to pin it open, **Esc** to close. The panel is exactly as wide
  as the pill and grows out of it, so the two read as one object.
- **Visible failure state.** An amber dot appears on the pill's ticker segment whenever
  a data source is failing — with the panel open or closed — and the panel gives the
  reason in plain language. Throttling on a free key is expected and clears itself:
  soft failures retry on a 20-second cooldown so panels fill in progressively, while
  hard ones (a rejected key, an unsupported symbol) don't retry, because asking again
  can't change the answer.

### Changed
- **Documentation now states the network contract precisely.** GexSync makes **zero**
  outbound requests until you switch on an add-on — the README and `knowledge/safety.md`
  previously claimed it never made any at all. Both now name each host, say what each
  request carries, and note that `apewisdom.io` is never told which ticker you are
  viewing (the ranked list is matched locally) and that fetched data is never persisted.
  Every outbound request in the extension lives in `background.js`; `content.js` has
  none, which is why an API key never reaches a script running on gexbot.com.
- New `knowledge/data-addons.md` documents both providers, what a free key's limits mean
  in practice, and every failure message. `knowledge/usage.md` also picked up three
  settings that had shipped without documentation: **Sync chart settings** (1.7.0),
  **Show days to expiry** (1.6.0) and **Sync settings navigation** (1.5.0).

## [1.7.0] — 2026-07-25

### Added
- **Sync chart settings** (popup toggle, off by default). Mirrors the Settings
  panel's **Chart Type** (Line/Candles), **Profile Alignment** (Left/Center/Right),
  and **Time Zone** across your tabs, following **Cross-page scope** (all tabs vs
  by-page). Because GEXbot only renders these controls while the Settings panel is
  open, syncing activates **only while every in-scope tab has Settings open** — a
  colored box marks the synced section (one color for all-tabs; distinct
  state/classic colors for by-page), and when not all panels are open a
  `N/M panels open` hint shows why it's waiting. The tab where you click a control
  is the authority (with a brief busy window so a change never bounces back).
  Nothing is saved on our end — it's a live mirror, same as panel-collapse sync.

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

[1.15.0]: https://github.com/dgnsrekt/gexsync/compare/v1.14.1...v1.15.0
[1.14.1]: https://github.com/dgnsrekt/gexsync/compare/v1.14.0...v1.14.1
[1.14.0]: https://github.com/dgnsrekt/gexsync/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/dgnsrekt/gexsync/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/dgnsrekt/gexsync/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/dgnsrekt/gexsync/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/dgnsrekt/gexsync/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/dgnsrekt/gexsync/compare/v1.9.0...v1.10.0
[1.18.0]: https://github.com/dgnsrekt/gexsync/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/dgnsrekt/gexsync/compare/v1.16.1...v1.17.0
[1.16.1]: https://github.com/dgnsrekt/gexsync/compare/v1.16.0...v1.16.1
[1.16.0]: https://github.com/dgnsrekt/gexsync/compare/v1.15.1...v1.16.0
[1.15.1]: https://github.com/dgnsrekt/gexsync/compare/v1.15.0...v1.15.1
[1.9.0]: https://github.com/dgnsrekt/gexsync/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/dgnsrekt/gexsync/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/dgnsrekt/gexsync/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/dgnsrekt/gexsync/compare/v1.6.0...v1.7.0
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
