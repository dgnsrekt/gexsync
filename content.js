// GexSync: mirror gex/options profile (90d/latest/next) + settings-panel
// collapse across GEXbot tabs. Tickers untouched. Bus = chrome.storage.local.
(function () {
  const KEY = "gexsync" + location.pathname; // profile channel, always per page
  const CFG_KEY = "gexsync-cfg";
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
  const panelKey = () => scopedKey("gexsync-panel", panelScope);
  chrome.storage.local.get(CFG_KEY, (r) => {
    if (r[CFG_KEY]?.panelScope) panelScope = r[CFG_KEY].panelScope;
    watermark = r[CFG_KEY]?.watermark !== false; // default on
    zoomSync = r[CFG_KEY]?.zoomSync === true; // default off (opt-in)
    groupShot = r[CFG_KEY]?.groupShot === true; // default off (opt-in)
    zHudOn();
  });

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
      if (s === "idle") { stopSpin(); m.style.color = C.muted; md.style.color = ""; md.textContent = `mode: ${LBL[mode] || "Profiles"}${replayLocked ? " 🔒" : ""}`; }
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
    chip.style.cssText = `position:fixed;left:16px;bottom:72px;z-index:2147482000;display:flex;align-items:center;border-radius:9999px;background:${T.glass};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);color:${T.ink};font:600 13px ${T.ui};box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;`;
    const MODES = ["profiles", "ticker", "replay"];
    const LABEL = { profiles: "Profiles", ticker: "Ticker", replay: "Replay" };

    // brand mark glyph (the sync loop) at the far left, muted so it reads as
    // identity, not status
    const markSeg = document.createElement("span");
    markSeg.id = "gexsync-chip-mark";
    markSeg.style.cssText = `display:flex;align-items:center;padding:6px 3px 6px 13px;color:${T.muted};transition:color .16s;`;
    markSeg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform-box:fill-box;transform-origin:center"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4.5v5h5"/></svg>`;

    const modeSeg = document.createElement("span");
    modeSeg.id = "gexsync-chip-mode";
    // min-width holds "mode: Profiles" so the zoom takeover labels don't jitter the pill
    modeSeg.style.cssText = "display:flex;align-items:center;gap:7px;padding:6px 13px 6px 7px;cursor:pointer;box-sizing:border-box;min-width:118px;transition:color .16s;";
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

    // info segment: this tab's id · page · ticker · profile — visible with the
    // side panel closed, replaces the top-left debug badge that blocked the nav
    // links. replay.js appends MASTER/client via chip.dataset.replayRole.
    const infoSeg = document.createElement("span");
    infoSeg.style.cssText = `display:flex;align-items:center;padding:6px 14px;border-left:1px solid rgba(255,255,255,.12);font:500 12px ${T.mono};letter-spacing:.3px;white-space:nowrap;color:${T.ink};`;

    chip.append(markSeg, modeSeg, grpSeg, infoSeg);
    const shortId = TAB.slice(0, 3).toUpperCase();
    const sep = `<span style="color:${T.muted}">·</span>`;
    const paintInfo = () => {
      // role: MASTER in mint, client in azure (fed by replay.js)
      const r = mode === "replay" && chip.dataset.replayRole;
      const role = r ? ` ${sep} <span style="color:${r === "MASTER" ? T.mint : T.azure}">${r}</span>` : "";
      const page = location.pathname.replace(/^\//, "").toUpperCase();
      const prof = profileLabel().replace("90d", "90 days").toUpperCase();
      // order: ticker · CLASSIC/STATE · profile [· role] · tab-id (titled, muted)
      infoSeg.innerHTML = `${tickerValue() || "?"} ${sep} ${page} ${sep} ${prof}${role} ${sep} <span title="tab id" style="cursor:help;color:${T.muted}">#${shortId}</span>`;
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
      modeSeg.textContent = `mode: ${LABEL[m]}${replayLocked ? " 🔒" : ""}`;
      modeSeg.style.cursor = replayLocked ? "default" : "pointer";
      modeSeg.title = replayLocked ? "Locked during replay session — Exit via the replay bar" : "GexSync mode — click to cycle (Profiles / Ticker / Replay)";
      const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
      // tint the pill by group only in Ticker mode (groups are inert otherwise)
      chip.style.color = m === "ticker" ? g.color : T.ink;
      grpSeg.style.display = m === "ticker" ? "flex" : "none";
      // Replay mode shows the transport bar (whose anchor is the loop mark), so
      // drop the pill's own loop glyph to avoid two stacked circles in the corner.
      const showMark = m !== "replay";
      markSeg.style.display = showMark ? "flex" : "none";
      modeSeg.style.paddingLeft = showMark ? "7px" : "13px";
      paintGroup();
      paintInfo();
    };
    (document.body || document.documentElement).appendChild(chip);
    setInterval(paintInfo, 700); // ticker/profile change on their own (esp. post-reload)

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
    const want = watermark ? `${wmBase} ${label.replace("90d", "90 days").toUpperCase()}` : wmBase;
    if (wm.textContent.trim() !== want) wm.textContent = want;
    // "?" = no profile toggles on this page (settings/alerts). Native hover tip
    // tells the user how to get back; cleared on any real profile.
    const tip = watermark && label === "?"
      ? "No chart profile here — this tab is on Settings/Alerts. Click the home (⌂) icon in the panel to return to the chart."
      : "";
    if (wm.title !== tip) wm.title = tip;
    // The watermark is pointer-events:none (background overlay) so a native title
    // never fires. Make it hoverable only while the tip is up — the ? state has no
    // chart underneath to block.
    const pe = tip ? "auto" : "";
    if (wm.style.pointerEvents !== pe) wm.style.pointerEvents = pe;
    // tint the watermark the group color in Ticker mode; GEXbot default otherwise
    wm.style.color = watermark && mode === "ticker" ? (GROUPS.find((g) => g.name === groupName()) || GROUPS[0]).color : "";
  }
  setInterval(paintWatermark, 700);

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
    if (changes[CFG_KEY]?.newValue) { const c = changes[CFG_KEY].newValue; const pScope = panelScope; if (c.panelScope) panelScope = c.panelScope; watermark = c.watermark !== false; const pSync = zoomSync; zoomSync = c.zoomSync === true; groupShot = c.groupShot === true; if (!zoomSync) writeHold(null); else if (!pSync || panelScope !== pScope) adoptLive(); zHudOn(); }
    if (changes[MODE_KEY]?.newValue) { mode = changes[MODE_KEY].newValue === "live" ? "profiles" : changes[MODE_KEY].newValue; renderChip(); }
    if (changes[SESSION_KEY]) { replayLocked = !!changes[SESSION_KEY].newValue && changes[SESSION_KEY].newValue.phase !== "idle"; renderChip(); }
    if (!onSyncPage()) return; // off /classic|/state (SPA nav): don't touch the page
    if (profileSync() && changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed); // panel always
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
  }, 500);
})();
