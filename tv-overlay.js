// GexSync — GEX levels on TradingView: the MAIN-world half. Needs window.TradingViewApi (only
// reachable from the page world). Reads the chart's current symbol and hands it to the ISOLATED
// tv.js (which fetches GEXbot majors via the background worker), then reads the levels+cfg back
// from #__gxtv and draws them as horizontal lines pinned to the price axis. The price->y mapping
// bisects the chart's own coordinateToPrice, which already accounts for log scale + axis margins
// (verified 2026-08-01; see RESEARCH-tradingview-gex-injection.md). Horizontal lines span the full
// width, so no time/bar-index mapping is needed.
(function () {
  if (window.__gexsyncTV) return;
  window.__gexsyncTV = true;

  // Shared palette + snippets (was ~30 scattered hex literals + repeated style fragments).
  const C = { accent: "#16E0A3", danger: "#FF5C5C", warn: "#FFB454", dim: "#9AA0AA", off: "#5b6672", state: "#22D3EE", ink: "#E7E9EA", dot: "#CBD5E1", softRed: "#FF8C8C" };
  const DIVIDER = '<span style="width:1px;height:13px;background:rgba(255,255,255,.16)"></span>';
  const CLICK = "cursor:pointer;pointer-events:auto"; // a pill child opts back into clicks (pill is pointer-events:none)
  // Outbound event contract to ISOLATED tv.js (its listeners use the same literals).
  const EV = { fetch: "gexsync-tv-fetch", symbol: "gexsync-tv-symbol", hello: "gexsync-tv-hello", cyclePkg: "gexsync-tv-cycle-pkg", toggleLines: "gexsync-tv-toggle-lines", toggleHist: "gexsync-tv-toggle-hist", cycleHsrc: "gexsync-tv-cycle-hsrc" };
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));

  // i18n: the popup UI language rides over on the #__gxtv payload (data.lang); readNode keeps LANG
  // fresh (the main loop parses the node every ~100ms, before any pill/toast is drawn). GXI18N is
  // bundled into this MAIN-world script too. Level names (Classic/State/Zero Gamma/…) stay English.
  const GXI = self.GXI18N;
  let LANG = "en";
  const tr = (k) => (GXI ? GXI.t(k, LANG) : k);
  const tri = (k, v) => (GXI ? GXI.ti(k, v, LANG) : k);

  const NODE_ID = "__gxtv", HNODE_ID = "__gxtvh";
  // The 5 lines: which cfg toggle/color, which source (classic/state) + field in data.levels,
  // and the label. The package (latest/next/90d) is chosen globally and applies to all of them.
  const LINES = [
    { key: "czg",  src: "classic", field: "zeroGamma", label: "Classic Zero Gamma" },
    { key: "cpos", src: "classic", field: "majorPos",  label: "Classic Major +Vol" },
    { key: "cneg", src: "classic", field: "majorNeg",  label: "Classic Major −Vol" },
    { key: "spos", src: "state",   field: "majorPos",  label: "State Major +Vol" },
    { key: "sneg", src: "state",   field: "majorNeg",  label: "State Major −Vol" },
  ];
  // the GexSync mark (two bars + sync line) — same geometry as the popup/pill icon
  const LOGO = '<svg width="18" height="18" viewBox="0 0 32 32" style="display:block"><rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#12101B" stroke="rgba(22,224,163,.55)"/><rect x="7" y="10" width="7" height="12" rx="2.2" fill="#16E0A3" opacity=".92"/><rect x="18" y="10" width="7" height="12" rx="2.2" fill="#4AA3FF" opacity=".92"/><line x1="16" y1="7" x2="16" y2="25" stroke="#16E0A3" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2.4" fill="#16E0A3"/></svg>';
  let refreshMs = 30000; // fetch cadence + countdown, wall-clock aligned; tunable via cfg (15/30/60s)
  let autoMs = 0, lastAutoMark = 0, autoBusy = false; // auto-heal stale alerts: wall-clock cadence (0 = off), overlap guard
  const R = 8, CIRC = 2 * Math.PI * R; // countdown ring geometry
  // clickable countdown ring: track + depleting arc + seconds; click forces a refresh. The title
  // lives on an HTML <span> WRAPPER (not the <svg>) — Chrome doesn't tooltip a `title` attribute on
  // inline SVG, so #gxtv-ring is the span (carries title/click); the arc/sec ids stay on the svg.
  const RING = `<span id="gxtv-ring" style="${CLICK};display:flex;align-items:center" title="next GEX refresh — click to refresh now"><svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><circle cx="10" cy="10" r="${R}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/><circle id="gxtv-arc" cx="10" cy="10" r="${R}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 10 10)"/><text id="gxtv-sec" x="10" y="10.5" text-anchor="middle" dominant-baseline="middle" fill="${C.dim}" style="font:700 8px -apple-system,system-ui,sans-serif">30</text></svg></span>`;
  // feather-style trash glyph shown on a label that already has one of our alerts (click → delete)
  const TRASH_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  // amber bell shown when an alert exists on this level but under a DIFFERENT package than what's
  // displayed — a "there's an alert, tied to <pkg>" cue; not deletable until you switch to that pkg.
  const BELL_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const PKG_FR = { zero: "latest", one: "next", full: "90d" }; // backend token → friendly name (for the cue)
  // bulk bell for the pill: outline = add-mode, filled (14px) = delete-mode
  const BELL_ADD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const BELL_DEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  // pill quick-toggle glyphs: stacked dashed lines (levels) + right-anchored bars (profile)
  const LINES_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" style="display:block"><line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>';
  const HIST_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="display:block"><rect x="5" y="2" width="8" height="2.2" rx="1"/><rect x="1" y="5.9" width="12" height="2.2" rx="1"/><rect x="7" y="9.8" width="6" height="2.2" rx="1"/></svg>';
  // details-panel toggle: a small framed panel with a header rule + rows
  const DETAILS_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.1" style="display:block"><rect x="1.5" y="1.5" width="11" height="11" rx="1.6"/><line x1="1.5" y1="5" x2="12.5" y2="5"/><line x1="4" y1="8" x2="10" y2="8"/><line x1="4" y1="10.3" x2="10" y2="10.3"/></svg>';
  let detailsEl = null, detailsOpen = false; // GEX details panel above the pill (data we already fetch)

  const readNode = () => { const n = document.getElementById(NODE_ID); if (!n || !n.textContent) return null; try { const p = JSON.parse(n.textContent); if (p && p.lang && GXI) LANG = GXI.normLang(p.lang); return p; } catch { return null; } };
  // Map a TradingView resolution string to a timeframe "bucket" (mirrors TV's Visibility units).
  // Suffix-based: …T ticks, …S seconds, …R ranges, …D days, …W weeks, …M months ("1M" = 1 month);
  // a bare number is minutes, or hours when ≥ 60. cfg.vis (from tv.js) is the allowed-bucket set,
  // or null = every timeframe. When the current bucket isn't allowed, the overlay is hidden here.
  function tfBucket(res) {
    const s = String(res || "").toUpperCase();
    if (s.endsWith("T")) return "ticks";
    if (s.endsWith("S")) return "seconds";
    if (s.endsWith("R")) return "ranges";
    if (s.endsWith("D")) return "days";
    if (s.endsWith("W")) return "weeks";
    if (s.endsWith("M")) return "months";
    const n = parseInt(s, 10);
    return isFinite(n) && n >= 60 ? "hours" : "minutes";
  }
  let tfHidden = false; // true when the current chart timeframe falls outside cfg.vis (hides overlay + pauses poll)
  let pollPaused = false, pauseReason = ""; // poll gate: "tf" (timeframe-hidden) | "closed" (market closed) | ""
  // TradingView's own market status for the current symbol — a reactive watched value. activeChart() is
  // a stable ref and the wv tracks symbol changes, so grab it ONCE and reuse value() (a fresh call spawns
  // a new wrapper each time). Fail OPEN ("market") on any error so we never wrongly pause fetching.
  let mktWv = null;
  function marketStatus(chart) {
    try { if (!mktWv) mktWv = chart.marketStatus(); return mktWv.value(); } catch (e) { mktWv = null; return "market"; }
  }
  // Histogram strikes live in a separate node so they don't bloat the 100ms sig. Parse only when
  // the version stamp (hgen from the main node) changes; otherwise reuse the cached parse.
  let histGen = -1, histData = null;
  const readHist = (gen) => {
    if (gen === histGen) return histData;
    histGen = gen;
    const n = document.getElementById(HNODE_ID);
    try { histData = n && n.textContent ? JSON.parse(n.textContent) : null; } catch { histData = null; }
    return histData;
  };
  const chartApi = () => (window.TradingViewApi && window.TradingViewApi.activeChart && window.TradingViewApi.activeChart()) || null;

  // Bare ticker from the chart. symbolExt() gives {symbol,exchange,type}; fall back to splitting.
  function bareTicker(c) {
    try { const e = c.symbolExt && c.symbolExt(); if (e && e.symbol) return String(e.symbol).toUpperCase(); } catch {}
    try { return String(c.symbol()).split(":").pop().toUpperCase(); } catch {}
    return "";
  }
  // price -> y pixel: 40-step bisection of the monotonic coordinateToPrice (log/margins for free).
  const p2y = (scale, h) => (price) => { let a = 0, b = h; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; scale.coordinateToPrice(m) > price ? a = m : b = m; } return (a + b) / 2; };

  let cv, ctx, host, paneEl, pillEl, lastSym = "", lastSig = "", lastMark = 0;
  let alertTargets = [], toastEl, toastTimer; // per-label click hotspots + a transient toast
  const alertGuard = new Map(); // label -> last-fire ms; debounce accidental double-clicks
  const myAlerts = new Map();   // "TICKER:levelkey" -> [{id, pkg},...] — our TV alerts (from name tags)
  const akey = (t, k) => String(t).toUpperCase() + ":" + k;

  // Click forces ONE extra request — it does not touch the countdown; the scheduled fetches
  // still fire on the :00/:30 marks.
  function forceFetch() { emit(EV.fetch); }
  // Wall-clock aligned: fire a refresh each time we cross a :00 or :30 second boundary; paint the
  // ring (time to the next mark) while it's visible. ISOLATED guards the actual call.
  function updateCountdown() {
    const now = Date.now();
    const mark = Math.floor(now / refreshMs) * refreshMs; // start of the current 30s window
    if (lastMark && mark !== lastMark && !pollPaused) emit(EV.fetch); // crossed :00 / :30 — but paused (timeframe hidden / market closed)
    lastMark = mark;
    if (!pillEl || pillEl.style.display === "none") return;
    const ring = pillEl.querySelector("#gxtv-ring"), arc = pillEl.querySelector("#gxtv-arc"), sec = pillEl.querySelector("#gxtv-sec");
    if (!arc || !sec) return; // ring hidden (no-data ticker) → nothing to paint
    if (pollPaused) { // polling paused: freeze the ring as an amber "paused" badge (‖); hover says why
      arc.setAttribute("stroke", C.warn); arc.setAttribute("stroke-dashoffset", "0"); // full amber ring, no depletion
      sec.setAttribute("fill", C.warn); sec.textContent = "‖";
      if (ring) ring.setAttribute("title", tr(pauseReason === "closed" ? "tv.pausedClosed" : "tv.pausedTf"));
      return;
    }
    arc.setAttribute("stroke", C.accent); sec.setAttribute("fill", C.dim); // restore live look (may have been paused)
    if (ring) ring.setAttribute("title", tr("tv.ringTitle"));
    const remaining = mark + refreshMs - now; // ms to the next mark
    arc.setAttribute("stroke-dashoffset", (CIRC * (1 - remaining / refreshMs)).toFixed(2));
    sec.textContent = String(Math.ceil(remaining / 1000));
  }

  // Current chart context for an alert payload: full symbol spec, resolution, bare ticker.
  function chartCtx() {
    const c = chartApi(); if (!c) return null;
    try { const sym = (c.symbolExt && c.symbolExt().full_name) || c.symbol(); return { sym, res: String(c.resolution()), bare: String(sym).split(":").pop().toUpperCase() }; }
    catch { return null; }
  }
  // One alert's inner payload (popup-only). `name` carries our machine tag gxs:<ticker>:<key>:<pkg>
  // (hidden from the popup) so we can find/classify our alerts in list_alerts. Shared by single +
  // bulk create (create_alert takes one, create_alerts takes an array of these).
  function alertInner(sym, res, bare, price, label, key, pkg) {
    return {
      conditions: [{ type: "cross", frequency: "on_first_fire", series: [{ type: "barset" }, { type: "value", value: price }], resolution: res }],
      symbol: "=" + JSON.stringify({ adjustment: "splits", "currency-id": "USD", session: "regular", symbol: sym }),
      resolution: res,
      message: `${bare} Crossing ${label}`,
      popup: true, mobile_push: false, email: false, sms_over_email: false,
      sound_file: null, sound_duration: 0,
      auto_deactivate: true, ignore_warnings: true, active: true, name: `gxs:${bare}:${key || "?"}:${pkg || "?"}`, expiration: null,
    };
  }
  const cacheAlert = (bare, key, id, pkg, price) => { const k = akey(bare, key); if (!myAlerts.has(k)) myAlerts.set(k, []); myAlerts.get(k).push({ id, pkg, price: price != null ? price : null }); }; // price → staleness detection

  // ALL pricealerts calls funnel through these two so the load-bearing invariant lives in ONE place:
  // tv-overlay runs in MAIN world on www.tradingview.com, so these are page-context, same-site
  // requests (cookie auth) with NO content-type header (only accept) → CORS-simple, dodging a
  // preflight pricealerts won't answer. Returns { ok, j, status, net }; ok = HTTP-ok AND {s:"ok"}.
  const ALERT_BASE = "https://pricealerts.tradingview.com/";
  async function tvAlertPost(path, payload) {
    try {
      const resp = await fetch(ALERT_BASE + path, { method: "POST", credentials: "include", headers: { accept: "application/json" }, body: JSON.stringify(payload) });
      const j = await resp.json().catch(() => null);
      return { ok: resp.ok && j && j.s === "ok", j, status: resp.status };
    } catch { return { ok: false, j: null, status: 0, net: true }; }
  }
  async function tvAlertGet(path) {
    try {
      const resp = await fetch(ALERT_BASE + path, { credentials: "include", headers: { accept: "application/json" } });
      const j = await resp.json().catch(() => null);
      return { ok: resp.ok && j && j.s === "ok", j, status: resp.status };
    } catch { return { ok: false, j: null, status: 0, net: true }; }
  }
  // errmsg helper: uniform "<verb>: network" / "<verb>" / "<verb> (status)" from a tvAlert* result.
  const alertErr = (res, verb) => (res.net ? tri("tv.errNetwork", { verb }) : (res.j && res.j.errmsg) || tri("tv.errStatus", { verb, status: res.status }));

  // Click a level's label → create a TradingView price-crossing alert at that price.
  async function createAlert(price, label, key, pkg) {
    if (price == null || !isFinite(price)) return;
    const ctx = chartCtx(); if (!ctx) return toast(tr("tv.noChart"), true);
    const now = Date.now();
    if (now - (alertGuard.get(label) || 0) < 2000) return; // same level clicked twice → one alert
    alertGuard.set(label, now);
    const res = await tvAlertPost("create_alert", { payload: alertInner(ctx.sym, ctx.res, ctx.bare, price, label, key, pkg) });
    if (res.ok) {
      if (res.j.r && res.j.r.alert_id != null) { cacheAlert(ctx.bare, key, res.j.r.alert_id, pkg, price); lastSig = ""; } // cache locally → trash appears, no re-list
      toast(tri("tv.alertSet", { label }));
    } else toast(alertErr(res, tr("tv.vAlertFailed")), true);
  }

  // Load our alerts from TV once and cache them. list_alerts returns ALL alerts (no server-side
  // symbol filter) + each alert's name tag, so we fetch once and keep the cache fresh locally on
  // our own create/delete — never poll. manual=true → user hit the pill resync button.
  async function loadAlertIndex(manual) {
    const res = await tvAlertGet("list_alerts");
    if (!res.ok || !res.j || !Array.isArray(res.j.r)) { if (manual) toast(res.net ? tr("tv.resyncFailedNet") : tr("tv.resyncFailed"), true); return; }
    myAlerts.clear();
    let n = 0;
    for (const a of res.j.r) {
      const m = /^gxs:([^:]+):([^:]+):([^:]+)/.exec(a.name || "");
      if (!m) continue;
      const k = akey(m[1], m[2]);
      if (!myAlerts.has(k)) myAlerts.set(k, []);
      const sv = a.condition && Array.isArray(a.condition.series) ? a.condition.series.find((s) => s && s.type === "value") : null; // target price = the "value" series
      myAlerts.get(k).push({ id: a.alert_id, pkg: m[3], price: sv ? sv.value : null });
      n++;
    }
    lastSig = ""; // force redraw so trash glyphs refresh
    if (manual) toast(tri("tv.alertsSynced", { n }));
  }

  // Delete our alerts on this ticker:level that were set under the CURRENT package (immediate, no
  // confirm). Alerts tied to other packages are left alone — they show the amber bell cue instead.
  async function deleteAlert(ticker, key, label, pkg) {
    const k = akey(ticker, key);
    const arr = myAlerts.get(k);
    if (!arr || !arr.length) return;
    const ids = arr.filter((a) => a.pkg === pkg).map((a) => a.id);
    if (!ids.length) return;
    const now = Date.now();
    if (now - (alertGuard.get("del:" + k) || 0) < 2000) return; // debounce
    alertGuard.set("del:" + k, now);
    const res = await tvAlertPost("delete_alerts", { payload: { alert_ids: ids } });
    if (res.ok) {
      const rest = arr.filter((a) => a.pkg !== pkg);
      if (rest.length) myAlerts.set(k, rest); else myAlerts.delete(k);
      lastSig = ""; toast(tri("tv.alertDeleted", { label }));
    } else toast(alertErr(res, tr("tv.vDeleteFailed")), true);
  }

  // ---- Bulk: one pill bell that adds/removes ALL of a ticker's GexSync alerts at once ----------
  const tickerIds = (ticker) => { const pre = String(ticker).toUpperCase() + ":"; const out = []; for (const [k, arr] of myAlerts) if (k.startsWith(pre)) for (const a of arr) out.push(a.id); return out; };
  // Enabled levels that have a valid price (independent of scroll) — what bulk-add creates.
  function shownLevels(data) {
    const out = [];
    for (const L of LINES) {
      const price = data.levels && data.levels[L.src] && data.levels[L.src][L.field];
      const on = !(data.cfg && data.cfg.levels && data.cfg.levels[L.key] && data.cfg.levels[L.key].on === false);
      if (on && price != null && isFinite(price) && price > 0) out.push({ key: L.key, label: L.label, price });
    }
    return out;
  }
  // Bell press: alerts exist for this ticker → delete them all; else add all shown levels.
  function bulkToggle() {
    const data = readNode(); const ticker = data && data.ticker;
    if (!data || !ticker || data.valid === false) return;
    const now = Date.now();
    if (now - (alertGuard.get("bulk:" + ticker) || 0) < 2000) return; // debounce
    alertGuard.set("bulk:" + ticker, now);
    const ids = tickerIds(ticker);
    if (ids.length) bulkDelete(ids, ticker); else bulkAdd(data);
  }
  async function bulkDelete(ids, ticker) {
    const res = await tvAlertPost("delete_alerts", { payload: { alert_ids: ids } });
    if (res.ok) {
      const pre = String(ticker).toUpperCase() + ":"; for (const k of [...myAlerts.keys()]) if (k.startsWith(pre)) myAlerts.delete(k);
      lastSig = ""; toast(tri("tv.alertsDeleted", { n: ids.length, s: ids.length === 1 ? "" : "s", ticker }));
    } else toast(alertErr(res, tr("tv.vBulkDelFailed")), true);
  }
  async function bulkAdd(data) {
    const ctx = chartCtx(); if (!ctx) return toast(tr("tv.noChart"), true);
    const levels = shownLevels(data); if (!levels.length) return toast(tr("tv.noLevels"), true);
    const pkg = data.pkgCat;
    const res = await tvAlertPost("create_alerts", { payload: levels.map((L) => alertInner(ctx.sym, ctx.res, ctx.bare, L.price, L.label, L.key, pkg)) });
    if (res.ok) {
      const r = Array.isArray(res.j.r) ? res.j.r : [];
      let ok = r.length === levels.length; // create_alerts returns in input order
      if (ok) for (let i = 0; i < levels.length; i++) { if (r[i] && r[i].alert_id != null) cacheAlert(ctx.bare, levels[i].key, r[i].alert_id, pkg, levels[i].price); else ok = false; }
      if (ok) { lastSig = ""; toast(tri("tv.alertsAddedPkg", { n: levels.length, ticker: ctx.bare, pkg: PKG_FR[pkg] || pkg })); }
      else { toast(tri("tv.alertsAdded", { n: levels.length, ticker: ctx.bare })); loadAlertIndex(); } // response shape off → resync
    } else toast(alertErr(res, tr("tv.vBulkAddFailed")), true);
  }

  // Transient status message, pinned just above the pill (bottom-right of the pane).
  function toast(msg, isErr) {
    if (!host) return;
    if (!toastEl || !host.contains(toastEl)) {
      toastEl = document.createElement("div"); toastEl.id = "gxtv-toast";
      toastEl.style.cssText = "position:absolute;z-index:7;padding:6px 11px;border-radius:10px;font:600 12px -apple-system,system-ui,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12)";
      host.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = isErr ? "rgba(46,12,12,.94)" : "rgba(10,24,18,.94)";
    toastEl.style.color = isErr ? C.softRed : C.accent;
    if (pillEl) { toastEl.style.left = pillEl.style.left; toastEl.style.top = (parseFloat(pillEl.style.top || "0") - 34) + "px"; }
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.style.display = "none"; }, 2500);
  }

  // Sync a small reused pool of transparent DOM hotspots over the canvas-drawn labels (the canvas
  // itself is pointer-events:none). Each carries its price+label so a click creates that alert.
  function syncAlertTargets(placed, offX, offY) {
    if (!document.getElementById("gxtv-style")) { const st = document.createElement("style"); st.id = "gxtv-style"; st.textContent = "@keyframes gxtvStale{0%,100%{opacity:1;transform:translateY(-50%) scale(1)}50%{opacity:.4;transform:translateY(-50%) scale(1.22)}}"; (document.head || document.documentElement).appendChild(st); } // stale-alert pulse (keeps the icon's base translateY)
    if (alertTargets.length && alertTargets[0] && !host.contains(alertTargets[0])) alertTargets = []; // pane re-rendered → rebuild
    for (let i = 0; i < placed.length; i++) {
      let d = alertTargets[i];
      if (!d) {
        d = document.createElement("div");
        d.style.cssText = "position:absolute;z-index:5;pointer-events:auto;border-radius:3px;background:transparent";
        d.onmouseenter = () => { d.style.background = "rgba(255,255,255,.10)"; };
        d.onmouseleave = () => { d.style.background = "transparent"; };
        d._icon = document.createElement("div"); // right-aligned glyph: trash (same pkg) or bell cue (other pkg)
        d._icon.style.cssText = "position:absolute;right:1px;top:50%;transform:translateY(-50%);width:16px;height:16px;display:none;align-items:center;justify-content:center;pointer-events:auto";
        d.appendChild(d._icon);
        host.appendChild(d); alertTargets[i] = d;
      }
      const p = placed[i];
      d.style.left = (offX + p.left) + "px"; d.style.top = (offY + p.top) + "px";
      d.style.width = (p.right - p.left) + "px"; d.style.height = (p.bottom - p.top) + "px";
      d.style.display = "block";
      const ic = d._icon;
      ic.style.animation = ""; // reset (icons are reused across renders); the stale branch re-arms the pulse
      if (p.samePkg) { // alert on the shown package → trash deletes it; body-click disabled (no dupes)
        ic.style.display = "flex"; ic.style.cursor = "pointer"; ic.innerHTML = TRASH_SVG;
        if (p.stale) { // #1: level drifted from the alert price → amber pulsing trash to grab attention
          ic.style.color = C.warn; ic.style.animation = "gxtvStale 1.2s ease-in-out infinite";
          ic.onmouseenter = () => { ic.style.color = C.danger; }; ic.onmouseleave = () => { ic.style.color = C.warn; };
          d.title = tri("tv.staleAlert", { alertPx: (+p.alertPx).toFixed(2), level: (+p.price).toFixed(2) });
        } else {
          ic.style.color = C.dim;
          ic.onmouseenter = () => { ic.style.color = C.danger; }; ic.onmouseleave = () => { ic.style.color = C.dim; };
          d.title = tri("tv.titleAlertSet", { pkg: PKG_FR[p.pkg] || p.pkg, name: p.name });
        }
        ic.onclick = (e) => { e.stopPropagation(); deleteAlert(p.ticker, p.key, p.name, p.pkg); };
        d.onclick = null; d.style.cursor = "default";
      } else if (p.otherPkgs.length) { // alert exists but tied to another package → amber bell cue, not deletable here
        const fr = p.otherPkgs.map((x) => PKG_FR[x] || x).join("/");
        ic.style.display = "flex"; ic.style.cursor = "help"; ic.style.color = C.warn; ic.innerHTML = BELL_SVG;
        ic.onmouseenter = null; ic.onmouseleave = null;
        ic.onclick = (e) => { e.stopPropagation(); toast(tri("tv.alertOnOther", { fr }), true); };
        d.onclick = null; d.style.cursor = "default";
        d.title = tri("tv.titleAlertOther", { fr, pkg: PKG_FR[p.pkg] || p.pkg });
      } else { // no alert here → whole label creates one
        ic.style.display = "none";
        d.style.cursor = "pointer";
        d.title = tri("tv.titleCreate", { name: p.name });
        d.onclick = (e) => { e.stopPropagation(); createAlert(p.price, p.name, p.key, p.pkg); };
      }
    }
    for (let i = placed.length; i < alertTargets.length; i++) if (alertTargets[i]) alertTargets[i].style.display = "none";
  }
  const hideAlertTargets = () => { for (const d of alertTargets) if (d) d.style.display = "none"; };

  // Bulk bell markup for the pill: green outline = add-mode (no alerts yet), red filled = delete-mode
  // (this ticker has alerts). Hidden for non-GEXbot symbols. Click wired in updatePill.
  function bulkBell(data) {
    if (!data || !data.ticker || data.valid === false) return "";
    const n = tickerIds(data.ticker).length;
    const title = n
      ? tri("tv.bulkDel", { n, s: n === 1 ? "" : "s", ticker: data.ticker })
      : tri("tv.bulkAdd", { ticker: data.ticker, pkg: PKG_FR[data.pkgCat] || data.pkgCat });
    return `<span id="gxtv-bulk" title="${title}" style="display:flex;align-items:center;color:${n ? C.danger : C.accent};${CLICK}">${n ? BELL_DEL : BELL_ADD}</span>`;
  }

  // Bottom-left status pill: logo + wordmark, connection dot, current ticker, GEXbot-ticker badge.
  function updatePill(data) {
    if (!host) return;
    if (!data) { if (pillEl) pillEl.style.display = "none"; return; } // overlay off → no pill
    if (!pillEl || !host.contains(pillEl)) {
      pillEl = document.createElement("div");
      pillEl.id = "gexsync-tv-pill";
      pillEl.style.cssText = "position:absolute;left:12px;bottom:46px;z-index:6;display:flex;align-items:center;gap:8px;padding:5px 11px 5px 6px;border-radius:12px;background:rgba(12,10,18,.86);border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 16px rgba(0,0,0,.45);font:600 12px -apple-system,system-ui,sans-serif;white-space:nowrap;pointer-events:none;user-select:none";
      host.appendChild(pillEl);
    }
    pillEl.style.display = "flex";
    const t = data.ticker || "—";
    const badge = data.valid === false ? `<span style="color:${C.dim}">${tr("tv.noGexData")}</span>`
      : data.err ? `<span style="color:${C.warn}">${data.err}</span>` // rate limited / bad key / …
      : data.levels ? `<span style="color:${C.accent}">GEX ✓</span>`
      : `<span style="color:${C.dim}">…</span>`;
    const showRing = data.valid !== false; // only tick the countdown when we actually poll this ticker
    pillEl.innerHTML = LOGO
      + `<span><span style="color:${C.ink}">Gex</span><span style="color:${C.accent}">Sync</span></span>`
      + `<span style="color:${C.accent};font-size:9px" title="${tr("tv.connected")}">●</span>`
      + DIVIDER
      + `<span style="color:${C.ink}">${t}</span>`
      + (data.pkg ? `<span id="gxtv-pkg" title="${tr("tv.pkgCycle")}" style="color:${C.dim};${CLICK}">· ${data.pkg}${data.dte != null ? ` ${data.dte}DTE` : ""}</span>` : "") // active package (latest/next/90d) + DTE — click to cycle
      + badge
      + viewToggles(data) // ≡ lines / ▤ histogram / C·S source quick-toggles
      + bulkBell(data) // bulk add/delete-all-alerts bell (GEXbot tickers only)
      + `<span id="gxtv-resync" title="${tr("tv.resyncTitle")}" style="color:${C.dim};${CLICK};font-size:13px;line-height:1">⟳</span>`
      + (data.levels ? `<span id="gxtv-details" title="${tr("tv.details")}" style="display:flex;align-items:center;${CLICK};color:${detailsOpen ? C.accent : C.dim}">${DETAILS_ICON}</span>` : "") // GEX details panel toggle
      + (showRing ? DIVIDER + RING : "");
    const wire = (id, fn) => { const el = pillEl.querySelector(id); if (el) fn(el); };
    wire("#gxtv-ring", (el) => { el.setAttribute("title", tr("tv.ringTitle")); el.onclick = forceFetch; updateCountdown(); }); // click the countdown → refresh now
    wire("#gxtv-pkg", (el) => (el.onclick = () => emit(EV.cyclePkg)));   // click package → cycle
    wire("#gxtv-resync", (el) => (el.onclick = () => loadAlertIndex(true))); // re-list our alerts
    wire("#gxtv-bulk", (el) => (el.onclick = bulkToggle));               // add all / delete all
    wire("#gxtv-lines", (el) => (el.onclick = () => emit(EV.toggleLines)));
    wire("#gxtv-hist", (el) => (el.onclick = () => emit(EV.toggleHist)));
    wire("#gxtv-hsrc", (el) => (el.onclick = () => emit(EV.cycleHsrc)));
    wire("#gxtv-details", (el) => (el.onclick = () => { detailsOpen = !detailsOpen; if (!detailsOpen && detailsEl) detailsEl.style.display = "none"; lastSig = ""; })); // toggle the GEX details panel (repaint updates button color + panel)
  }

  // GEX details panel above the pill — renders the numbers we already fetch (net gex, OI majors,
  // max-change table, per source). All from data.levels; zero extra API calls.
  function renderDetails(data) {
    if (!detailsEl) {
      detailsEl = document.createElement("div");
      detailsEl.id = "gxtv-details-panel";
      detailsEl.style.cssText = "position:absolute;z-index:7;padding:10px 13px;border-radius:12px;background:rgba(12,10,18,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 28px rgba(0,0,0,.5);font:500 11.5px 'JetBrains Mono',ui-monospace,monospace;line-height:1.5;pointer-events:auto;user-select:none;white-space:nowrap";
      host.appendChild(detailsEl);
    }
    const L = data.levels || {};
    const px = (n) => n == null ? "—" : (+n).toFixed(2);
    const net = (n) => n == null ? "—" : (+n).toFixed(4);
    const mm = (n) => n == null ? "—" : (n >= 0 ? "+" : "") + (+n).toFixed(2) + "MM";
    const sc = (n) => n == null || n >= 0 ? C.accent : C.danger;
    const row = (label, val, color) => `<div style="display:flex;justify-content:space-between;gap:18px"><span style="color:#7c8698">${label}</span><span style="color:${color || "#e8ecf3"}">${val}</span></div>`;
    const hdr = (t) => `<div style="color:#7c8698;font-size:9px;letter-spacing:.11em;text-transform:uppercase;margin:7px 0 2px">${t}</div>`;
    const MC = ["1m", "5m", "10m", "15m", "30m"];
    // each source is its own COLUMN — laid side by side so the panel spreads horizontally, not tall
    const block = (src, o) => {
      if (!o) return "";
      let h = `<div style="color:${src === "state" ? C.state : C.accent};font-weight:700;font-size:9.5px;letter-spacing:.09em">${src.toUpperCase()}</div>` + hdr(tr("tv.d.volume"));
      if (o.zeroGamma != null) h += row(tr("tv.d.zeroGamma"), px(o.zeroGamma), C.warn);
      h += row(tr("tv.d.majorPos"), px(o.majorPos), C.accent) + row(tr("tv.d.majorNeg"), px(o.majorNeg), C.danger) + row(tr("tv.d.netGex"), net(o.netVol), sc(o.netVol));
      if (o.posOi != null || o.negOi != null || o.netOi != null) h += hdr(tr("tv.d.oi")) + row(tr("tv.d.majorPos"), px(o.posOi), C.accent) + row(tr("tv.d.majorNeg"), px(o.negOi), C.danger) + row(tr("tv.d.netGex"), net(o.netOi), sc(o.netOi));
      if (Array.isArray(o.maxChg) && o.maxChg.length) { h += hdr(tr("tv.d.maxChg")); o.maxChg.forEach((p, i) => { if (p) h += row(MC[i], px(p[0]) + "  " + mm(p[1]), sc(p[1])); }); }
      return `<div>${h}</div>`;
    };
    const ts = (L.classic && L.classic.ts) || (L.state && L.state.ts);
    const asof = ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
    detailsEl.innerHTML =
      `<div style="display:flex;justify-content:space-between;gap:18px;font-weight:700;color:#e8ecf3"><span>${data.ticker || "—"}</span><span style="color:#7c8698;font-weight:400">${data.pkg || ""}${data.dte != null ? " · " + data.dte + "DTE" : ""}</span></div>`
      + row(tr("tv.d.spot"), px((L.classic && L.classic.spot) ?? (L.state && L.state.spot)))
      + `<div style="color:#7c8698;font-size:9px;margin-top:1px">${tr("tv.d.asof")} ${asof}</div>`
      + `<div style="display:flex;gap:26px;align-items:flex-start;margin-top:4px">${block("classic", L.classic)}${block("state", L.state)}</div>`;
  }

  // Compact quick-toggles: ≡ lines on/off, ▤ histogram on/off (bright=on / dim=off), and — only
  // when the histogram is on — a C/S source chip. Each dispatches a cfg-flip event to ISOLATED.
  function viewToggles(data) {
    const linesOn = !data.cfg || data.cfg.linesOn !== false;
    const histOn = !!(data.hist && data.hist.on);
    const state = data.hist && data.hist.src === "state";
    // amber = config-on but hidden on this timeframe (cfg.vis) — so nothing drawing here is understood
    const linesCol = linesOn ? (tfHidden ? C.warn : C.accent) : C.off;
    const histCol = histOn ? (tfHidden ? C.warn : C.accent) : C.off;
    const linesTitle = linesOn && tfHidden ? tr("tv.hiddenTf") : tr("tv.toggleLines");
    const histTitle = histOn && tfHidden ? tr("tv.hiddenTf") : tr("tv.toggleHist");
    let html = DIVIDER
      + `<span id="gxtv-lines" title="${linesTitle}" style="display:flex;align-items:center;${CLICK};color:${linesCol}">${LINES_ICON}</span>`
      + `<span id="gxtv-hist" title="${histTitle}" style="display:flex;align-items:center;${CLICK};color:${histCol}">${HIST_ICON}</span>`;
    const stateOk = !!(data.cfg && data.cfg.caps && data.cfg.caps.state); // Classic-tier key → no source switch
    if (histOn && stateOk) html += `<span id="gxtv-hsrc" title="${tri("tv.histSrc", { src: state ? "State" : "Classic" })}" style="${CLICK};font-weight:700;font-size:11px;color:${state ? C.state : C.accent}">${state ? "S" : "C"}</span>`;
    return html;
  }

  function ensureCanvas() {
    paneEl = document.querySelector(".chart-gui-wrapper"); // first wrapper = the main price pane
    if (!paneEl || !paneEl.parentElement) return false;
    host = paneEl.parentElement;
    if (!cv || !host.contains(cv)) { // (re)attach if TV re-rendered the pane
      cv = document.createElement("canvas");
      cv.id = "gexsync-tv-overlay";
      Object.assign(cv.style, { position: "absolute", pointerEvents: "none", zIndex: 4 });
      host.appendChild(cv);
      ctx = cv.getContext("2d");
    }
    return true;
  }

  // GEX-by-strike profile (GEXbot "Right" alignment): horizontal bars anchored at the right edge,
  // extending LEFT by |net GEX vol|, green when positive / red when negative, semi-transparent so
  // candles show through; the 5 prior readings render as small dots. Auto-scaled to the max
  // magnitude among VISIBLE strikes; culls to the visible price range before the p2y bisection so
  // only the ~20-40 on screen get mapped (not the full ~150).
  function drawHistogram(data, chart, r, y) {
    if (!data.hist || !data.hist.on) return;
    const h = readHist(data.hgen);
    if (!h || !Array.isArray(h.strikes) || !h.strikes.length) return;
    let vr; try { vr = chart.getVisiblePriceRange(); } catch { return; }
    if (!vr) return;
    const lo = Math.min(vr.from, vr.to), hi = Math.max(vr.from, vr.to);
    const vis = []; let maxAbs = 0;
    for (const s of h.strikes) {
      const k = s[0], v = s[1];
      if (typeof k !== "number" || k < lo || k > hi) continue;
      const yy = y(k);
      if (yy < 0 || yy > r.height) continue;
      const priors = Array.isArray(s[2]) ? s[2] : [];
      vis.push({ yy, v, priors });
      const a = Math.abs(v); if (a > maxAbs) maxAbs = a;
      for (const p of priors) { const pa = Math.abs(p); if (pa > maxAbs) maxAbs = pa; }
    }
    if (!vis.length || maxAbs <= 0) return;
    const anchor = r.width, scale = (r.width * 0.55) / maxAbs; // longest bar ≈ 55% of the pane
    vis.sort((a, b) => a.yy - b.yy);
    let minGap = Infinity; // bar thickness from the tightest visible strike spacing (capped)
    for (let i = 1; i < vis.length; i++) { const g = vis[i].yy - vis[i - 1].yy; if (g > 0.5 && g < minGap) minGap = g; }
    const t = Math.max(1, Math.min(6, (isFinite(minGap) ? minGap : 6) * 0.6));
    const op = data.cfg && data.cfg.histOpacity != null ? data.cfg.histOpacity : 1; // user opacity for the whole profile
    for (const s of vis) {
      const w = Math.abs(s.v) * scale;
      ctx.globalAlpha = 0.45 * op; ctx.fillStyle = s.v >= 0 ? C.accent : C.danger;
      ctx.fillRect(anchor - w, s.yy - t / 2, w, t);
    }
    ctx.globalAlpha = 0.85 * op; ctx.fillStyle = C.dot; // neutral prior-reading dots (visible over either color)
    for (const s of vis) for (const p of s.priors) {
      ctx.beginPath(); ctx.arc(anchor - Math.abs(p) * scale, s.yy, 1.5, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    const chart = chartApi();
    if (!chart || !ensureCanvas()) return;
    const r = paneEl.getBoundingClientRect(), hr = host.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    cv.style.cssText += `;width:${r.width}px;height:${r.height}px;left:${r.left - hr.left}px;top:${r.top - hr.top}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    const data = readNode();
    if (data && data.refreshMs) refreshMs = data.refreshMs; // cfg-driven cadence (15/30/60s)
    autoMs = (data && data.autoUpdateMs) || 0; // auto-heal cadence (0 = off)
    // Poll gating, computed before updatePill so the ring/cue reflect it this frame. Two reasons:
    //  • timeframe-hidden (cfg.vis) — HIDES the overlay + pauses the poll
    //  • market closed (cfg.pauseClosed, TradingView marketStatus ≠ "market") — pauses the poll but
    //    KEEPS the last levels shown (it's about saving calls, not hiding data)
    // On resume (timeframe shown again / market opens), fetch once so the data isn't stale.
    const vis = data && data.cfg && data.cfg.vis;
    tfHidden = !!vis && !vis.includes(tfBucket(chart.resolution()));
    const mktClosed = !!(data && data.cfg && data.cfg.pauseClosed !== false) && marketStatus(chart) !== "market";
    const wasPaused = pollPaused;
    pollPaused = tfHidden || mktClosed;
    pauseReason = tfHidden ? "tf" : (mktClosed ? "closed" : "");
    if (wasPaused && !pollPaused) emit(EV.fetch); // resumed → refresh now
    updatePill(data); // pill shows whenever the overlay is enabled, even with no levels to draw
    if (pillEl && pillEl.style.display !== "none") { // pin to the pane's bottom-RIGHT (host is static);
      pillEl.style.left = (r.left - hr.left + r.width - pillEl.offsetWidth - 12) + "px"; // r.width excludes the price axis
      pillEl.style.top = (r.top - hr.top + r.height - pillEl.offsetHeight - 14) + "px";
      pillEl.style.bottom = "auto";
    }
    // details panel: refresh + pin just above the pill's right edge while open
    if (detailsOpen && data && data.levels && pillEl) {
      renderDetails(data);
      detailsEl.style.display = "block";
      detailsEl.style.left = Math.max(4, r.left - hr.left + r.width - detailsEl.offsetWidth - 12) + "px";
      detailsEl.style.top = Math.max(4, r.top - hr.top + r.height - pillEl.offsetHeight - detailsEl.offsetHeight - 22) + "px";
    } else if (detailsEl) detailsEl.style.display = "none";
    if (!data || !data.cfg || data.cfg.enabled === false || !data.levels) { hideAlertTargets(); return; }
    let scale; try { scale = chart.getPanes()[0].getMainSourcePriceScale(); } catch { hideAlertTargets(); return; }
    const y = p2y(scale, r.height);
    if (!tfHidden) drawHistogram(data, chart, r, y); // GEX profile behind the lines (gated on data.hist.on + timeframe)
    const placed = [], ghostRects = []; // ghostRects → hover hit-areas over the 🔔 ghost-line tags
    if (data.cfg.linesOn !== false && !tfHidden) { // "Show lines" master (pill/settings) + timeframe visibility — hide without losing config
    ctx.font = "600 11px -apple-system, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = data.cfg.lineOpacity != null ? data.cfg.lineOpacity : 1; // user opacity for lines + labels
    // Pass 1: draw the full-width lines, and collect the labels to place.
    const staleMode = data.cfg.staleMode || "inline"; // how staleness shows: pulse | inline | line (all pulse the icon)
    const labels = [], ghosts = []; // ghosts = stale alerts' old prices → dotted "ghost" lines (line mode)
    for (const L of LINES) {
      const lv = data.levels[L.src];                // { zeroGamma, majorPos, majorNeg, spot } | null
      const price = lv ? lv[L.field] : null;
      const lc = data.cfg.levels && data.cfg.levels[L.key];
      if (price == null || !isFinite(price) || price <= 0 || !lc || lc.on === false) continue;
      const yy = y(price);
      if (yy < 0 || yy > r.height) continue; // off-screen (price outside the visible range)
      ctx.strokeStyle = lc.color; ctx.lineWidth = 1.3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(r.width, yy); ctx.stroke();
      ctx.setLineDash([]);
      const text = `${L.label}  ${price.toFixed(2)}`;
      const arr = myAlerts.get(akey(data.ticker, L.key)) || []; // our alerts on this level, across packages
      const mine = arr.find((a) => a.pkg === data.pkgCat);      // alert on the shown package (deletable here)
      const samePkg = !!mine;
      const otherPkgs = [...new Set(arr.filter((a) => a.pkg !== data.pkgCat).map((a) => a.pkg))]; // cue only
      // stale = the level has drifted away from where the alert sits (levels are discrete strikes)
      const stale = !!(mine && mine.price != null && Math.abs(mine.price - price) > 0.01);
      const staleTxt = stale && staleMode === "inline" ? `  ⚠ ${(+mine.price).toFixed(2)}` : ""; // #3 inline drift (inline mode only)
      if (stale && staleMode === "line") ghosts.push({ alertPx: mine.price, color: lc.color, level: price }); // #2 ghost line (line mode only)
      const mark = samePkg || otherPkgs.length ? 18 : 0;        // reserve room for the trash/bell glyph
      const baseW = ctx.measureText(text).width, staleW = staleTxt ? ctx.measureText(staleTxt).width : 0;
      labels.push({ yy, text, baseW, staleTxt, color: lc.color, tw: baseW + staleW + mark, price, name: L.label, key: L.key, samePkg, otherPkgs, stale, alertPx: stale ? mine.price : null });
    }
    // Pass 2: place labels right-aligned; if one would overlap an already-placed label (same y band),
    // slide it left of that one so both stay readable.
    labels.sort((a, b) => a.yy - b.yy);
    const PADX = 6, GAP = 8;
    for (const it of labels) {
      const ly = it.yy - 9, top = ly - 8, bottom = ly + 8, boxW = it.tw + 2 * PADX;
      let right = r.width - 12;
      for (let i = 0; i < 8; i++) {
        const left = right - boxW;
        const hit = placed.find((p) => bottom > p.top && top < p.bottom && left < p.right && right > p.left);
        if (!hit) break;
        right = hit.left - GAP; // move this label to the left of the colliding one
      }
      const left = right - boxW;
      placed.push({ top, bottom, left, right, price: it.price, name: it.name, key: it.key, pkg: data.pkgCat, ticker: data.ticker, samePkg: it.samePkg, otherPkgs: it.otherPkgs, stale: it.stale, alertPx: it.alertPx });
      ctx.fillStyle = "rgba(12,12,18,0.82)"; ctx.fillRect(left, ly - 8, boxW, 16);
      ctx.fillStyle = it.color; ctx.fillText(it.text, left + PADX, ly);
      if (it.staleTxt) { ctx.fillStyle = C.warn; ctx.fillText(it.staleTxt, left + PADX + it.baseW, ly); } // #3: inline drift — old alert price in amber
    }
    // #2 ghost line (line mode): a faint dotted line in the key color at each stale alert's old price,
    // with a 🔔 price tag on the left — so the gap between the alert and the current line is visible.
    const lop = data.cfg.lineOpacity != null ? data.cfg.lineOpacity : 1;
    for (const g of ghosts) {
      const gy = y(g.alertPx);
      if (gy < 0 || gy > r.height) continue;
      ctx.globalAlpha = lop * 0.5; ctx.strokeStyle = g.color; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(r.width, gy); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const tag = "🔔 " + (+g.alertPx).toFixed(2), tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = "rgba(12,12,18,0.82)"; ctx.fillRect(6, gy - 8, tw, 16);
      ctx.fillStyle = C.warn; ctx.fillText(tag, 12, gy);
      ghostRects.push({ left: 6, top: gy - 8, w: tw, h: 16, alertPx: g.alertPx, level: g.level }); // hover hit-area
    }
    ctx.globalAlpha = 1; // reset before the DOM hotspots (which aren't canvas-drawn)
    } // end linesOn
    syncAlertTargets(placed, r.left - hr.left, r.top - hr.top); // hotspots over labels (empty when lines hidden)
    syncGhostTargets(ghostRects, r.left - hr.left, r.top - hr.top); // hover tooltips over the 🔔 ghost tags (empty unless line mode)
  }
  // transparent hover hit-areas over the ghost-line 🔔 tags → the "why is this stale" tooltip
  let ghostTargets = [];
  function syncGhostTargets(rects, offX, offY) {
    if (ghostTargets.length && ghostTargets[0] && !host.contains(ghostTargets[0])) ghostTargets = [];
    for (let i = 0; i < rects.length; i++) {
      let d = ghostTargets[i];
      if (!d) { d = document.createElement("div"); d.style.cssText = "position:absolute;z-index:5;pointer-events:auto;cursor:help;background:transparent"; host.appendChild(d); ghostTargets[i] = d; }
      const g = rects[i];
      d.style.left = (offX + g.left) + "px"; d.style.top = (offY + g.top) + "px"; d.style.width = g.w + "px"; d.style.height = g.h + "px"; d.style.display = "block";
      d.title = tri("tv.staleAlert", { alertPx: (+g.alertPx).toFixed(2), level: (+g.level).toFixed(2) });
    }
    for (let i = rects.length; i < ghostTargets.length; i++) if (ghostTargets[i]) ghostTargets[i].style.display = "none";
  }

  function tick() {
    const chart = chartApi();
    if (!chart) return;
    const ticker = bareTicker(chart);
    if (ticker && ticker !== lastSym) { lastSym = ticker; emit(EV.symbol, { ticker }); } // symbol change → ISOLATED refetches
    let sig = "";
    try { sig = JSON.stringify(chart.getVisiblePriceRange()) + (paneEl ? paneEl.getBoundingClientRect().width : 0) + "|" + String(chart.resolution()) + "|" + marketStatus(chart); } catch {} // resolution + market status in the sig so a timeframe switch OR a market open/close repaints (pause gates)
    const n = document.getElementById(NODE_ID); sig += n ? n.textContent : "";
    if (sig !== lastSig) { lastSig = sig; draw(); }
    updateCountdown(); // tick the ring every frame (independent of the sig-gated redraw)
    // Auto-heal stale alerts on a coarser wall-clock mark (:00/:05…), never faster than the poll,
    // and only while actively polling (same pollPaused gate as the countdown fetch).
    if (autoMs > 0 && !pollPaused) {
      const effAutoMs = Math.max(autoMs, refreshMs);
      const amark = Math.floor(Date.now() / effAutoMs) * effAutoMs;
      if (lastAutoMark && amark !== lastAutoMark) autoUpdateStale();
      lastAutoMark = amark;
    } else lastAutoMark = 0; // reset when off/paused so re-enabling doesn't insta-fire
  }

  // Auto-heal: recompute the currently-stale alerts on the shown ticker+pkg (draw is sig-gated, so we
  // rescan here), then create-first-delete-after so a failed create never loses an alert. 2 API calls
  // total regardless of how many drifted. Scope = this chart's symbol only.
  async function autoUpdateStale() {
    if (autoBusy) return;
    const data = readNode();
    if (!data || !data.cfg || data.valid === false || !data.levels || data.cfg.linesOn === false) return;
    const ctx = chartCtx(); if (!ctx || ctx.bare !== data.ticker) return; // symbol spec for alertInner; guard against a mid-swap
    const stale = [];
    for (const L of LINES) {
      const lv = data.levels[L.src]; const price = lv ? lv[L.field] : null;
      if (price == null || !isFinite(price) || price <= 0) continue;
      const lc = data.cfg.levels && data.cfg.levels[L.key]; if (!lc || lc.on === false) continue; // only shown levels
      const mine = (myAlerts.get(akey(data.ticker, L.key)) || []).find((a) => a.pkg === data.pkgCat);
      if (mine && mine.price != null && Math.abs(mine.price - price) > 0.01) stale.push({ key: L.key, oldId: mine.id, label: L.label, newPrice: price, pkg: data.pkgCat });
    }
    if (!stale.length) return;
    autoBusy = true;
    try {
      const created = await tvAlertPost("create_alerts", { payload: stale.map((s) => alertInner(ctx.sym, ctx.res, ctx.bare, s.newPrice, s.label, s.key, s.pkg)) });
      if (!created.ok || !Array.isArray(created.j.r)) { toast(alertErr(created, tr("tv.vAutoFailed")), true); return; }
      const oldIds = [];
      for (let i = 0; i < stale.length; i++) {
        const s = stale[i], nid = created.j.r[i] && created.j.r[i].alert_id;
        if (nid == null) continue; // this one didn't create → leave its old alert alone
        const k = akey(ctx.bare, s.key), list = myAlerts.get(k) || [];
        const idx = list.findIndex((a) => a.id === s.oldId); if (idx >= 0) list.splice(idx, 1); // drop the stale entry
        list.push({ id: nid, pkg: s.pkg, price: s.newPrice }); myAlerts.set(k, list); // cache the fresh one
        oldIds.push(s.oldId);
      }
      if (oldIds.length) await tvAlertPost("delete_alerts", { payload: { alert_ids: oldIds } }); // now safe to remove the old
      lastSig = ""; // repaint → the stale cues clear
      toast(tri("tv.autoUpdated", { n: oldIds.length, s: oldIds.length === 1 ? "" : "s", ticker: ctx.bare }));
    } catch (e) { /* leave state as-is; next mark retries */ } finally { autoBusy = false; }
  }

  // ISOLATED tv.js loads later (document_idle) and asks us to re-emit the current symbol.
  window.addEventListener(EV.hello, () => { lastSym = ""; });

  const boot = setInterval(() => {
    if (window.TradingViewApi && window.TradingViewApi.activeChart) { clearInterval(boot); setInterval(tick, 100); tick(); loadAlertIndex(); } // one list_alerts to seed the alert cache
  }, 300);
})();
