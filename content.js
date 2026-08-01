// GexSync: mirror gex/options profile (90d/latest/next) + settings-panel
// collapse across GEXbot tabs. Tickers untouched. Bus = chrome.storage.local.
(function () {
  const KEY = "gexsync" + location.pathname; // profile channel, always per page
  const CFG_KEY = "gexsync-cfg";
  const MASSIVE_KEY = "gexsync-massive"; // Massive.com API key + fundamentals cfg
  let applyingRemote = false; // suppress re-broadcast during programmatic click

  // chrome.runtime?.id is falsy once this content script is orphaned by an
  // extension reload/update; guard reads/writes so orphans don't throw uncaught.
  const alive = () => !!chrome.runtime?.id;
  const send = (obj) => { if (alive()) chrome.storage.local.set(obj); };
  const get = (keys, cb) => { if (alive()) chrome.storage.local.get(keys, cb); };

  // Only /classic and /state get the sync UI. GEXbot is a SPA: navigating to
  // /research, /api, /pricing, … keeps this (already-injected) script alive, so
  // gate every side-effect on the live path and hide our UI when off those pages.
  const onSyncPage = () => /^\/(classic|state)(?=$|[/?#])/.test(location.pathname);

  // ---- brand tokens + fonts (shared with the popup / replay bar) ----
  const T = {
    mint: "#16E0A3", azure: "#4AA3FF", red: "#FF5C5C", amber: "#FFB454",
    ink: "#E7E9EA", muted: "#9AA0AA", glass: "rgba(22,20,31,.82)",
    ui: "'IBM Plex Sans',system-ui,-apple-system,sans-serif",
    mono: "'JetBrains Mono',ui-monospace,SFMono-Regular,monospace",
  };
  // Inject the packaged woff2 once at document level (covers light DOM + shadow
  // roots — @font-face isn't scoped). No external requests.
  function injectFonts() {
    if (!alive() || document.getElementById("gexsync-fonts")) return;
    const u = (f) => chrome.runtime.getURL(`fonts/${f}`);
    const st = document.createElement("style");
    st.id = "gexsync-fonts";
    st.textContent =
      `@font-face{font-family:'Space Grotesk';font-weight:400 700;font-display:swap;src:url('${u("SpaceGrotesk.woff2")}') format('woff2')}` +
      `@font-face{font-family:'IBM Plex Sans';font-weight:400 700;font-display:swap;src:url('${u("IBMPlexSans.woff2")}') format('woff2')}` +
      `@font-face{font-family:'JetBrains Mono';font-weight:400 700;font-display:swap;src:url('${u("JetBrainsMono.woff2")}') format('woff2')}`;
    (document.head || document.documentElement).appendChild(st);
  }
  injectFonts();

  // Channel scope: "page" appends pathname (state/classic separate); "all" shares.
  const scopedKey = (base, scope) => (scope === "all" ? base : base + location.pathname);
  let panelScope = "all"; // config-driven, kept live via onChanged below
  let watermark = true; // append this tab's profile to the chart's ticker watermark
  let zoomSync = false; // live chart-zoom sync + hold-through-refresh (see zoom.js); opt-in
  let groupShot = false; // camera captures ALL synced panes → one ZIP (see shot.js); opt-in
  let settingsNav = false; // mirror Settings-panel navigation (gear/alerts/history/home); opt-in
  let showDte = false; // append days-to-expiry (or (AGG)) to the watermark; opt-in, needs watermark on
  let settingsSync = false; // mirror the bottom Settings controls across tabs; opt-in, only while all in-scope panels open
  let pdShow = { o: false, h: false, l: false, c: false }; // prev-day OHLC lines on the chart; each opt-in
  let pdLabelPos = "left"; // label placement: left | center | right
  let buzzOn = false; // ApeWisdom Reddit mentions in the pill's details panel; opt-in, no key
  let watchlist = []; // symbols the pill's cycle arrows step through (Ticker mode, 2+); curated in the popup
  const LINES_KEY = "gexsync-lines"; // per-ticker horizontal lines: { TICKER: [line] } in storage
  let lines = {};       // mirror of storage[LINES_KEY] — the source of truth for what renders
  let chartMode = ""; // "" | "line" | "draw" — chart tools state, global across panes (mirrors
                      // gexsync-cfg.chartMode via storage.onChanged). "" = off; non-empty = tools on
                      // (reticle + locked chart + right-click menu). line = horizontal price lines;
                      // draw = left-drag freehand/arrows.
  let toolMode = "line"; // "line" | "draw" — remembered sub-mode; the pill re-arms to this (cfg.toolMode)
  const normMode = (m) => (m === "trigger" ? "line" : (m === "line" || m === "draw") ? m : ""); // legacy "trigger"→"line"
  const DRAW_KEY = "gexsync-drawings"; // durable drawings (localStorage): { TICKER: [{scope,page,...}] }
  let draws = {};     // mirror of storage[DRAW_KEY] — global + page scopes (permanent)
  let tabDraws = {};  // session-lived tab-scoped drawings (sessionStorage): { TICKER: [{scope:"tab",...}] }
  let drawTool = "free"; // "free" | "arrow" — current draw tool (global via cfg.drawTool)
  let activeScope = "page"; // scope for NEW drawings: "global" | "page" | "tab" (global via cfg.drawScope)
  let lineColor = "#FFC24A"; // themes all line-mode visuals (reticle, badge, lines); via cfg.lineColor
  let drawColor = "#4AA3FF"; // themes all draw visuals (reticle, badge, strokes); via cfg.drawColor
  let matrixOn = false; // easter egg: matrix rain behind the panes; off by default, unlocked in the popup
  const readPd = (c) => ({ o: c?.pdO === true, h: c?.pdH === true, l: c?.pdL === true, c: c?.pdC === true });
  const panelKey = () => scopedKey("gexsync-panel", panelScope);
  const settingsKey = () => scopedKey("gexsync-settings", panelScope);
  chrome.storage.local.get(CFG_KEY, (r) => {
    if (r[CFG_KEY]?.panelScope) panelScope = r[CFG_KEY].panelScope;
    watermark = r[CFG_KEY]?.watermark !== false; // default on
    zoomSync = r[CFG_KEY]?.zoomSync === true; // default off (opt-in)
    groupShot = r[CFG_KEY]?.groupShot === true; // default off (opt-in)
    settingsNav = r[CFG_KEY]?.settingsNav === true; // default off (opt-in)
    showDte = r[CFG_KEY]?.dte === true; // default off (opt-in)
    settingsSync = r[CFG_KEY]?.settingsSync === true; // default off (opt-in)
    pdShow = readPd(r[CFG_KEY]);
    pdLabelPos = r[CFG_KEY]?.pdLabel || "left";
    buzzOn = r[CFG_KEY]?.buzz === true; // default off (opt-in)
    watchlist = r[CFG_KEY]?.watchlist || [];
    matrixOn = r[CFG_KEY]?.matrix === true; // default off (opt-in easter egg)
    chartMode = normMode(r[CFG_KEY]?.chartMode ?? (r[CFG_KEY]?.triggerArmed ? "trigger" : "")); // shared; legacy trigger→line
    toolMode = r[CFG_KEY]?.toolMode || (chartMode === "draw" ? "draw" : "line");
    drawTool = r[CFG_KEY]?.drawTool || "free";
    activeScope = r[CFG_KEY]?.drawScope || "page";
    lineColor = r[CFG_KEY]?.lineColor || r[CFG_KEY]?.triggerColor || "#FFC24A"; // migrate old triggerColor
    drawColor = r[CFG_KEY]?.drawColor || "#4AA3FF";
    zHudOn();
  });
  chrome.storage.local.get(LINES_KEY, (r) => { lines = r[LINES_KEY] || {}; writeLinesNode(); });
  chrome.storage.local.get(DRAW_KEY, (r) => { draws = r[DRAW_KEY] || {}; writeLinesNode(); });
  try { tabDraws = JSON.parse(sessionStorage["gexsync-draws-tab"] || "{}"); } catch (e) { tabDraws = {}; } // per-tab session drawings

  // Mode gates what syncs (one axis at a time; panel-collapse always syncs):
  //   profiles — gex + options profiles sync; ticker independent
  //   ticker   — the ticker syncs across state+classic; profiles independent
  //   replay   — handled by replay.js
  const MODE_KEY = "gexsync-mode";
  const TICKER_KEY = "gexsync-ticker"; // cross-page (state + classic share the ticker)
  const SESSION_KEY = "replay-session"; // replay.js's live session; locks the pill mode-cycle
  let mode = "profiles";
  let replayLocked = false; // a replay session is loaded/running → don't let the pill switch modes
  chrome.storage.local.get([MODE_KEY, SESSION_KEY], (r) => { if (r[MODE_KEY]) mode = r[MODE_KEY] === "live" ? "profiles" : r[MODE_KEY]; replayLocked = !!r[SESSION_KEY] && r[SESSION_KEY].phase !== "idle"; renderChip(); });
  const profileSync = () => mode === "profiles";
  const tickerSync = () => mode === "ticker";

  function keywordOf(btn) {
    const t = btn.textContent.toLowerCase();
    if (t.includes("90d")) return "90d";
    if (t.includes("latest")) return "latest";
    if (t.includes("next")) return "next";
    return null;
  }

  // gex group has a 90d button; options group has latest + next.
  function getGroups() {
    let gex = null, options = null;
    for (const g of document.querySelectorAll(".MuiToggleButtonGroup-root")) {
      const kws = [...g.querySelectorAll("button")].map(keywordOf);
      if (kws.includes("90d")) gex = g;
      else if (kws.includes("latest") && kws.includes("next")) options = g;
    }
    return { gex, options };
  }

  function selectedKeyword(group) {
    const sel = group && group.querySelector('button[aria-pressed="true"]');
    return sel ? keywordOf(sel) : null;
  }

  function applyProfile(groupName, keyword) {
    const group = getGroups()[groupName];
    if (!group) return;
    const target = [...group.querySelectorAll("button")].find(b => keywordOf(b) === keyword);
    if (!target || target.getAttribute("aria-pressed") === "true") return; // no-op guard ends echoes
    applyingRemote = true;
    target.click();
    setTimeout(() => { applyingRemote = false; }, 300);
  }

  function watch(group, groupName) {
    if (!group) return null;
    const obs = new MutationObserver(() => {
      if (applyingRemote || !profileSync()) return; // gex/options only sync in Live mode
      const keyword = selectedKeyword(group);
      // ponytail: t forces onChanged to fire even when keyword repeats
      if (keyword) send({ [KEY]: { group: groupName, keyword, t: performance.now() } });
    });
    obs.observe(group, { attributes: true, subtree: true, attributeFilter: ["aria-pressed", "class"] });
    return obs;
  }

  // (Re)attach the gex/options observers whenever their group elements appear or
  // swap. /state renders TWO groups that can mount on different ticks; the old
  // boot code latched after the first one appeared, leaving the other unwatched →
  // /state profiles didn't sync (classic has only the gex group, so never hit it).
  let watchedGex = null, watchedOptions = null, gexObs = null, optionsObs = null;
  function watchGroups() {
    const { gex, options } = getGroups();
    if (gex && gex !== watchedGex) { gexObs?.disconnect(); gexObs = watch(gex, "gex"); watchedGex = gex; }
    if (options && options !== watchedOptions) { optionsObs?.disconnect(); optionsObs = watch(options, "options"); watchedOptions = options; }
  }

  // ---- settings-panel collapse (chevron): ChevronLeft = collapsed ----
  const chevronSvg = () =>
    // page nav also has chevron icons; the panel toggle is the one inside a button
    [...document.querySelectorAll('svg[data-testid="ChevronLeftIcon"], svg[data-testid="ChevronRightIcon"]')]
      .find((s) => s.closest("button")) || null;

  function panelCollapsed() {
    const svg = chevronSvg();
    return svg ? svg.getAttribute("data-testid") === "ChevronLeftIcon" : null;
  }

  function applyPanel(collapsed) {
    const cur = panelCollapsed();
    if (cur === null || cur === collapsed) return; // already there: no-op guard ends echoes
    applyingRemote = true;
    chevronSvg().closest("button").click();
    setTimeout(() => { applyingRemote = false; }, 300);
  }

  function watchPanel() {
    const svg = chevronSvg();
    if (!svg) return false;
    const toolbar = svg.closest("button").parentElement; // small, stable 3-icon bar
    new MutationObserver(() => {
      if (applyingRemote) return;
      const collapsed = panelCollapsed();
      if (collapsed !== null) send({ [panelKey()]: { collapsed, t: performance.now() } });
    }).observe(toolbar, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-testid"] });
    return true;
  }

  // ---- settings-panel navigation sync (gear / alerts / history / home) ----
  // The Settings panel and its sub-views (alerts config, alert history) are React
  // view swaps with NO url/route to read — so detect the view by its heading text
  // and navigate by clicking the panel's own nav icons. Same state-mirror machine
  // as panel-collapse, generalized from a boolean to a 4-view registry. Opt-in
  // (settingsNav); the page-axis follows panelScope (Cross-page scope).
  const navKey = () => scopedKey("gexsync-nav", panelScope);
  const napSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const iconBtn = (t) => [...document.querySelectorAll("button")].find((b) => b.querySelector(`svg[data-testid="${t}"]`)) || null;
  const panelOpen = () => !!iconBtn("HomeIcon"); // Home icon exists ONLY while the Settings panel is open; the gear only exists on the chart

  // Canonical read: heading text uniquely names the view (the active sub-view also
  // hides its own nav icon, but the heading is the sturdier signal).
  function navView() {
    if (!panelOpen()) return "chart";
    const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((e) => e.textContent.trim());
    if (heads.some((h) => /alerts history/i.test(h))) return "history";
    if (heads.some((h) => /\balerts$/i.test(h))) return "alerts"; // "{TICKER} alerts"
    return "settings"; // panel open, no sub-view heading = settings root
  }

  // Navigate to a target view idempotently (≤2 clicks). The guard is held across
  // the whole sequence so intermediate views don't echo onto the bus, and lastNav
  // is pinned to the applied view so the poll below doesn't re-broadcast it.
  async function applyNav(view) {
    if (navView() === view) return; // already there: no-op ends echoes
    applyingRemote = true;
    try {
      if (view === "chart") { iconBtn("HomeIcon")?.click(); }
      else {
        // sub-view → settings root: drop to chart first so the gear reopens the root
        if (view === "settings" && panelOpen()) { iconBtn("HomeIcon")?.click(); await napSleep(250); }
        if (!panelOpen()) { iconBtn("SettingsIcon")?.click(); await napSleep(250); } // gear only exists on the chart
        if (view === "alerts") iconBtn("NotificationsIcon")?.click();
        else if (view === "history") iconBtn("HistoryIcon")?.click();
        // "settings": panel is now open at its root — nothing more to click
      }
      lastNav = view;
    } finally {
      setTimeout(() => { applyingRemote = false; }, 400);
    }
  }

  // Poll-driven (like watchSwitches): the panel mounts/unmounts its whole subtree,
  // so a single fixed observer target is unreliable. Cheap re-read; only real
  // transitions hit the bus.
  let lastNav = null; // null = unseeded: seed from the live view on activation WITHOUT broadcasting
  function watchNav() {
    if (applyingRemote || !settingsNav) return;
    const v = navView();
    if (lastNav === null) { lastNav = v; return; } // first active poll (boot with toggle on, or off→on): adopt current view, don't publish it onto peers
    if (v === lastNav) return;
    lastNav = v;
    send({ [navKey()]: { view: v, t: performance.now() } });
  }

  // ---- Sync chart settings: mirror the bottom Settings controls (Chart Type,
  // Profile Alignment, Time Zone) across tabs. Those controls only exist in the DOM
  // while the Settings panel is OPEN, so we sync only while EVERY in-scope tab has it
  // open (a presence beacon tracks that) — then every peer is guaranteed clickable.
  // Scope follows Cross-page scope. A colored box marks the synced section; when not
  // all panels are open, a "N/M panels open" hint explains why sync is idle. Opt-in.
  const onState = () => /^\/state/.test(location.pathname);
  const toggleGroup = (labels) => [...document.querySelectorAll(".MuiToggleButtonGroup-root")]
    .find((g) => { const t = [...g.querySelectorAll("button")].map((b) => b.textContent.trim()); return labels.every((l) => t.includes(l)); }) || null;
  const pressedLabel = (g) => g && ([...g.querySelectorAll("button")].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent.trim() || null);
  const tzCombo = () => [...document.querySelectorAll("input[role=combobox]")].find((i) => /\(utc/i.test(i.value || "")) || null;
  const settingsOpenHere = () => !!tzCombo(); // stable open signal: the TZ select stays mounted the whole time Settings is open, unlike the toggle groups which re-render on click (and would flicker allOpen false mid-click)

  function settingsState() {
    const ct = toggleGroup(["Line", "Candles"]);
    if (!ct) return null; // Settings not open here
    return {
      chart: pressedLabel(ct)?.toLowerCase() || null,
      align: pressedLabel(toggleGroup(["Left", "Center", "Right"]))?.toLowerCase() || null,
      tz: tzCombo()?.value || null,
    };
  }
  function clickToggle(labels, target) {
    if (!target) return;
    const g = toggleGroup(labels); if (!g) return;
    const btns = [...g.querySelectorAll("button")];
    if (btns.find((b) => b.getAttribute("aria-pressed") === "true")?.textContent.trim().toLowerCase() === target) return; // no-op guard
    btns.find((b) => b.textContent.trim().toLowerCase() === target)?.click();
  }
  function applyTz(tz) {
    const combo = tzCombo();
    if (!tz || !combo || (combo.value || "") === tz) return;
    combo.click(); // open the MUI Select menu (options render in a portal)
    setTimeout(() => {
      const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === tz);
      if (opt) opt.click(); else combo.blur(); // no match: leave it
    }, 160);
  }
  function applySettings(msg) {
    if (Date.now() < settingsBusyUntil) return; // I'm the just-clicked master — ignore incoming so an echo can't revert me
    const state = msg && msg.state;
    if (!state || !settingsState()) return; // no payload, or controls gone here — nothing to click
    applyingRemote = true;
    try {
      clickToggle(["Line", "Candles"], state.chart);
      clickToggle(["Left", "Center", "Right"], state.align);
      applyTz(state.tz);
    } finally {
      setTimeout(() => { applyingRemote = false; }, 500);
    }
  }

  // Click-driven master (the zoom-sync authority pattern): the tab where you click a
  // Settings control is the authority. It broadcasts ONCE (no poll/read race) and holds
  // a busy window during which it ignores incoming echoes, so it can't be reverted.
  const SETTINGS_BUSY_MS = 1200;
  let settingsBusyUntil = 0, pushTimer = 0;
  function isSettingsControl(el) {
    if (!el || !el.closest) return false;
    const g = el.closest(".MuiToggleButtonGroup-root");
    if (g) { const t = [...g.querySelectorAll("button")].map((b) => b.textContent.trim()); return t.includes("Line") || t.includes("Left"); }
    if (el.closest("[role=combobox]") === tzCombo()) return true;                                  // the TZ select
    const opt = el.closest('[role="option"]'); if (opt && /\(utc/i.test(opt.textContent || "")) return true; // a TZ menu option
    return false;
  }
  function pushSettings(tries) {
    if (!settingsSync) return;
    const s = allOpen ? settingsState() : null; // gate on all-open AND controls being ready
    if (!s) { if ((tries || 0) < 4) pushTimer = setTimeout(() => pushSettings((tries || 0) + 1), 130); return; } // gate down / mid-render: retry briefly, then give up if genuinely not all-open
    send({ [settingsKey()]: { state: s, master: TAB, t: performance.now() } });
  }
  document.addEventListener("click", (e) => {
    if (!settingsSync || applyingRemote) return; // ignore our own programmatic (apply) clicks
    if (!isSettingsControl(e.target)) return;
    settingsBusyUntil = Date.now() + SETTINGS_BUSY_MS; // this tab is the authority for a beat
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushSettings(0), 130); // let GEXbot update the DOM, then read + broadcast once
  }, true);

  // "All in-scope panels open" presence — mirrors the group-count beacon (per-tab key,
  // expiry heartbeat, prune stale). Scope: "all" counts every tab; else same page-type.
  let allOpen = false, spOpen = 0, spTotal = 0;
  const spKey = () => "gexsync-sp:" + TAB;
  setInterval(() => {
    if (!alive()) return;
    if (!onSyncPage() || !settingsSync) { chrome.storage.local.remove(spKey()); allOpen = false; spOpen = spTotal = 0; return; }
    send({ [spKey()]: { page: location.pathname, open: settingsOpenHere(), exp: Date.now() + 3000 } });
    get(null, (all) => {
      const now = Date.now(), stale = []; let total = 0, open = 0;
      for (const k in all) {
        if (!k.startsWith("gexsync-sp:")) continue;
        const e = all[k];
        if (!e || e.exp <= now) { stale.push(k); continue; }
        if (panelScope !== "all" && e.page !== location.pathname) continue; // by-page: same page-type only
        total++; if (e.open) open++;
      }
      if (stale.length && alive()) chrome.storage.local.remove(stale);
      spTotal = total; spOpen = open; allOpen = total > 0 && open === total;
    });
  }, 1000);

  // Box (all open) or "N/M panels open" hint (not all open), drawn around the section.
  const scopeWord = () => panelScope === "all" ? "all your GEXbot tabs" : (onState() ? "your /state tabs" : "your /classic tabs");
  const boxColor = () => panelScope === "all" ? T.mint : (onState() ? T.azure : T.amber);
  let boxEl = null, badgeEl = null, hintEl = null;
  function ssRect() {
    const els = [toggleGroup(["Line", "Candles"]), toggleGroup(["Left", "Center", "Right"]), (tzCombo()?.closest(".MuiFormControl-root") || tzCombo())].filter(Boolean);
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  }
  function paintSettingsBox() {
    if (!settingsSync || !onSyncPage() || !settingsOpenHere()) { hideBox(); hideHint(); return; }
    if (allOpen) { hideHint(); drawBox(); } else { hideBox(); drawHint(); }
  }
  function drawBox() {
    const r = ssRect(); if (!r) { hideBox(); return; }
    if (!boxEl) {
      boxEl = document.createElement("div");
      boxEl.style.cssText = "position:fixed;pointer-events:none;border-radius:10px;z-index:2147481800;box-sizing:border-box;";
      badgeEl = document.createElement("div");
      badgeEl.style.cssText = "position:absolute;top:-9px;right:8px;pointer-events:auto;cursor:help;font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;padding:1px 6px;border-radius:9px;white-space:nowrap;";
      boxEl.appendChild(badgeEl);
      (document.body || document.documentElement).appendChild(boxEl);
    }
    const pad = 6, c = boxColor();
    boxEl.style.left = (r.left - pad) + "px"; boxEl.style.top = (r.top - pad) + "px";
    boxEl.style.width = (r.right - r.left + pad * 2) + "px"; boxEl.style.height = (r.bottom - r.top + pad * 2) + "px";
    boxEl.style.border = `1.5px solid ${c}`;
    badgeEl.style.background = c; badgeEl.style.color = "#08110c"; badgeEl.textContent = "⟳ GexSync synced";
    badgeEl.title = `GexSync is syncing these settings across ${scopeWord()} (Cross-page scope: ${panelScope === "all" ? "All tabs" : "By page"}). Turn off “Sync chart settings” in the GexSync popup to stop.`;
    boxEl.style.display = "block";
  }
  function hideBox() { if (boxEl) boxEl.style.display = "none"; }
  function drawHint() {
    const r = ssRect(); if (!r) { hideHint(); return; }
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.style.cssText = `position:fixed;pointer-events:auto;cursor:help;z-index:2147481800;font:600 10px 'IBM Plex Sans',system-ui,sans-serif;padding:3px 8px;border-radius:8px;background:${T.glass};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:${T.ink};border:1px dashed ${T.muted};white-space:nowrap;`;
      (document.body || document.documentElement).appendChild(hintEl);
    }
    hintEl.style.left = (r.left - 6) + "px"; hintEl.style.top = (r.top - 26) + "px";
    hintEl.textContent = `GexSync settings sync · ${spOpen}/${spTotal} panels open`;
    hintEl.title = `Settings sync waits until every ${panelScope === "all" ? "GEXbot tab" : (onState() ? "/state tab" : "/classic tab")} has its Settings panel open. Open them all to sync; turn off “Sync chart settings” in the popup to disable.`;
    hintEl.style.display = "block";
  }
  function hideHint() { if (hintEl) hintEl.style.display = "none"; }
  setInterval(paintSettingsBox, 300);

  // ---- options-profile switches (delta/gamma/vanna/charm), /state only ----
  const OPTS_KEY = "gexsync-opts" + location.pathname; // page-scoped; only /state has them
  const OPTS = ["delta", "gamma", "vanna", "charm"];

  function getSwitches() {
    const map = {};
    for (const sw of document.querySelectorAll(".MuiSwitch-root")) {
      const input = sw.querySelector('input[type=checkbox]');
      const name = sw.closest("label")?.textContent.trim().toLowerCase();
      if (input && OPTS.includes(name)) map[name] = input;
    }
    return map;
  }

  function applyOpts(state) {
    const sw = getSwitches();
    let clicked = false;
    for (const k of OPTS) {
      if (sw[k] && k in state && sw[k].checked !== state[k]) {
        if (!clicked) applyingRemote = true; // arm guard before first click
        sw[k].click();
        clicked = true;
      }
    }
    if (clicked) setTimeout(() => { applyingRemote = false; }, 300);
  }

  // Watch the switch STATE (Mui-checked class), not a change event: GEXbot's
  // collapsed floating quick-panel swaps in its OWN greek switches (different
  // DOM elements), and its controls don't fire `change` on the main panel's
  // switches. Observing state catches toggles from either panel — but the
  // element set swaps on collapse, so re-attach whenever the first switch
  // changes identity. (Same reason the gex group's aria-pressed observer works.)
  let lastOptsState = "", swFirst = null, swCount = 0, swObs = null;
  function watchSwitches() {
    const switches = [...document.querySelectorAll(".MuiSwitch-root")];
    if (!switches.length || (switches[0] === swFirst && switches.length === swCount)) return; // same set already observed
    swFirst = switches[0]; swCount = switches.length;
    if (swObs) swObs.disconnect();
    swObs = new MutationObserver(() => {
      if (applyingRemote || !profileSync()) return;
      const sw = getSwitches(), state = {};
      for (const k of OPTS) if (sw[k]) state[k] = sw[k].checked;
      const s = JSON.stringify(state);
      if (s === lastOptsState) return; // ignore ripple/class noise; only real toggles
      lastOptsState = s;
      send({ [OPTS_KEY]: { state, t: performance.now() } });
    });
    for (const el of switches) swObs.observe(el, { attributes: true, subtree: true, attributeFilter: ["class", "aria-checked"] });
  }
  setInterval(watchSwitches, 600); // re-observe as the panel/floating-panel swaps the switch elements

  // ---- ticker sync (Ticker mode) ----
  // Apply the ticker via GEXbot's URL-hash scheme (/state#TICKER#profile) as an
  // IN-APP hashchange (no reload): the SPA switches ticker + renders the price line
  // live off the hash. See applyTicker below. Encodes THIS tab's own profile so
  // profiles stay independent across the group.
  // Target the ticker combobox specifically — GEXbot's Settings panel adds a
  // "Time Zone" combobox at DOM index 0, so a bare querySelector("input[role=
  // combobox]") would read the timezone and mistake it for a ticker change.
  const tickerInput = () =>
    [...document.querySelectorAll("input[role=combobox]")].find(
      (el) => (el.closest(".MuiAutocomplete-root, .MuiFormControl-root")?.querySelector("label")?.textContent || "").trim().toLowerCase() === "ticker"
    ) || null;
  const tickerValue = () => tickerInput()?.value || null;
  // GEXbot renders "es future" mode by suffixing the ticker: SPX -> "SPX⇒ES"
  // (U+21D2). Ticker SYNC must key off the real underlying, so strip the suffix;
  // the spot↔es toggle is synced separately (see below) as its own ticker-axis.
  const baseTicker = () => { const v = tickerValue(); return v ? (v.match(/^[A-Za-z0-9.]+/)?.[0] || v) : null; };
  const esFutureOn = () => { const v = tickerValue(); return v == null ? null : /⇒/.test(v); };
  // The toggle is "spot price" | "<product> future" — the future label varies by
  // ticker (es / nq / rty / …), so don't hardcode "es future". The spot button is
  // constant; the future button is its sibling whose label ends in "future".
  const esToggleBtn = (on) => {
    const spot = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().toLowerCase() === "spot price");
    if (!on) return spot || null;
    if (!spot) return null;
    return [...spot.parentElement.querySelectorAll("button")].find((b) => b !== spot && /future$/i.test(b.textContent.trim()))
      || [...document.querySelectorAll("button")].find((b) => b !== spot && /future$/i.test(b.textContent.trim())) || null;
  };
  // Ticker groups: scope ticker sync to same-color tabs, so e.g. a green group on
  // TSLA and a red group on NVDA don't touch each other. Every tab starts green;
  // change some to red (etc.) to split them off. The group lives in sessionStorage
  // (per-tab, survives the reload — localStorage is shared across same-origin
  // tabs, so it can't hold a per-tab value).
  // Brand ticker-group swatches, harmonized to one lightness (see theme.css).
  const GROUPS = [
    { name: "green", color: "#16E0A3" },
    { name: "red", color: "#FF5C5C" },
    { name: "blue", color: "#4AA3FF" },
    { name: "yellow", color: "#FFC24A" },
    { name: "purple", color: "#B57AFF" },
    { name: "cyan", color: "#22D3EE" },
    { name: "orange", color: "#FF8C42" },
    { name: "pink", color: "#FF5CC8" },
  ];
  // Validate against GROUPS so a stale value (e.g. "none" from an older build)
  // can't leave a tab displaying green while broadcasting on a dead channel.
  const groupName = () => { const g = sessionStorage.gexsyncGroup; return GROUPS.some((x) => x.name === g) ? g : "green"; };
  const tickerChan = () => `${TICKER_KEY}:${groupName()}`;
  // Compact profile for the pill: "90d" | "latest" | "next" | "latest·delta".
  const profileLabel = () => {
    const { gex, options } = getGroups();
    const g = selectedKeyword(gex);
    if (g) return g;
    const o = selectedKeyword(options), sw = getSwitches(), gk = OPTS.find((k) => sw[k]?.checked);
    return gk ? `${o || "opt"}·${gk}` : o || "?";
  };
  function profileSegment() {
    const { gex, options } = getGroups();
    const g = selectedKeyword(gex);
    if (g) return g; // gex mode: 90d | latest | next
    const o = selectedKeyword(options), sw = getSwitches();
    const greek = OPTS.find((k) => sw[k]?.checked);
    if (o && greek) return `option#${o}#greek:${greek}`; // options mode
    return o || "latest";
  }
  // Per-tab id for the group-count presence beacon + the chip. Regenerate on every
  // load so duplicated tabs (which copy sessionStorage) get distinct ids.
  const TAB = (sessionStorage.gexsyncTab = Math.random().toString(36).slice(2));
  function applyTicker(ticker) {
    if (!ticker || baseTicker() === ticker) return; // already on this ticker (ignore the es-future suffix)
    applyingRemote = true; // suppress the poll re-broadcasting the value we're applying
    // In-app hashchange (NO reload): GEXbot's SPA switches ticker AND renders the
    // intraday price line live off the hash. Encodes THIS tab's own profile so
    // profiles stay independent. (A full-page reload flakily skips the price-history
    // fetch — hist/<ticker>/spot; the in-app hashchange fires it reliably.)
    location.hash = `#${ticker}#${profileSegment()}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    flashSync(`to ${ticker}`); // brief non-blocking "syncing <group> to <ticker>"
    setTimeout(() => { applyingRemote = false; }, 1500); // outlast the switch so we don't echo
  }

  // ---- watchlist cycle (Ticker mode) ----
  // prev/next relative to THIS tab's current ticker; if the current ticker isn't in
  // the watchlist, step in from the end (◂) or the start (▸). Null unless the pill's
  // cycle arrows should show at all (Ticker mode + a 2+ list).
  const cycleTargets = () => {
    const n = watchlist.length;
    if (!tickerSync() || n < 2) return null;
    const cur = baseTicker(), i = watchlist.indexOf(cur);
    return {
      prev: i === -1 ? watchlist[n - 1] : watchlist[(i - 1 + n) % n],
      next: i === -1 ? watchlist[0] : watchlist[(i + 1) % n],
    };
  };

  // ---- horizontal lines (per-ticker) ----
  // ONE store, several front doors: the pill's line-mode + chart clicks, the popup's
  // Lines section, and (later) a programmatic draw op all end up in add/remove/clearLines
  // here. The store lives in chrome.storage keyed by TICKER; a
  // MAIN-world renderer (lines.js) draws whatever the current ticker's lines node holds.
  // Line records mirror mvsync/TradingView's createShape object so an agent payload IS
  // the stored record: { id, shape, points:[{time,price}], text, overrides }.
  const linesNode = () => { let n = document.getElementById("__gxlines"); if (!n) { n = document.createElement("div"); n.id = "__gxlines"; n.style.display = "none"; document.documentElement.appendChild(n); } return n; };
  // page = classic|state from the pathname. A tab renders the union of: global drawings, this
  // page's page-scoped drawings, and this tab's own session-lived tab-scoped drawings.
  const pageName = () => location.pathname.replace(/^\//, "").split(/[/?#]/)[0] || "";
  const newDrawId = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const visibleDraws = (tk, pg) => [
    ...((tk && draws[tk]) || []).filter((d) => d.scope === "global" || (d.scope === "page" && d.page === pg)),
    ...((tk && tabDraws[tk]) || []),
  ];
  // per-scope counts for the current ticker/page, so the menu can dim empty "Clear …" items.
  const drawCounts = (tk, pg) => {
    const arr = (tk && draws[tk]) || [];
    return { global: arr.filter((d) => d.scope === "global").length, page: arr.filter((d) => d.scope === "page" && d.page === pg).length, tab: ((tk && tabDraws[tk]) || []).length };
  };
  let lastLinesSig = "";
  function writeLinesNode() {
    const tk = baseTicker(), pg = pageName();
    const payload = JSON.stringify({ ticker: tk, lines: (tk && lines[tk]) || [], mode: chartMode, inWatch: !!(tk && watchlist.includes(tk)), draws: tk ? visibleDraws(tk, pg) : [], tool: drawTool, scope: activeScope, lineColor, drawColor, drawCounts: drawCounts(tk, pg) });
    if (payload === lastLinesSig) return; // ticker/lines/mode/watch/draws unchanged — skip
    lastLinesSig = payload;
    linesNode().textContent = payload;
  }
  function saveLines(next) { lines = next; chrome.storage.local.set({ [LINES_KEY]: next }); writeLinesNode(); }
  function saveDraws(next) { draws = next; chrome.storage.local.set({ [DRAW_KEY]: next }); writeLinesNode(); }
  function saveTabDraws(next) { tabDraws = next; try { sessionStorage["gexsync-draws-tab"] = JSON.stringify(next); } catch (e) {} writeLinesNode(); }
  // Chart tools state is global: write cfg so storage.onChanged repaints every pane. Setting a
  // sub-mode (line|draw) also remembers it as toolMode, so the pill re-arms to it after off.
  const setChartMode = (m) => chrome.storage.local.get(CFG_KEY, (r) => chrome.storage.local.set({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), chartMode: m, ...((m === "line" || m === "draw") ? { toolMode: m } : {}) } }));
  const setDrawTool = (t) => chrome.storage.local.get(CFG_KEY, (r) => chrome.storage.local.set({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), drawTool: t } }));
  const setDrawScope = (s) => chrome.storage.local.get(CFG_KEY, (r) => chrome.storage.local.set({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), drawScope: s } }));

  // Easter-egg matrix rain: feed matrix.js (MAIN world) the on-flag + this pane's live
  // context via the #__gxmatrix node, same bridge/sig-guard idiom as writeLinesNode.
  const matrixNode = () => { let n = document.getElementById("__gxmatrix"); if (!n) { n = document.createElement("div"); n.id = "__gxmatrix"; n.style.display = "none"; document.documentElement.appendChild(n); } return n; };
  let lastMatrixSig = "";
  function writeMatrixNode() {
    const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
    const payload = JSON.stringify({ on: matrixOn && onSyncPage(), ticker: baseTicker(), profile: profileLabel(), color: g.color });
    if (payload === lastMatrixSig) return; // on/ticker/profile/color unchanged — skip
    lastMatrixSig = payload;
    matrixNode().textContent = payload;
  }
  setInterval(writeMatrixNode, 500); // keeps ticker/profile/group changes flowing to the rain
  // The public line API. Object shape matches mvDraw({ price, shape, text, overrides }).
  function addLine(ticker, o) {
    if (!ticker || !o || typeof o.price !== "number" || !isFinite(o.price)) return { ok: false, error: "bad-price" };
    if (o.shape && o.shape !== "horizontal_line") return { ok: false, error: "unsupported-shape", shape: o.shape };
    const id = Math.random().toString(36).slice(2, 9);
    const line = { id, shape: "horizontal_line", points: [{ time: o.time ?? null, price: o.price }], text: o.text ?? null,
      // no default linecolor → the line follows the live line color; an explicit override wins
      overrides: { linewidth: 1, linestyle: "dashed", ...(o.overrides || {}) } };
    saveLines({ ...lines, [ticker]: [...(lines[ticker] || []), line] });
    return { ok: true, id, ticker };
  }
  function removeLine(ticker, id) {
    if (!lines[ticker]) return { ok: false, error: "no-such-ticker" };
    const kept = lines[ticker].filter((l) => l.id !== id);
    const next = { ...lines }; if (kept.length) next[ticker] = kept; else delete next[ticker];
    saveLines(next); return { ok: true, removed: id };
  }
  function clearLines(ticker) { if (!lines[ticker]) return { ok: true, cleared: 0 }; const n = lines[ticker].length; const next = { ...lines }; delete next[ticker]; saveLines(next); return { ok: true, cleared: n }; }
  function clearAllLines() { const n = Object.values(lines).reduce((a, l) => a + l.length, 0); saveLines({}); return { ok: true, cleared: n }; }
  const listLines = (ticker) => (ticker ? (lines[ticker] || []).slice() : { ...lines });

  // MAIN-world (lines.js menu) → here: add/remove/clear lines, or toggle the watchlist.
  window.addEventListener("gexsync-line-place", (e) => { const p = e.detail && e.detail.price; if (typeof p === "number") addLine(baseTicker(), { price: p }); });
  window.addEventListener("gexsync-line-remove", (e) => { const id = e.detail && e.detail.id; if (id) removeLine(baseTicker(), id); });
  window.addEventListener("gexsync-lines-clear", () => clearLines(baseTicker()));
  window.addEventListener("gexsync-watchlist-toggle", () => {
    const t = baseTicker(); if (!t) return;
    const next = watchlist.includes(t) ? watchlist.filter((s) => s !== t) : [...watchlist, t];
    chrome.storage.local.get(CFG_KEY, (r) => chrome.storage.local.set({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), watchlist: next } }));
  });
  // MAIN-world (lines.js draw capture/menu) → here: add/undo/clear drawings, set tool/scope.
  // Each drawing's points are {tod: ms-since-midnight, p: price} — see lines.js for the anchoring.
  // Undo acts on the active scope; clear targets the scope the menu passes (defaults to active).
  // A drawing is stamped with the scope it was made in.
  const scopeMatch = (d, sc, pg) => d.scope === sc && (sc !== "page" || d.page === pg);
  window.addEventListener("gexsync-draw-add", (e) => {
    const d = e.detail, tk = baseTicker(); if (!tk || !d || !Array.isArray(d.points) || !d.points.length) return;
    const rec = { id: newDrawId(), scope: activeScope, type: d.type === "arrow" ? "arrow" : "free", width: d.width || 2, points: d.points }; // no color → follows the live draw color
    if (activeScope === "page") rec.page = pageName();
    if (activeScope === "tab") saveTabDraws({ ...tabDraws, [tk]: [...(tabDraws[tk] || []), rec] });
    else saveDraws({ ...draws, [tk]: [...(draws[tk] || []), rec] }); // global | page
  });
  window.addEventListener("gexsync-draw-undo", () => {
    const tk = baseTicker(); if (!tk) return; const pg = pageName();
    if (activeScope === "tab") { const arr = tabDraws[tk]; if (!arr || !arr.length) return; const next = { ...tabDraws }, kept = arr.slice(0, -1); if (kept.length) next[tk] = kept; else delete next[tk]; return void saveTabDraws(next); }
    const arr = draws[tk]; if (!arr) return;
    let idx = -1; for (let i = arr.length - 1; i >= 0; i--) if (scopeMatch(arr[i], activeScope, pg)) { idx = i; break; }
    if (idx < 0) return; const kept = arr.slice(0, idx).concat(arr.slice(idx + 1)); const next = { ...draws }; if (kept.length) next[tk] = kept; else delete next[tk]; saveDraws(next);
  });
  window.addEventListener("gexsync-draws-clear", (e) => {
    const tk = baseTicker(); if (!tk) return; const pg = pageName();
    const sc = (e && e.detail && e.detail.scope) || activeScope; // menu passes the scope to clear
    if (sc === "tab") { if (!tabDraws[tk]) return; const next = { ...tabDraws }; delete next[tk]; return void saveTabDraws(next); }
    const arr = draws[tk]; if (!arr) return; const kept = arr.filter((d) => !scopeMatch(d, sc, pg)); const next = { ...draws }; if (kept.length) next[tk] = kept; else delete next[tk]; saveDraws(next);
  });
  window.addEventListener("gexsync-draw-tool", (e) => { const t = e.detail && e.detail.tool; if (t === "free" || t === "arrow") setDrawTool(t); });
  window.addEventListener("gexsync-draw-scope", (e) => { const s = e.detail && e.detail.scope; if (s === "global" || s === "page" || s === "tab") setDrawScope(s); });
  window.addEventListener("gexsync-chart-mode", (e) => { const m = normMode(e.detail && e.detail.mode); setChartMode(m); }); // menu Line / Draw / Off (legacy trigger→line)
  // Keep the render node pointed at the current ticker (writeLinesNode is sig-guarded,
  // so this only touches the DOM when the ticker, its lines, mode, or drawings change).
  setInterval(writeLinesNode, 500);
  // Any tab (or the popup) mutating a store → refresh this tab's cache + render node.
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c[LINES_KEY]) { lines = c[LINES_KEY].newValue || {}; writeLinesNode(); }
    if (c[DRAW_KEY]) { draws = c[DRAW_KEY].newValue || {}; writeLinesNode(); }
  });
  // Programmatic seam (inert in this build — nothing sends these here; a later driver
  // relays to exactly these cmds). Same API as the functions above.
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || !msg.cmd || !String(msg.cmd).startsWith("gexsync-line-")) return;
    if (msg.cmd === "gexsync-line-add") reply(addLine(msg.ticker || baseTicker(), msg));
    else if (msg.cmd === "gexsync-line-remove") reply(removeLine(msg.ticker || baseTicker(), msg.id));
    else if (msg.cmd === "gexsync-line-list") reply({ ok: true, lines: listLines(msg.ticker) });
    else if (msg.cmd === "gexsync-line-clear") reply(msg.ticker ? clearLines(msg.ticker) : clearAllLines());
    return true; // async reply
  });

  // ---- boot repair (stuck hash-URL loads) ----
  // A fresh full-page load of a #TICKER#profile URL (F5 / reopen) flakily lands
  // STUCK — GEXbot fails to RENDER the chart (EMPTY: "No data to display"; or
  // PARTIAL: gex bars but no price line). It's a render failure, not a fetch one —
  // hist/spot can return 200 and the chart still be blank — so we detect the CHART,
  // not the network. EMPTY: the "No data" text (robust at market open). PARTIAL:
  // the price line is missing — count distinct canvas rows carrying the cyan line
  // (the wiggle spans many; a flat spot-marker/empty chart does not). Fix IN-APP:
  // a PROFILE bounce (throwaway profile -> the tab's own, from the hash) re-triggers
  // a live render with no ticker flip and fixes EMPTY; escalate to a TICKER bounce
  // (brief flip) which re-fires hist/spot and fixes a stubborn PARTIAL. NOT "load
  // history" — that loads a specific DATE's replay data, not the live line. Only
  // fires on a stuck hash-URL boot; bare-url loads are reliable and the in-app sync
  // never lands here. The repair is harmless on an already-good tab (it just
  // re-renders), so an over-eager detection at the very open costs only a flicker.
  function repairBoot() {
    const m = onSyncPage() && location.hash.match(/^#([A-Za-z0-9.]+)#(.+)$/); // #TICKER#profile
    if (!m) return;
    const ticker = m[1], intended = m[2];
    const lineRows = () => { // distinct canvas rows carrying the cyan price line
      const c = document.querySelector("canvas");
      if (!c) return 0;
      try {
        const w = c.width, h = c.height, d = c.getContext("2d").getImageData(0, 0, w, h).data;
        let rows = 0;
        for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) { const p = (y * w + x) * 4; if (d[p + 3] > 60 && d[p] < 130 && d[p + 1] > 150 && d[p + 2] > 180) { if (++n > 15) { rows++; break; } } } }
        return rows;
      } catch (e) { return 99; } // can't read (tainted?) — assume fine, don't repair
    };
    const loaded = () => !/No data to display/i.test(document.body.innerText) && lineRows() >= 6; // chart actually drew the line
    let tries = 0;
    const attempt = () => {
      if (!alive() || loaded()) return; // the price line's data is in
      if (++tries > 3) return; // give up — don't loop forever
      applyingRemote = true; // keep the bounce local — don't echo onto the sync bus
      // tries 1-2: profile bounce (no ticker flip). tries 3: ticker bounce (brief
      // flip) to force a fresh hist/spot when a profile bounce can't.
      location.hash = tries <= 2
        ? `#${ticker}#${/^90d/.test(intended) ? "latest" : "90d"}`
        : `#${ticker === "SPY" ? "QQQ" : "SPY"}#${intended}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      setTimeout(() => {
        location.hash = `#${ticker}#${intended}`; // back to THIS tab's own ticker + profile
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        setTimeout(() => { applyingRemote = false; }, 1500);
        setTimeout(attempt, 3000); // re-check; escalate if still stuck
      }, 1800);
    };
    setTimeout(attempt, 5000); // settle first — a normal load fetches hist/spot in ~2-3s
  }
  repairBoot();

  let lastTicker = null;
  setInterval(() => {
    if (!onSyncPage()) return;
    const t = baseTicker(); // underlying only — the es-future suffix syncs on its own channel
    if (lastTicker === null) { lastTicker = t; return; }       // baseline — don't broadcast the initial value
    if (applyingRemote || !tickerSync()) { lastTicker = t; return; }
    if (t && t !== lastTicker) {
      lastTicker = t;
      send({ [tickerChan()]: { ticker: t, t: performance.now() } });
      flashSync(`to ${t}`); // flash on the tab that changed the ticker, too
    }
  }, 400);

  // ---- zoom: Live sync (hold through refresh + match same-ticker tabs) + Save/Recall ----
  // The chart lives in zoom.js (MAIN world); we bridge via hidden DOM nodes. Keys are
  // ticker-scoped (no group); the page axis follows panelScope (cross-page scope):
  // "all" → state+classic share; "page" → separate. liveKey = the held/synced range;
  // savedKey = a Save/Recall snapshot slot.
  const zScope = () => (panelScope === "all" ? "" : location.pathname.replace(/^\//, "") + ":");
  const liveKey = () => `gexsync-zoom:${zScope()}${baseTicker()}`;
  const savedKey = () => `gexsync-zoom-saved:${zScope()}${baseTicker()}`;
  const RECALL_KEY = "gexsync-zoom-recall";
  let applySeq = 0, zoomTicker = null;
  const zNode = (id) => { let n = document.getElementById(id); if (!n) { n = document.createElement("div"); n.id = id; n.style.display = "none"; document.documentElement.appendChild(n); } return n; };
  const readCurZoom = () => { try { const z = JSON.parse(document.getElementById("__gxZoom").textContent); return z && isFinite(z.yMin) && isFinite(z.yMax) ? z : null; } catch (e) { return null; } };
  const zoomBusy = () => { try { return (JSON.parse(document.getElementById("__gxZoom").textContent).busyUntil || 0) > Date.now(); } catch (e) { return false; } }; // user actively zooming this tab → it's the authority
  const writeHold = (z) => { zNode("__gxZoomHold").textContent = z && isFinite(z.yMin) && isFinite(z.yMax) ? JSON.stringify({ yMin: z.yMin, yMax: z.yMax }) : ""; };
  const oneShot = (z) => { if (z && isFinite(z.yMin) && isFinite(z.yMax)) zNode("__gxZoomApply").textContent = JSON.stringify({ yMin: z.yMin, yMax: z.yMax, seq: ++applySeq }); };
  const adoptLive = () => { if (!zoomSync || !onSyncPage() || !baseTicker()) return; const k = liveKey(); get(k, (r) => { if (alive()) writeHold(r[k] || null); }); };
  // ---- live-zoom state indicator: the state machine takes over the pill's leading
  // section (the loop-glyph circle + "mode: …" label). idle → grab ("master", mint)
  // → settle ("setting…", the loop glyph spins for the beat before it takes) → took
  // ("synced →", pop) → back to mode. A peer push shows "← synced". Cosmetic.
  // ponytail: known snag — the indicator can hang on "setting…" if the capture event
  // doesn't fire; double-clicking the chart resets its zoom and clears it. Deeper fix
  // + a debug-record session are noted for the next release (see the vault).
  const ZHUD = (() => {
    const C = { mint: T.mint, azure: T.azure, amber: T.amber, muted: T.muted };
    const LBL = { profiles: "Profiles", ticker: "Ticker", replay: "Replay" };
    let state = "idle", decayT = 0, stopT = 0, spin = null;
    const mark = () => document.getElementById("gexsync-chip-mark");
    const modeEl = () => document.getElementById("gexsync-chip-mode");
    const svg = () => { const m = mark(); return m && m.querySelector("svg"); };
    const stopSpin = () => { if (spin) { try { spin.cancel(); } catch (e) {} spin = null; } };
    const pop = () => { const s = svg(); if (s) s.animate([{ transform: "scale(1)" }, { transform: "scale(1.55)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" }); };
    const spinOnce = () => { const s = svg(); if (!s) return; stopSpin(); spin = s.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 520, easing: "linear" }); spin.onfinish = () => { spin = null; }; };
    const put = (m, md, label, c) => { m.style.color = c; md.textContent = label; md.style.color = c; };
    const paint = (s) => {
      const m = mark(), md = modeEl(); if (!m || !md) return;
      state = s; clearTimeout(decayT);
      if (s === "idle") { stopSpin(); m.style.color = C.muted; md.style.color = ""; md.textContent = `${LBL[mode] || "Profiles"}${replayLocked ? " 🔒" : ""}`; }
      else if (s === "grab") { stopSpin(); put(m, md, "master", C.mint); pop(); }
      else if (s === "settle") { put(m, md, "setting…", C.amber); spinOnce(); }
      else if (s === "took") { stopSpin(); put(m, md, "synced →", C.mint); pop(); decayT = setTimeout(() => paint("idle"), 850); }
      else if (s === "follow") { stopSpin(); put(m, md, "← synced", C.azure); pop(); decayT = setTimeout(() => paint("idle"), 850); }
    };
    return {
      show: (on) => { if (!on) paint("idle"); },
      grab: () => { if (state !== "grab") paint("grab"); clearTimeout(stopT); stopT = setTimeout(() => paint("settle"), 150); },
      took: () => { clearTimeout(stopT); paint("took"); },
      follow: () => { if (state === "grab" || state === "settle") return; paint("follow"); },
    };
  })();
  const zHudOn = () => ZHUD.show(zoomSync && onSyncPage());
  ["wheel", "pointerdown", "pointermove"].forEach((t) =>
    document.addEventListener(t, (e) => { if (zoomSync && onSyncPage() && e.target && e.target.tagName === "CANVAS" && (t !== "pointermove" || e.buttons)) ZHUD.grab(); }, true));

  // capture: the user changed the zoom → it becomes the live value for this ticker
  window.addEventListener("gexsync-zoom", () => {
    if (!zoomSync || !onSyncPage() || !baseTicker()) return;
    const z = readCurZoom(); if (z) { send({ [liveKey()]: { yMin: z.yMin, yMax: z.yMax, t: Date.now() } }); writeHold(z); ZHUD.took(); }
  });
  // adopt the live value on ticker switch
  setInterval(() => { if (!zoomSync || !onSyncPage()) return; const bt = baseTicker(); if (bt && bt !== zoomTicker) { zoomTicker = bt; adoptLive(); } }, 400);
  // Recall (broadcast from popup): apply the saved range. With sync on it becomes the
  // live value (holds + propagates); with sync off it's a one-shot snap.
  function recallZoom() {
    if (replayLocked || !onSyncPage() || !baseTicker()) return;
    const k = savedKey(); get(k, (r) => { const z = r[k]; if (!z || !alive()) return;
      if (zoomSync) { send({ [liveKey()]: { yMin: z.yMin, yMax: z.yMax, t: Date.now() } }); writeHold(z); }
      else oneShot(z);
    });
  }

  // ---- Group Shot (opt-in): the pane camera captures EVERY synced pane and
  // downloads one ZIP — grid.png (stitched + captioned), a PNG/JPEG per pane, and
  // manifest.json. Each pane records the DATA datetime it's showing (live = latest,
  // replay = the parked point), not the wall clock. Fan-in over storage; the click
  // is a real gesture, so THIS tab builds and downloads the ZIP (no service worker).
  const SHOOT_REQ = "gexsync-shoot-req";
  const SHOT_PREFIX = "gexsync-shot:";
  const safe = (s) => String(s == null ? "x" : s).replace(/[^A-Za-z0-9._-]+/g, "_");
  // The shown DATA time comes from GEXbot's visible "update" panel (date + time).
  // We must read the DOM, NOT the in-page props: in replay every prop timestamp
  // (arr[i], unix_timestamp, data.timestamp) is TODAY-anchored — only the panel shows
  // the real historical date. GEXbot renders ET; convert to epoch DST-correctly.
  const tzOffset = (utcMs) => { // ms offset of America/New_York from UTC at that instant
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
    const o = {}; for (const x of p) o[x.type] = x.value; const h = o.hour === "24" ? 0 : +o.hour;
    return Date.UTC(o.year, o.month - 1, o.day, h, +o.minute, +o.second) - utcMs;
  };
  function etToEpoch(dateStr, timeStr) {
    try {
      const [mo, da, yr] = dateStr.split("/").map(Number);
      const m = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP])/i); let h = (+m[1]) % 12; if (/p/i.test(m[4])) h += 12;
      const wall = Date.UTC(yr, mo - 1, da, h, +m[2], +m[3]), ms = wall - tzOffset(wall);
      return { epoch: Math.round(ms / 1000), iso: new Date(ms).toISOString() };
    } catch (e) { return { epoch: null, iso: null }; }
  }
  function readDomDataTime() {
    const t = document.body ? document.body.innerText : "";
    const dm = t.match(/\b\d{1,2}\/\d{2}\/\d{4}\b/), tm = t.match(/\b\d{1,2}:\d{2}:\d{2}\s*[AP]M\b/i); // date has year; profile "(07/20)" doesn't
    if (!dm || !tm) return null;
    return { ...etToEpoch(dm[0], tm[0]), displayET: `${dm[0]}, ${tm[0].toUpperCase()} ET` };
  }
  // Drive shot.js (MAIN world): write the request node, await its response event.
  function localShot() {
    return new Promise((resolve) => {
      const seq = Date.now() + ":" + Math.random().toString(36).slice(2, 6);
      let done = false;
      const finish = (v) => { if (done) return; done = true; window.removeEventListener("gexsync-shot", onShot); resolve(v); };
      const onShot = () => { try { const r = JSON.parse(document.getElementById("__gxShotRes").textContent); if (r && r.seq === seq) finish(r); } catch (e) {} };
      window.addEventListener("gexsync-shot", onShot);
      zNode("__gxShotReq").textContent = JSON.stringify({ seq });
      setTimeout(() => finish(null), 2000);
    });
  }
  // A broadcast landed → capture THIS pane and publish {png, meta} for the initiator.
  async function respondShot(seq) {
    if (!onSyncPage()) return;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // The shown date lives in the settings panel, so read it while the panel is OPEN.
    // Expand if the user had it collapsed, read date/time, THEN collapse for a
    // full-width shot (an open panel squeezes the canvas in a split pane). Panel
    // toggles are suppressed from panel-sync by applyPanel's applyingRemote guard.
    if (panelCollapsed() === true) { applyPanel(false); await sleep(300); }
    const dataTime = readDomDataTime();
    if (panelCollapsed() === false) { applyPanel(true); await sleep(450); } // collapse + let Chart.js resize
    const shot = await localShot();
    const st = getState();
    send({ [SHOT_PREFIX + st.id]: { seq, png: shot && shot.png, meta: { ...st, dataTime, zoom: readCurZoom() } } });
  }

  const fileNameFor = (m) => `${safe(m.ticker)}-${safe(m.page)}-${safe(m.gex || m.options)}-${m.id}.jpg`;
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  async function stitch(shots) {
    const imgs = await Promise.all(shots.map((s) => loadImg(s.png).catch(() => null)));
    const pairs = shots.map((s, i) => ({ s, im: imgs[i] })).filter((p) => p.im);
    if (!pairs.length) return null;
    const cols = Math.ceil(Math.sqrt(pairs.length)), rows = Math.ceil(pairs.length / cols);
    const cw = Math.max(...pairs.map((p) => p.im.width)), ch = Math.max(...pairs.map((p) => p.im.height));
    const cap = 52, pad = 14;
    const cvs = document.createElement("canvas");
    cvs.width = cols * cw + (cols + 1) * pad;
    cvs.height = rows * (ch + cap) + (rows + 1) * pad;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#0b0b12"; ctx.fillRect(0, 0, cvs.width, cvs.height);
    pairs.forEach((p, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = pad + c * (cw + pad), y = pad + r * (ch + cap + pad);
      ctx.drawImage(p.im, x, y, cw, ch);
      const m = p.s.meta;
      ctx.textBaseline = "top";
      ctx.font = "700 22px 'JetBrains Mono',monospace"; ctx.fillStyle = T.ink;
      ctx.fillText(`${m.ticker || "?"} · ${m.page} · ${m.gex || m.options || "?"}`, x + 2, y + ch + 8);
      ctx.font = "400 16px 'JetBrains Mono',monospace"; ctx.fillStyle = T.muted;
      ctx.fillText((m.dataTime && m.dataTime.displayET) || "", x + 2, y + ch + 32);
    });
    return cvs.toDataURL("image/png");
  }
  function buildManifest(shots, hasGrid) {
    const cfg = { mode, panelScope, watermark, zoomSync };
    return {
      tool: "GexSync group-shot", version: chrome.runtime.getManifest().version,
      capturedAt: new Date().toISOString(), initiator: getState().id, gexsync: cfg,
      grid: hasGrid ? "grid.png" : null,
      panes: shots.map((s) => ({
        file: fileNameFor(s.meta), shortId: s.meta.id, group: s.meta.group,
        ticker: s.meta.ticker, page: s.meta.page, profile: s.meta.gex || s.meta.options || null,
        greeks: s.meta.greeks, collapsed: s.meta.collapsed, dataTime: s.meta.dataTime, zoom: s.meta.zoom || null,
      })),
    };
  }

  // ---- minimal store-only ZIP (PNG/JPEG are already compressed → no deflate) ----
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const strBytes = (s) => new TextEncoder().encode(s);
  const dataUrlBytes = (u) => { const b = atob(u.slice(u.indexOf(",") + 1)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  function makeZip(entries) {
    const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const d = new Date(); // stamp entries with the capture time (DOS date/time fields)
    const dosT = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dosD = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    const parts = [], central = []; let offset = 0;
    for (const e of entries) {
      const name = strBytes(e.name), crc = crc32(e.bytes), size = e.bytes.length;
      const local = [].concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(dosT), u16(dosD), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, e.bytes);
      central.push({ name, crc, size, offset });
      offset += local.length + name.length + size;
    }
    let cdSize = 0;
    for (const c of central) {
      const h = [].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(dosT), u16(dosD), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      parts.push(new Uint8Array(h), c.name);
      cdSize += h.length + c.name.length;
    }
    parts.push(new Uint8Array([].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(offset), u16(0))));
    return new Blob(parts, { type: "application/zip" });
  }
  // Save via the background downloads API so we can land in a Downloads/gexsync/
  // subfolder (the anchor `download` attr flattens "/" → "_"). Fall back to a plain
  // anchor download (Downloads root, subfolder in name flattened) if that fails.
  async function downloadBlob(blob, name) {
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
    const ok = dataUrl && alive() && await new Promise((res) => {
      try { chrome.runtime.sendMessage({ type: "gexsync-download", url: dataUrl, filename: name }, (r) => res(!chrome.runtime.lastError && r && r.ok)); }
      catch (e) { res(false); }
    });
    if (ok) return;
    const url = URL.createObjectURL(blob); // fallback
    const a = document.createElement("a"); a.href = url; a.download = name.split("/").pop();
    (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // Poll storage for this round's pane responses; resolve when the count is steady
  // for 800 ms (everyone in) or a 4 s cap (a pane is missing/slow) — whichever first.
  // Cap allows for each pane's expand→read→collapse→capture before it answers.
  function collectShots(seq) {
    return new Promise((resolve) => {
      const found = new Map(); let lastN = -1, steadyAt = Date.now(), start = Date.now();
      const iv = setInterval(async () => {
        const all = await new Promise((r) => get(null, r)) || {};
        for (const [k, v] of Object.entries(all)) if (k.startsWith(SHOT_PREFIX) && v && v.seq === seq && v.png) found.set(k, v);
        if (found.size !== lastN) { lastN = found.size; steadyAt = Date.now(); }
        if ((found.size > 0 && Date.now() - steadyAt >= 800) || Date.now() - start >= 4000) { clearInterval(iv); resolve([...found.values()]); }
      }, 200);
    });
  }
  let shooting = false;
  async function groupShotRound() {
    // clear any stale responses, then broadcast — every pane (incl. this one) answers
    const all = await new Promise((r) => get(null, r)) || {};
    const stale = Object.keys(all).filter((k) => k.startsWith(SHOT_PREFIX));
    if (stale.length) await new Promise((r) => chrome.storage.local.remove(stale, r));
    send({ [SHOOT_REQ]: { seq: Date.now() + ":" + Math.random().toString(36).slice(2, 6), t: Date.now() } });
    const seq = (await new Promise((r) => get(SHOOT_REQ, (x) => r(x[SHOOT_REQ])))).seq;
    const shots = await collectShots(seq);
    if (!shots.length) { showToast("GexSync: no charts captured for the group shot."); return; }
    const grid = await stitch(shots);
    const entries = [];
    if (grid) entries.push({ name: "grid.png", bytes: dataUrlBytes(grid) });
    shots.forEach((s) => { if (s.png) entries.push({ name: fileNameFor(s.meta), bytes: dataUrlBytes(s.png) }); });
    entries.push({ name: "manifest.json", bytes: strBytes(JSON.stringify(buildManifest(shots, !!grid), null, 2)) });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await downloadBlob(makeZip(entries), `gexsync/gexsync-group-${stamp}.zip`); // subfolder under Downloads/
    if (alive()) chrome.storage.local.remove(shots.map((s) => SHOT_PREFIX + s.meta.id));
  }
  // Intercept the pane camera: capture-phase, so GEXbot's own menu never opens.
  document.addEventListener("click", (e) => {
    if (!groupShot || !onSyncPage()) return;
    const btn = e.target.closest && e.target.closest("button");
    if (!btn || !btn.querySelector('svg[data-testid="CameraAltIcon"]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (shooting) return; shooting = true;
    groupShotRound().catch(() => {}).finally(() => { shooting = false; });
  }, true);

  // ---- spot ↔ es-future sync (Ticker mode; it's a ticker-axis view) ----
  // GEXbot has no dedicated key for it — the toggle just flips the ticker to
  // "SPX⇒ES". Sync it group-scoped like the ticker, but APPLY by clicking the
  // toggle button: it updates the chart live (no reload) and each page (classic /
  // state stores it separately) flips its own button, so it's cross-page safe.
  const ES_CHAN = () => `${TICKER_KEY}-es:${groupName()}`;
  // Brief sync flash so the spot↔future flip feels like the ticker-sync flow even
  // though it applies live (no reload → nothing to wait on). Auto-dismisses; shown
  // on every group tab (the one you toggled and the ones that follow).
  // Brief, non-blocking "syncing <group> · <detail>" card, auto-dismisses (~1.1s).
  // Shared by ticker sync and the spot↔future flip: a live sync has no reload to
  // wait on, so this is just quick confirmation on every group tab.
  // pointer-events:none — it never blocks interaction (unlike the old reload wait).
  let flashEl = null, flashTimer = null;
  function flashSync(detail) {
    const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
    if (!flashEl) {
      flashEl = document.createElement("div");
      flashEl.id = "gexsync-sync-flash";
      flashEl.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(8,8,14,.5);backdrop-filter:blur(2px);font-family:system-ui,-apple-system,sans-serif;color:#e7e9ea;pointer-events:none;transition:opacity .2s ease;";
      flashEl.innerHTML = `<div style="padding:18px 28px;border-radius:14px;background:rgba(20,18,32,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center">
        <div class="msg" style="font:600 15px system-ui"></div>
        <div class="sub" style="margin-top:8px;color:#9aa0aa;font-size:12px"></div></div>`;
      (document.body || document.documentElement).appendChild(flashEl);
    }
    flashEl.querySelector(".msg").innerHTML = `syncing <span style="color:${g.color}">${g.name}</span>`;
    flashEl.querySelector(".sub").textContent = detail;
    flashEl.style.display = "flex";
    flashEl.style.opacity = "1";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (!flashEl) return;
      flashEl.style.opacity = "0";
      setTimeout(() => { if (flashEl) flashEl.style.display = "none"; }, 220);
    }, 1100);
  }
  function flashEsSync(on) {
    const futLabel = (esToggleBtn(true)?.textContent.trim().toLowerCase()) || "es future";
    flashSync(on ? `spot price → ${futLabel}` : `${futLabel} → spot price`);
  }
  function applyEs(on) {
    const cur = esFutureOn();
    if (cur === null || cur === on) return; // this ticker has no es toggle, or already matched
    const b = esToggleBtn(on);
    if (!b) return;
    applyingRemote = true;
    b.click();
    setTimeout(() => { applyingRemote = false; }, 500); // outlast one poll tick so we don't echo
    flashEsSync(on); // mirror the ticker-sync overlay so followers show the change
  }
  let lastEs = null;
  setInterval(() => {
    if (!onSyncPage()) return;
    const on = esFutureOn();
    if (lastEs === null) { lastEs = on; return; }
    if (applyingRemote || !tickerSync()) { lastEs = on; return; }
    if (on !== null && on !== lastEs) {
      lastEs = on;
      send({ [ES_CHAN()]: { es: on, t: performance.now() } });
      flashEsSync(on); // flash on the tab that toggled it, too
    }
  }, 400);

  // ---- rate-limit toast: GEXbot answered 429 (see netwatch.js, MAIN world) ----
  // Dev-phase reloads can blow GEXbot's daily quota on /hist/spot; surface it so
  // you know to cool off. Auto-hides; re-arms on each new hit.
  let toastEl = null, toastTimer = null;
  function showToast(msg) {
    if (!alive()) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "gexsync-toast";
      toastEl.style.cssText = `position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483600;max-width:440px;padding:12px 18px;border-radius:12px;background:rgba(34,20,31,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid ${T.red};color:#FFD7D7;font:600 13px ${T.ui};box-shadow:0 12px 40px rgba(0,0,0,.55);text-align:center;`;
      (document.body || document.documentElement).appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.style.display = "none"; }, 9000);
  }
  window.addEventListener("gexsync-429", (e) => {
    const path = String(e.detail?.url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    showToast(`GexSync: GEXbot rate limit (${e.detail?.status}) on ${path || "API"} — cool off on reloads.`);
  });

  // ---- persistent chip: mode segment (click cycles mode) + group segment
  // (Ticker mode only, click cycles this tab's color group) ----
  let renderChip = () => {};
  function buildModeChip() {
    if (document.getElementById("gexsync-mode-chip")) return;
    const chip = document.createElement("div");
    chip.id = "gexsync-mode-chip";
    // bottom-LEFT, raised above the replay transport bar (left:20 bottom:20) so
    // they don't overlap in Replay mode; the split-view divider covered the right.
    // overflow:hidden so a segment's hover wash clips to the pill's own curve
    chip.style.cssText = `position:relative;display:flex;align-items:center;border-radius:9999px;overflow:hidden;background:${T.glass};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);color:${T.ink};font:600 13px ${T.ui};box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;`;
    // The pill lives in a bottom-anchored column, so the details panel can be a
    // SIBLING above it instead of a floating card positioned by hand: same left edge,
    // grows upward, and it follows the pill automatically when segments appear or
    // vanish (group segment, replay mark). No rect math, no reposition-on-resize.
    const stack = document.createElement("div");
    stack.id = "gexsync-stack";
    stack.style.cssText = "position:fixed;left:16px;bottom:72px;z-index:2147482000;display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:max-content;";
    const MODES = ["profiles", "ticker", "replay"];
    const LABEL = { profiles: "Profiles", ticker: "Ticker", replay: "Replay" };

    // brand mark glyph (the sync loop) at the far left, muted so it reads as
    // identity, not status
    const markSeg = document.createElement("span");
    markSeg.id = "gexsync-chip-mark";
    markSeg.style.cssText = `display:flex;align-items:center;padding:6px 3px 6px 13px;color:${T.muted};transition:color .16s;`;
    markSeg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform-box:fill-box;transform-origin:center"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4.5v5h5"/></svg>`;

    // chart-tools toggle — after the mark, before the label. Click to arm: shows the reticle,
    // locks pan/zoom, and takes over the chart's right-click for the tool menu. Plain on/off:
    // off → on (re-arms to the last sub-mode, cfg.toolMode) → off. Line vs Draw is chosen in the
    // right-click menu. GLOBAL — all panes toggle together via cfg.chartMode. Crosshair-circle
    // icon, tinted to the active sub-mode's color when armed.
    const trigSeg = document.createElement("span");
    trigSeg.id = "gexsync-chip-trigger";
    trigSeg.style.cssText = `display:flex;align-items:center;padding:6px 6px;cursor:pointer;color:${T.muted};transition:color .16s;`;
    trigSeg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><line x1="12" y1="1.5" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22.5" y2="12"/></svg>`;
    const paintTrigBtn = () => {
      trigSeg.style.color = chartMode === "line" ? lineColor : chartMode === "draw" ? drawColor : T.muted;
      trigSeg.title = chartMode === "line" ? "Chart tools: Line — reticle + locked chart; right-click for the tool menu (click → off)"
        : chartMode === "draw" ? "Chart tools: Draw — left-drag to draw on the chart; right-click for the tool menu (click → off)"
        : "Chart tools — click to turn on; right-click the chart to switch Line/Draw, copy a price, and add marks";
    };
    trigSeg.addEventListener("click", () => setChartMode(chartMode === "" ? (toolMode || "line") : "")); // toggle on↔off; on re-arms last sub-mode

    const modeSeg = document.createElement("span");
    modeSeg.id = "gexsync-chip-mode";
    // snug to the label now that "mode:" is gone (the pill already resizes between modes
    // when the group segment appears in Ticker, so a fixed width bought us nothing)
    modeSeg.style.cssText = "display:flex;align-items:center;gap:7px;padding:6px 13px 6px 7px;cursor:pointer;box-sizing:border-box;transition:color .16s;";
    modeSeg.title = "GexSync mode — click to cycle (Profiles / Ticker / Replay)";
    modeSeg.addEventListener("click", () => { if (replayLocked) return; send({ [MODE_KEY]: MODES[(MODES.indexOf(mode) + 1) % MODES.length] }); });

    const grpSeg = document.createElement("span");
    grpSeg.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 13px;cursor:pointer;border-left:1px solid rgba(255,255,255,.12);";
    grpSeg.title = "Ticker group — click to cycle color; only same-color tabs sync";
    grpSeg.addEventListener("click", () => {
      const i = GROUPS.findIndex((g) => g.name === groupName());
      sessionStorage.gexsyncGroup = GROUPS[(i + 1) % GROUPS.length].name;
      renderChip();
    });

    // Watchlist cycle bar — its OWN compact pill stacked below the main pill
    // (appended to the stack after the chip). Shown only in Ticker mode with a 2+
    // watchlist (paintCycle gates display); one click steps the whole color group.
    const cycleBar = document.createElement("div");
    cycleBar.id = "gexsync-cycle-bar";
    cycleBar.style.cssText = `display:none;align-items:center;gap:9px;padding:6px 14px;border-radius:9999px;background:${T.glass};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);color:${T.ink};font:600 12px ${T.mono};white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;`;
    // The prev/next symbol labels are clickable too (bigger targets than the arrows):
    // click AVGO to go back, NVDA to go forward. Hover brightens the whole side.
    const step = (glyph, dir, align) => {
      const el = document.createElement("span");
      el.style.cssText = `cursor:pointer;padding:0 2px;line-height:1;transition:color .16s;${glyph ? "font-size:15px" : `color:${T.muted};min-width:38px;text-align:${align}`}`;
      if (glyph) el.textContent = glyph;
      el.addEventListener("click", (e) => { e.stopPropagation(); cycleTicker(dir); });
      el.addEventListener("mouseenter", () => el.style.color = T.mint);
      el.addEventListener("mouseleave", () => el.style.color = glyph ? "" : T.muted);
      return el;
    };
    const cPrev = step("", -1, "right"), cBack = step("◂", -1), cFwd = step("▸", 1), cNext = step("", 1, "left");
    cycleBar.append(cPrev, cBack, cFwd, cNext);

    // info segment: this tab's id · page · ticker · profile — visible with the
    // side panel closed, replaces the top-left debug badge that blocked the nav
    // links. replay.js appends MASTER/client via chip.dataset.replayRole.
    // …and it doubles as the details panel's handle: hover opens, click pins.
    const infoSeg = document.createElement("span");
    infoSeg.style.cssText = `display:flex;align-items:center;gap:6px;padding:6px 14px;border-left:1px solid rgba(255,255,255,.12);font:500 12px ${T.mono};letter-spacing:.3px;white-space:nowrap;color:${T.ink};cursor:pointer;transition:background .16s;`;
    infoSeg.title = "Ticker details — hover to peek, click to pin open (Esc closes)";

    chip.append(markSeg, trigSeg, modeSeg, grpSeg, infoSeg);

    // Step to the prev/next watchlist ticker as if the user changed it: in-app
    // hashchange + a group broadcast (immediate, no 400ms poll lag). Pre-set
    // lastTicker so the poll doesn't re-broadcast the same value.
    const cycleTicker = (dir) => {
      const t = cycleTargets(); if (!t) return;
      const target = dir < 0 ? t.prev : t.next;
      if (!target || baseTicker() === target) return;
      location.hash = `#${target}#${profileSegment()}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      lastTicker = target;
      send({ [tickerChan()]: { ticker: target, t: performance.now() } });
      flashSync(`to ${target}`);
      setTimeout(paintCycle, 120); // relabel prev/next off the new current
    };
    const paintCycle = () => {
      // ALWAYS reserve the sub-pill slot so the main pill (and the details panel above
      // it) stay at one fixed height in every mode / watchlist size — the cycle bar
      // fills the slot in Ticker mode with 2+ names, and Replay's transport bar sits
      // just below the pill. Without an always-on slot the bottom-anchored pill dropped
      // when the cycle bar was absent (≤1 ticker) and collided with the replay bar.
      // The bar is only visible + clickable when there are prev/next targets; otherwise
      // the reserved slot is an invisible, non-interactive box.
      const t = cycleTargets(); // non-null only in Ticker mode with 2+ names
      cycleBar.style.display = "flex";
      cycleBar.style.visibility = t ? "visible" : "hidden";
      if (!t) return;
      cycleBar.style.color = (GROUPS.find((x) => x.name === groupName()) || GROUPS[0]).color; // group-tinted like the pill
      cPrev.textContent = t.prev; cNext.textContent = t.next;
      cBack.title = `Previous ticker: ${t.prev}`; cFwd.title = `Next ticker: ${t.next}`;
    };
    const shortId = TAB.slice(0, 3).toUpperCase();
    const sep = `<span style="color:${T.muted}">·</span>`;
    const paintInfo = () => {
      // role: MASTER in mint, client in azure (fed by replay.js)
      const r = mode === "replay" && chip.dataset.replayRole;
      const role = r ? ` ${sep} <span style="color:${r === "MASTER" ? T.mint : T.azure}">${r}</span>` : "";
      const page = location.pathname.replace(/^\//, "").toUpperCase();
      const prof = profileLabel().replace("90d", "90 days").toUpperCase();
      // Panel state rides the same dataset channel replay.js uses for the role:
      // "" closed, "1" peeking, "lock" pinned. Caret points up because the panel
      // opens upward; the wash makes the segment read as the thing that opened it.
      const st = chip.dataset.mvOpen || "";
      // amber = a source is failing (shown open OR closed, so you notice without
      // hovering); mint = just the open/pinned state. The panel says which and why.
      const warn = chip.dataset.mvWarn === "1";
      const cue = st === "lock" ? "🔒" : st ? "▴" : warn ? "●" : "";
      infoSeg.title = warn
        ? "A data source is failing — open for the reason"
        : "Ticker details — hover to peek, click to pin open (Esc closes)";
      infoSeg.style.background = st ? "rgba(22,224,163,.15)" : warn ? "rgba(255,180,84,.12)" : "transparent";
      // order: ticker · CLASSIC/STATE · profile [· role] · tab-id (titled, muted)
      infoSeg.innerHTML = `${tickerValue() || "?"} ${sep} ${page} ${sep} ${prof}${role} ${sep} <span title="tab id" style="cursor:help;color:${T.muted}">#${shortId}</span>` +
        (cue ? `<span style="color:${warn ? T.amber : T.mint};font-size:11px">${cue}</span>` : "");
    };
    // swatch + how many tabs share this group (min-width holds 2 digits steady)
    let groupCount = 1;
    const paintGroup = () => {
      const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
      grpSeg.innerHTML = `<span style="width:11px;height:11px;border-radius:2px;background:${g.color};box-shadow:0 0 0 1px rgba(255,255,255,.35)"></span><span>${g.name}</span><span style="min-width:15px;text-align:center">${groupCount}</span>`;
    };
    renderChip = () => {
      const m = MODES.includes(mode) ? mode : "profiles";
      // locked replay session → pill can't switch modes (Exit via the replay bar)
      modeSeg.textContent = `${LABEL[m]}${replayLocked ? " 🔒" : ""}`;
      modeSeg.style.cursor = replayLocked ? "default" : "pointer";
      modeSeg.title = replayLocked ? "Locked during replay session — Exit via the replay bar" : "GexSync mode — click to cycle (Profiles / Ticker / Replay)";
      const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
      // tint the pill by group only in Ticker mode (groups are inert otherwise)
      chip.style.color = m === "ticker" ? g.color : T.ink;
      grpSeg.style.display = m === "ticker" ? "flex" : "none";
      // the loop mark stays on the pill in EVERY mode now — Replay's transport bar no
      // longer carries its own (its anchor circle is hidden in replay.js), so there's
      // one consistent mark on the pill across Profiles / Ticker / Replay.
      markSeg.style.display = "flex";
      modeSeg.style.paddingLeft = "7px";
      paintGroup();
      paintInfo();
      paintCycle();
      paintTrigBtn();
    };
    stack.appendChild(chip);
    stack.appendChild(cycleBar); // below the pill; hidden (out of flow) until Ticker mode + 2+ watchlist
    (document.body || document.documentElement).appendChild(stack);
    mvBindPill(stack, infoSeg);
    setInterval(() => { paintInfo(); paintCycle(); }, 700); // ticker/profile change on their own (esp. post-reload)

    // Group-count presence: each ticker-mode tab heartbeats its group under its
    // own key (no shared map → no read-modify-write race); the count is how many
    // fresh entries share this tab's color. Stale entries are pruned as found.
    // ponytail: reads all storage every 1.5s — fine at this scale.
    const TP = "gexsync-tp:" + TAB;
    setInterval(() => {
      if (!alive()) return; // orphaned content script: stay quiet
      if (!onSyncPage() || mode !== "ticker") { chrome.storage.local.remove(TP); return; } // drop presence off-page / off-ticker
      send({ [TP]: { group: groupName(), exp: Date.now() + 5000 } });
      get(null, (all) => {
        const now = Date.now(), mine = groupName(), stale = [];
        let n = 0;
        for (const k in all) {
          if (!k.startsWith("gexsync-tp:")) continue;
          const e = all[k];
          if (!e || e.exp <= now) stale.push(k);
          else if (e.group === mine) n++;
        }
        if (stale.length && alive()) chrome.storage.local.remove(stale);
        groupCount = n || 1;
        paintGroup();
      });
    }, 1500);
    renderChip();
  }
  if (document.body) buildModeChip(); else window.addEventListener("DOMContentLoaded", buildModeChip);

  // The chart's reference date — GEXbot's "update" readout (date/time/spot). It's
  // the ONLY MM/DD/YYYY on the page and it mirrors the replay scrubber, so reading
  // it makes DTE replay-aware for free (parked point in replay, latest when live).
  // ponytail: single date leaf = update date; anchor to the "update" grid if GEXbot
  // ever renders a second date somewhere.
  function refDate() {
    for (const e of document.querySelectorAll("h6, p, span, div")) {
      if (e.childElementCount) continue;
      const m = e.textContent.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    }
    return null;
  }
  // Watermark suffix for the selected gex profile: "(AGG)" for 90d, "{n}DTE" for
  // latest/next (calendar days from the update date to the "(MM/DD)" in the button).
  // "" when there's no gex expiry to read (settings/alerts pages) or no ref date.
  function dteSuffix() {
    const sel = getGroups().gex?.querySelector('button[aria-pressed="true"]');
    if (!sel) return "";
    if (keywordOf(sel) === "90d") return "(AGG)";
    const md = sel.textContent.match(/\((\d{1,2})\/(\d{1,2})\)/); // "next (08/05)"
    const ref = refDate();
    if (!md || !ref) return "";
    const exp = new Date(ref.getFullYear(), +md[1] - 1, +md[2]);
    if (exp < ref) exp.setFullYear(exp.getFullYear() + 1); // year wrap (e.g. Dec ref, Jan expiry)
    return `${Math.round((exp - ref) / 86400000)}DTE`;
  }

  // Append this tab's profile to GEXbot's big ticker watermark (the <h6> over
  // the chart), e.g. "META" -> "META LATEST". React only rewrites it on ticker
  // change, so a light interval re-appends and keeps it synced to the profile.
  function paintWatermark() {
    if (!onSyncPage()) return;
    const tk = tickerValue();
    if (!tk) return;
    // In es-future mode GEXbot renders the watermark as the full contract
    // ("NDX⇒NQU6"), not the combobox value ("NDX⇒NQ") — but the contract STARTS
    // WITH the combobox value, so match on that. Then re-append the profile onto
    // the watermark's OWN first token so we keep the contract month intact
    // (GEXbot never puts a space in it; our profile suffix is the only space).
    const wm = [...document.querySelectorAll("h6.MuiTypography-h6")]
      .find((e) => { const first = e.textContent.trim().split(/\s+/)[0]; return first === tk || first.startsWith(tk); });
    if (!wm) return;
    const wmBase = wm.textContent.trim().split(/\s+/)[0]; // "NDX" | "NDX⇒NQU6"
    // off → strip back to just the ticker/contract; on → + profile
    const label = profileLabel();
    const prof = label.replace("90d", "90 days").toUpperCase();
    const dte = showDte && label !== "?" ? (dteSuffix() || "") : ""; // "{n}DTE" | "(AGG)"
    const base = watermark ? `${wmBase} ${prof}` : wmBase;
    const oneLine = watermark && dte ? `${base} ${dte}` : base;
    // Paint one line first — this also forces the element single-line so we can
    // measure its true width — then drop the DTE tag onto its own line when the
    // full string would collide with GEXbot's right-side control panel (short
    // browser windows). Measure always reflects single-line, so no oscillation;
    // both writes are synchronous, so the intermediate state never paints.
    if (wm.textContent !== oneLine) wm.textContent = oneLine;
    let want = oneLine;
    if (watermark && dte) {
      const bar = chevronSvg()?.closest("button")?.parentElement?.getBoundingClientRect();
      const r = wm.getBoundingClientRect();
      if (bar && r.right > bar.left && r.left < bar.right && r.bottom > bar.top && r.top < bar.bottom)
        want = `${base}\n${dte}`;
    }
    const ws = want.includes("\n") ? "pre-line" : "";
    if (wm.style.whiteSpace !== ws) wm.style.whiteSpace = ws;
    if (wm.textContent !== want) wm.textContent = want;
    // The "?" (Settings/Alerts) hint and the Massive fundamentals now share one
    // GexSync hover popover (see mvContent). Retire the native title tip so they
    // don't double up, and leave the watermark pointer-events:none (the popover
    // hit-tests the cursor, so the watermark never needs to eat chart clicks).
    if (wm.title) wm.title = "";
    if (wm.style.pointerEvents) wm.style.pointerEvents = "";
    // tint the watermark the group color in Ticker mode; GEXbot default otherwise
    wm.style.color = watermark && mode === "ticker" ? (GROUPS.find((g) => g.name === groupName()) || GROUPS[0]).color : "";
  }
  setInterval(paintWatermark, 700);

  // ---- Pill details panel: Massive fundamentals, Reddit buzz, profile hint -----
  // One panel shown only while hovering the big ticker watermark. On a chart it
  // shows the current ticker's Massive.com (Polygon) company details, fetched via
  // the background worker so the API key never touches this page (fetched once per
  // ticker and cached). On Settings/Alerts it shows the "no chart profile" hint
  // (the old native title tip, folded in here). Inert on a chart until a key is
  // saved. Per tab, gone off /classic|/state.
  let mvPanel = null, mvKeyReady = false, mvHover = false, mvLocked = false, mvLastHtml = "";
  const mvCache = new Map(); // TICKER -> {name,exch,mcap,sh,...} | {error,retry}
  const mvPrevCache = new Map(); // "TICKER|YYYY-MM-DD" -> {date,o,h,l,c,v} | {error,retry} — prev trading day
  const mvBusy = new Set(); // cache keys with a request in flight (the tick re-asks every 500ms)
  const bzCache = new Map(); // TICKER -> {rank,mentions,mentions24,rank24,of} | {error,retry} — ApeWisdom
  let bzUni = null; // { tk, rank, of, t } — rank among the tickers open in other synced tabs
  get(MASSIVE_KEY, (r) => { mvKeyReady = !!r[MASSIVE_KEY]?.key; });

  // A failure is cached like a result so the popover can explain itself — but a SOFT
  // failure carries a cooldown, and the prefetch tick re-asks once it lapses. That's
  // what rides out a free key's 5-calls/min quota: spacing requests can't (5/min is a
  // budget, not a burst rate, so fitting inside it means ~12s gaps, which would punish
  // paid keys for nothing). Hard failures — bad key, unsupported symbol — never retry.
  // ponytail: fixed cooldown, no token bucket; the per-day cache means bursts only
  // happen on the first load of a ticker set.
  const MV_SOFT = /^(rate limited|network error|fetch failed|HTTP 5\d\d)$/;
  const MV_COOL_MS = 20000;
  const mvFail = (e) => { const error = e || "fetch failed"; return { error, retry: MV_SOFT.test(error) ? Date.now() + MV_COOL_MS : 0 }; };
  const mvFresh = (v) => !!v && !(v.retry && Date.now() > v.retry);

  const mvCap = (n) => {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toFixed(0)}`;
  };
  const mvSh = (n) => n == null ? null : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B sh` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M sh` : `${n} sh`;
  const mvPad2 = (n) => String(n).padStart(2, "0");
  // Reference date for the prev-day lookup = GEXbot's "update" date (replay/live aware).
  const mvRefStr = () => { const d = refDate(); return d ? `${d.getFullYear()}-${mvPad2(d.getMonth() + 1)}-${mvPad2(d.getDate())}` : null; };
  const mvMD = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? `${p[1]}/${p[2]}` : iso; };
  const mvVol = (n) => n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;
  const mvPx = (n) => n == null ? "—" : (+n).toFixed(2);
  // Plain-English reason the panel has nothing to show — written for someone who
  // just pasted an API key and doesn't know what any of this means.
  function mvErrMsg(err, tk) {
    switch (err) {
      case "no API key":
        return `No Massive.com key added yet. Open the GexSync popup, paste your key under <b>“Massive.com data,”</b> and details appear here.`;
      case "bad API key":
        return `Massive.com didn’t accept this API key. Re-check it copied correctly and that your Massive plan is active, then save it again in the popup.`;
      case "rate limited":
        return `Massive.com is briefly throttling requests (too many at once). This clears on its own in a minute — nothing to fix.`;
      case "not found":
      case "no data":
        return `No company data for <b>${tk}</b>. Massive covers <b>stocks &amp; ETFs</b> (SPY, AAPL, QQQ…), not indexes like <b>SPX</b> or <b>VIX</b>. Nothing’s broken — there’s just nothing to show for this symbol.`;
      case "not entitled":
        return `Your Massive plan won’t return daily bars for <b>${tk}</b> here. On the free plan that means either an index (bars cover <b>stocks &amp; ETFs</b> only) or a replay date more than about <b>2 years</b> back. Nothing’s broken — the rest of the panel still works.`;
      case "network error":
        return `Couldn’t reach Massive.com — looks like a network/connection hiccup. It’ll retry.`;
      default:
        return `Massive.com couldn’t return data (${err}).`;
    }
  }

  // Reddit mention rank for the current ticker, or "" when there's nothing to say.
  // Only the RANK move is shown as a delta. Across a live sample every ticker had
  // `mentions` at roughly a quarter of `mentions_24h_ago` (SPY 76 vs 364, QQQ 28 vs
  // 154, NVDA 28 vs 112), so the two are not the same window and neither a percentage
  // nor a side-by-side would mean what a reader assumes. rank vs rank_24h_ago is
  // unambiguous, so that's the only comparison drawn. ponytail: `mentions24` is still
  // in the payload — one line to add once the window semantics are confirmed.
  const bzArrow = (d) => { // rank movement — a SMALLER rank is better, so invert the delta
    if (d.rank24 == null) return "";
    const n = d.rank24 - d.rank;
    return n > 0 ? ` · ↑${n}` : n < 0 ? ` · ↓${-n}` : " · =";
  };
  function bzLine(tk) {
    if (!buzzOn) return "";
    const d = bzCache.get(tk);
    if (!d) return ""; // still in flight
    if (d.error) return `<div style="margin-top:4px;color:${T.amber}">Reddit · ${mvErrShort(d.error)}</div>`;
    if (d.rank == null) return `<div style="margin-top:4px;color:${T.muted}">Reddit · not in today's top ${d.of}</div>`;
    // Only worth saying with something to compare against, and only for a ticker that
    // has a rank at all (an unranked one already says so on the line above).
    const uni = bzUni && bzUni.tk === tk && bzUni.rank && bzUni.of > 1
      ? `<div style="color:${T.muted}">#${bzUni.rank} most-discussed of your ${bzUni.of} open tickers</div>` : "";
    return `<div style="margin-top:4px;color:${T.muted}">Reddit #${d.rank} of ${d.of}${bzArrow(d)}</div>` +
      `<div style="font-family:${T.mono}">${d.mentions} mentions</div>` + uni;
  }

  // Same glass, border, blur and shadow as the pill, so the two read as one object.
  // align-self:stretch against the shrink-wrapped stack makes the panel exactly as
  // wide as the pill for free — and keeps matching it as the pill's segments change.
  // max-width only bites if a line is wider than the pill.
  // Terse form of the same failures, for the one-line slots (prev-day row, Reddit row)
  // where the full paragraph above would swamp the panel.
  function mvErrShort(err) {
    switch (err) {
      case "rate limited": return "throttled, retrying";
      case "not entitled": return "not on your plan — index, or past ~2 years";
      case "bad API key": return "key rejected";
      case "no API key": return "no key saved";
      case "network error":
      case "fetch failed": return "network hiccup, retrying";
      case "not found":
      case "no data": return "nothing for this symbol";
      default: return err;
    }
  }
  // Does anything the panel would show for this ticker currently hold an error? Drives
  // the pill's amber dot, so a failure is noticeable without opening the panel.
  function mvWarn(tk) {
    if (!tk) return false;
    if (buzzOn && bzCache.get(tk)?.error) return true;
    if (!mvKeyReady) return false;
    if (mvCache.get(tk)?.error) return true;
    const ref = mvRefStr();
    return !!(ref && mvPrevCache.get(tk + "|" + ref)?.error);
  }

  function mvBuild() {
    if (mvPanel) return mvPanel;
    mvPanel = document.createElement("div");
    mvPanel.id = "gexsync-massive";
    mvPanel.style.cssText = `position:relative;align-self:stretch;max-width:520px;padding:10px 13px;border-radius:14px;background:${T.glass};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);color:${T.ink};font:500 12px ${T.ui};line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.45);display:none;`;
    const stack = document.getElementById("gexsync-stack");
    if (stack) stack.insertBefore(mvPanel, stack.firstChild); // above the pill
    else (document.body || document.documentElement).appendChild(mvPanel);
    return mvPanel;
  }
  // What the popover shows for the current state, or null = nothing (hide).
  function mvContent() {
    if (profileLabel() === "?") // Settings/Alerts: the retired native title tip, restyled
      return `<div style="font:700 12px ${T.ui};color:${T.amber}">No chart profile</div>` +
        `<div style="margin-top:2px">This tab is on Settings/Alerts — click the home (⌂) icon in the panel to return to the chart.</div>`;
    if (!mvKeyReady && !buzzOn) return null; // on a chart with no enrichment source on
    const tk = baseTicker();
    if (!tk) return null;
    const buzz = bzLine(tk);
    // Buzz needs no key, so it can be the whole panel.
    if (!mvKeyReady) return buzz ? `<div style="font:700 12px ${T.ui};color:${T.mint};letter-spacing:.02em">${tk}</div>` + buzz : null;
    if (!mvCache.has(tk)) return null; // Massive prefetch still in flight
    const d = mvCache.get(tk);
    if (d.error)
      return `<div style="font:700 12px ${T.ui};color:${T.amber}">Massive · ${tk}</div>` +
        `<div style="margin-top:3px;line-height:1.45">${mvErrMsg(d.error, tk)}</div>` + buzz;
    const bits = [];
    if (d.mcap != null) bits.push(`${mvCap(d.mcap)} mkt cap`);
    if (d.sh != null) bits.push(mvSh(d.sh));
    if (!bits.length) { // ETFs/indices have no mkt cap or share count — show what we do have
      if (d.type) bits.push(d.type);
      if (d.ccy) bits.push(String(d.ccy).toUpperCase());
    }
    const meta = bits.join(" · ");
    // Previous trading day's OHLCV (from the update date; skips weekends/holidays).
    const ref = mvRefStr();
    const pd = ref ? mvPrevCache.get(tk + "|" + ref) : null;
    // A failed bar used to render as nothing at all, which made a 429 or an
    // out-of-window replay date look identical to "still loading".
    const prev = !pd ? ""
      : pd.error
        ? `<div style="margin-top:4px;color:${T.amber}">Prev day · ${mvErrShort(pd.error)}</div>`
        : `<div style="margin-top:4px;color:${T.muted}">Prev day ${mvMD(pd.date)}${pd.v != null ? ` · ${mvVol(pd.v)} vol` : ""}</div>` +
          `<div style="font-family:${T.mono}">O${mvPx(pd.o)} H${mvPx(pd.h)} L${mvPx(pd.l)} C${mvPx(pd.c)}</div>`;
    return `<div style="font:700 12px ${T.ui};color:${T.mint};letter-spacing:.02em">${tk}${d.exch ? ` · ${d.exch}` : ""}</div>` +
      `<div style="margin-top:2px">${d.name || "—"}</div>` +
      (meta ? `<div style="margin-top:2px;color:${T.muted};font-family:${T.mono}">${meta}</div>` : "") +
      prev + buzz;
  }
  function mvFetch(tk) { // fetch + cache silently; the hover popover reads the cache
    if (!alive() || mvBusy.has(tk) || mvFresh(mvCache.get(tk))) return;
    mvBusy.add(tk);
    chrome.runtime.sendMessage({ type: "gexsync-massive", ticker: tk }, (res) => {
      mvBusy.delete(tk);
      if (chrome.runtime.lastError) return; // worker asleep/orphaned; the next tick retries
      mvCache.set(tk, res && res.ok ? res.data : mvFail(res && res.error));
      mvSync();
    });
  }
  function bzFetch(tk) { // ApeWisdom rank; the worker holds the hourly list, so this is cheap
    const key = "bz|" + tk;
    if (!alive() || mvBusy.has(key) || mvFresh(bzCache.get(tk))) return;
    mvBusy.add(key);
    chrome.runtime.sendMessage({ type: "gexsync-buzz", ticker: tk }, (res) => {
      mvBusy.delete(key);
      if (chrome.runtime.lastError) return;
      bzCache.set(tk, res && res.ok ? res.data : mvFail(res && res.error));
      mvSync();
    });
  }
  // Not cached like the others: open tabs come and go, so this one goes stale on a
  // timer instead of per ticker. Only asked for while the popover is actually open —
  // it's the only place the line shows — so it costs nothing the rest of the time.
  const BZ_UNI_MS = 5000;
  function bzUniFetch(tk) {
    if (!alive() || mvBusy.has("uni")) return;
    if (bzUni && bzUni.tk === tk && Date.now() - bzUni.t < BZ_UNI_MS) return;
    mvBusy.add("uni");
    chrome.runtime.sendMessage({ type: "gexsync-buzz-uni", ticker: tk }, (res) => {
      mvBusy.delete("uni");
      if (chrome.runtime.lastError) return;
      bzUni = res && res.ok ? { tk, rank: res.data.rank, of: res.data.of, t: Date.now() } : null;
      mvSync();
    });
  }
  function mvPrevFetch(tk, ref) { // prev trading day OHLCV for (ticker, reference date)
    const key = tk + "|" + ref;
    if (!alive() || mvBusy.has(key) || mvFresh(mvPrevCache.get(key))) return;
    mvBusy.add(key);
    chrome.runtime.sendMessage({ type: "gexsync-massive-prevday", ticker: tk, ref }, (res) => {
      mvBusy.delete(key);
      if (chrome.runtime.lastError) return;
      mvPrevCache.set(key, res && res.ok ? res.data : mvFail(res && res.error));
      mvSync();
    });
  }
  // Publish the current ticker's prev-day OHLC + which lines are enabled to a hidden
  // node that pdlines.js (MAIN world) reads to draw the chart overlay.
  const pdNode = () => { let n = document.getElementById("__gxpd"); if (!n) { n = document.createElement("div"); n.id = "__gxpd"; n.style.display = "none"; document.documentElement.appendChild(n); } return n; };
  function mvWritePD() {
    const anyOn = pdShow.o || pdShow.h || pdShow.l || pdShow.c;
    if (!onSyncPage() || !anyOn) { const n = document.getElementById("__gxpd"); if (n && n.textContent) n.textContent = ""; return; }
    const tk = baseTicker(), ref = mvRefStr();
    const pd = tk && ref ? mvPrevCache.get(tk + "|" + ref) : null;
    const lvl = pd && !pd.error ? { o: pd.o, h: pd.h, l: pd.l, c: pd.c } : {};
    const next = JSON.stringify({ show: pdShow, lvl, pos: pdLabelPos });
    const n = pdNode(); if (n.textContent !== next) n.textContent = next;
  }
  function mvSync() {
    const html = (mvHover || mvLocked) && onSyncPage() ? mvContent() : null;
    // Repaint the pill only when the state actually flips — mvSync runs every 500ms.
    const chip = document.getElementById("gexsync-mode-chip");
    if (chip) {
      const flag = html ? (mvLocked ? "lock" : "1") : ""; // no content → no cue to show
      // The warn dot shows whether or not the panel is open — that's the point of it.
      const warn = onSyncPage() && mvWarn(baseTicker()) ? "1" : "";
      if (chip.dataset.mvOpen !== flag || chip.dataset.mvWarn !== warn) {
        chip.dataset.mvOpen = flag; chip.dataset.mvWarn = warn; renderChip();
      }
    }
    const p = html ? mvBuild() : mvPanel;
    if (!p) return;
    if (html) { if (mvLastHtml !== html) { p.innerHTML = html; mvLastHtml = html; } p.style.display = "block"; }
    else p.style.display = "none";
  }
  // Prefetch the current ticker + reference date (so a replay seek to another day
  // picks up its own bar) — runs regardless of hover. Both fetchers no-op unless the
  // cache is empty or a soft failure's cooldown lapsed, so calling them every tick
  // costs a Map lookup and doubles as the retry.
  setInterval(() => {
    if (onSyncPage()) {
      const tk = baseTicker();
      if (tk && mvKeyReady) { mvFetch(tk); const ref = mvRefStr(); if (ref) mvPrevFetch(tk, ref); }
      if (tk && buzzOn) { bzFetch(tk); if (mvHover) bzUniFetch(tk); }
    }
    mvSync();
    mvWritePD();
  }, 500);
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local" || !c[MASSIVE_KEY]) return;
    mvKeyReady = !!c[MASSIVE_KEY].newValue?.key;
    mvCache.clear(); mvPrevCache.clear(); // key changed either way: forget results (incl. "no API key")
    mvSync();
  });
  // The pill's info segment is the handle. Leaving is bound on the STACK, not the
  // segment, so travelling up across the 8px gap onto the panel never counts as
  // leaving — which is what a hover popover normally needs a hide-delay timer for.
  // Called from buildModeChip once the pill exists.
  function mvBindPill(stack, handle) {
    handle.addEventListener("mouseenter", () => { mvHover = true; mvSync(); });
    stack.addEventListener("mouseleave", () => { if (!mvLocked) { mvHover = false; mvSync(); } });
    handle.addEventListener("click", (e) => {
      e.stopPropagation(); // the segment is inside the pill; don't trip other handlers
      mvLocked = !mvLocked;
      mvHover = true; // unlocking with the cursor still on the pill keeps it visible
      mvSync();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !mvLocked) return;
      mvLocked = false; mvHover = false; mvSync();
    });
  }

  // Report this tab's full state to the popup on request.
  function getState() {
    const { gex, options } = getGroups();
    const sw = getSwitches();
    return {
      id: TAB.slice(0, 3).toUpperCase(), // same short id shown in the pill
      page: location.pathname.replace(/^\//, ""), // "state" | "classic"
      group: groupName(), // color group (for the copyable state snapshot)
      ticker: tickerValue(),
      gex: selectedKeyword(gex),
      options: selectedKeyword(options),
      greeks: OPTS.filter((k) => sw[k]?.checked),
      collapsed: panelCollapsed(),
    };
  }
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg === "getState") reply(getState());
    else if (msg === "getZoom") { const z = onSyncPage() && baseTicker() ? readCurZoom() : null; reply(z ? { key: savedKey(), ticker: baseTicker(), yMin: z.yMin, yMax: z.yMax } : null); }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) { const c = changes[CFG_KEY].newValue; const pScope = panelScope; if (c.panelScope) panelScope = c.panelScope; watermark = c.watermark !== false; const pSync = zoomSync; zoomSync = c.zoomSync === true; groupShot = c.groupShot === true; const sNav = settingsNav; settingsNav = c.settingsNav === true; if (settingsNav !== sNav) lastNav = null; showDte = c.dte === true; settingsSync = c.settingsSync === true; pdShow = readPd(c); pdLabelPos = c.pdLabel || "left"; buzzOn = c.buzz === true; watchlist = c.watchlist || []; matrixOn = c.matrix === true; writeMatrixNode(); chartMode = normMode(c.chartMode ?? (c.triggerArmed ? "trigger" : "")); toolMode = c.toolMode || (chartMode === "draw" ? "draw" : "line"); drawTool = c.drawTool || "free"; activeScope = c.drawScope || "page"; lineColor = c.lineColor || c.triggerColor || "#FFC24A"; drawColor = c.drawColor || "#4AA3FF"; renderChip(); writeLinesNode(); if (!zoomSync) writeHold(null); else if (!pSync || panelScope !== pScope) adoptLive(); zHudOn(); }
    if (changes[MODE_KEY]?.newValue) { mode = changes[MODE_KEY].newValue === "live" ? "profiles" : changes[MODE_KEY].newValue; renderChip(); }
    if (changes[SESSION_KEY]) { replayLocked = !!changes[SESSION_KEY].newValue && changes[SESSION_KEY].newValue.phase !== "idle"; renderChip(); }
    if (!onSyncPage()) return; // off /classic|/state (SPA nav): don't touch the page
    if (profileSync() && changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed); // panel always
    if (settingsNav && changes[navKey()]?.newValue) applyNav(changes[navKey()].newValue.view); // Settings-panel nav mirror (opt-in)
    if (settingsSync && changes[settingsKey()]?.newValue) applySettings(changes[settingsKey()].newValue); // bottom Settings values mirror (opt-in, all-open gated, click-driven master)
    if (profileSync() && changes[OPTS_KEY]?.newValue) applyOpts(changes[OPTS_KEY].newValue.state);
    if (tickerSync() && changes[tickerChan()]?.newValue) applyTicker(changes[tickerChan()].newValue.ticker);
    if (tickerSync() && changes[ES_CHAN()]?.newValue) applyEs(changes[ES_CHAN()].newValue.es);
    if (zoomSync && !zoomBusy() && changes[liveKey()]?.newValue) { writeHold(changes[liveKey()].newValue); ZHUD.follow(); } // live sync from a peer (incl. during replay) — but never override a tab you're actively zooming
    if (changes[RECALL_KEY]) recallZoom(); // Save/Recall broadcast from the popup
    if (groupShot && changes[SHOOT_REQ]?.newValue) respondShot(changes[SHOOT_REQ].newValue.seq); // every pane captures itself
  });

  // Show our UI only on /classic|/state. GEXbot is a SPA, so navigating to
  // /research, /api, /pricing, … doesn't reload (this script stays alive) — hide
  // the chip + overlays and drop this tab's group presence so it stops bleeding
  // onto other pages and stops inflating the group count. Restored on return.
  function applyPageActive() {
    const on = onSyncPage();
    const chip = document.getElementById("gexsync-mode-chip");
    if (chip) chip.style.display = on ? "flex" : "none";
    if (!on) {
      if (toastEl) toastEl.style.display = "none";
      if (alive()) chrome.storage.local.remove("gexsync-tp:" + TAB); // un-count from the group
    }
    zHudOn(); // experiment: hide/show the zoom HUD with the page
  }

  // SPA renders late and swaps elements; keep polling (cheap) so group observers
  // re-attach on mount/swap — like watchSwitches does for the greek switches.
  let panelDone = false, lastPath = location.pathname;
  applyPageActive();
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; applyPageActive(); }
    if (!onSyncPage()) return; // dormant off /classic|/state
    watchGroups();
    if (!panelDone) panelDone = watchPanel();
    watchNav();
  }, 500);
})();
