// GexSync — GEX levels on TradingView: the ISOLATED-world half. It owns storage (the GEXbot
// key + TV cfg) and the cross-origin fetch (via the background worker — CORS/CSP forbid a
// page-context GEXbot fetch), and bridges to the MAIN-world overlay (tv-overlay.js) over a
// hidden #__gxtv node + window CustomEvents, the same idiom as content.js <-> lines.js.
//
// The node always carries a STATUS payload while the overlay is enabled (ticker + whether it's
// a GEXbot ticker + levels-when-available) so the MAIN side can show its pill even on a symbol
// GEXbot doesn't cover. It's blanked only when disabled / no key (pill hidden).
(function () {
  if (window.__gexsyncTVIso) return;
  window.__gexsyncTVIso = true;

  const CFG_KEY = "gexsync-cfg", GX_KEY = "gexsync-gexbot", NODE_ID = "__gxtv", HNODE_ID = "__gxtvh";
  const DEFCOL = { czg: "#FFC24A", cpos: "#16E0A3", cneg: "#FF5C5C", spos: "#22D3EE", sneg: "#FF8C42" };
  // Ticker-push (opt-in): the pill can push THIS chart's ticker to a gexbot Ticker-mode group. Mirror
  // content.js's GROUPS + the shared ticker channel; presence rides gexsync-tp:* (per-tab, 5s expiry).
  const TICKER_KEY = "gexsync-ticker"; // per-group channel: gexsync-ticker:<group> = {ticker, t}
  const TVLOCK_KEY = "gexsync-tvlock"; // auto-mode lock: gexsync-tvlock:<group> = {owner, exp} — one TV chart per group
  const TVZOOM_KEY = "gexsync-tvzoom"; // auto+locked y-axis push: gexsync-tvzoom:<group> = {yMin, yMax, ticker, owner, exp}
  const SELF_KEY = "gexsync-tv-lock-self"; // session (per-tab): {group, tab} — persists the auto lock across a refresh, clears on tab close
  const readSelf = () => { try { return JSON.parse(sessionStorage.getItem(SELF_KEY) || "null"); } catch (e) { return null; } };
  const TV_TAB = ((readSelf() || {}).tab) || Math.random().toString(36).slice(2); // stable across a refresh so a reload recognizes its own lock; fresh on a new tab
  const TV_GROUPS = [
    { name: "green", color: "#16E0A3" }, { name: "red", color: "#FF5C5C" }, { name: "blue", color: "#4AA3FF" }, { name: "yellow", color: "#FFC24A" },
    { name: "purple", color: "#B57AFF" }, { name: "cyan", color: "#22D3EE" }, { name: "orange", color: "#FF8C42" }, { name: "pink", color: "#FF5CC8" },
  ];
  const PKG_NAME = { gex_zero: "latest", gex_one: "next", gex_full: "90d" }; // category → pill label
  // Which DTE the pill shows per package: latest = nearest expiry, next = second-nearest.
  // 90d aggregates a range, so no single DTE. Response carries both min_dte + sec_min_dte.
  const PKG_DTE = { gex_zero: (d) => d.min, gex_one: (d) => d.sec, gex_full: () => null };

  const mkNode = (id) => () => {
    let n = document.getElementById(id);
    if (!n) { n = document.createElement("div"); n.id = id; n.style.display = "none"; document.documentElement.appendChild(n); }
    return n;
  };
  const node = mkNode(NODE_ID);   // main status/levels payload (folded into MAIN's 100ms sig)
  const hnode = mkNode(HNODE_ID); // histogram strikes (kept OUT of the 100ms sig; MAIN reads on hgen change)

  let keyReady = false, tvEnabled = false, tvSource = "poll", tvPackage = "gex_zero", tvLevels = null;
  const TIER_RANK = { classic: 1, state: 2, orderflow: 3, quant: 4 }; // GEXbot subscription tiers (cumulative)
  let gexTier = "classic"; // which tier the user's GEXbot key has — gates what we fetch (no 401s)
  const caps = () => { const r = TIER_RANK[gexTier] || 1; return { state: r >= 2, orderflow: r >= 3, quant: r >= 4 }; }; // classic = floor
  let tvLinesOn = true; // master "show lines" — hides all lines but keeps per-line config (quick pill toggle)
  let tvHistogram = false, tvHistSrc = "classic", hgen = 0; // GEX profile: on/off, source, strikes-version stamp
  let tvLineOp = 1, tvHistOp = 1; // opacity 0..1 for lines+labels / the whole histogram (blend with the user's chart)
  let tvRefresh = 30; // refresh cadence in seconds: 15 | 30 | 60
  // Timeframe visibility: which chart timeframes the overlay (lines + histogram) shows on. Presets
  // resolve to a bucket set; the MAIN overlay checks the live chart.resolution() against it (null = all).
  let tvVisibility = "all"; // "all" | "intraday" | "daily" | "custom"
  let tvVisCustom = null;    // custom bucket array (only used when tvVisibility === "custom")
  const VIS_BUCKETS = ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "ranges"];
  const VIS_PRESETS = { all: null, intraday: ["ticks", "seconds", "minutes", "hours", "ranges"], daily: ["days", "weeks", "months"] };
  const resolveVis = () => tvVisibility === "custom" ? (Array.isArray(tvVisCustom) ? tvVisCustom : VIS_BUCKETS) : (tvVisibility in VIS_PRESETS ? VIS_PRESETS[tvVisibility] : null);
  let tvPauseClosed = true; // pause the poll outside regular market hours (TradingView marketStatus); default on. MAIN checks the status.
  let tvStaleMode = "inline"; // how a drifted alert shows: "pulse" | "inline" | "line" (all pulse the icon)
  let tvDetailsPerPane = false; // GEX details panel: per pane when on, else active-pane only (default)
  let tvAutoUpdate = 0; // auto-heal stale alerts every N minutes (0 = off); MAIN runs it on the wall clock
  let tvPushMode = "off", tvPushGroup = "green", lockedGroup = null, activeGroups = [], pushTimer = null, lockRestored = false; // ticker-push: mode off|manual|auto, target group, group THIS chart locked (auto), live [{name,color,count,lock}], poll handle
  let tvZoomSync = false, lastZoomVR = null, lastZoomWrite = 0; // y-axis push (auto+locked only): opt-in flag, last {yMin,yMax} the overlay emitted, last storage-write stamp (throttle)
  let universe = null; // global GEXbot ticker Set (shared by all panes)
  let paneTickers = [], activeTicker = ""; // distinct pane symbols reported by MAIN + the focused pane's symbol
  const tickerState = new Map(); // ticker → { valid, levels, err } — one entry per distinct pane symbol
  let hprev = ""; // last #__gxtvh strikes JSON, so hgen bumps only when a ticker's strikes actually change
  const activeValid = () => { const s = tickerState.get(activeTicker); return s ? s.valid : null; }; // validity of the focused pane's ticker (for active-pane push/zoom)
  let LANG = "en"; // popup UI language (gexsync-cfg.lang); carried to tv-overlay.js via #__gxtv

  // MV3 orphan guard: when the extension is reloaded/updated, this content script keeps living in
  // any not-yet-reloaded tab, but its chrome.* context is torn down — any use throws "Extension
  // context invalidated". The MAIN overlay (pure page JS) keeps pinging us (30s countdown, symbol
  // changes), so route every chrome.* call through these guards and go silent once orphaned.
  let dead = false;
  const alive = () => { if (dead) return false; try { if (chrome.runtime && chrome.runtime.id) return true; } catch {} dead = true; return false; };
  function send(msg, cb) {
    if (!alive()) return;
    try { chrome.runtime.sendMessage(msg, (res) => { if (!alive()) return; try { if (chrome.runtime.lastError) return; } catch { return; } cb(res); }); }
    catch { dead = true; }
  }
  function sGet(keys, cb) { if (!alive()) return; try { chrome.storage.local.get(keys, (r) => { if (alive()) cb(r); }); } catch { dead = true; } }
  function sSet(obj) { if (!alive()) return; try { chrome.storage.local.set(obj); } catch { dead = true; } }

  function readCfg(cb) {
    sGet([CFG_KEY, GX_KEY], (r) => {
      const g = r[CFG_KEY] || {};
      keyReady = !!(r[GX_KEY] && r[GX_KEY].key);
      tvEnabled = g.tvEnabled !== false; // default on once a key exists
      tvSource = g.tvSource === "ws" ? "ws" : "poll";
      tvPackage = PKG_NAME[g.tvPackage] ? g.tvPackage : "gex_zero"; // latest | next | 90d category
      gexTier = ["classic", "state", "orderflow", "quant"].includes(g.gexTier) ? g.gexTier : "classic"; // default lowest
      tvLinesOn = g.tvLinesOn !== false; // lines visible by default
      tvHistogram = g.tvHistogram === true; // GEX profile off by default
      tvHistSrc = g.tvHistSrc === "state" ? "state" : "classic";
      const op = (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 1); // default fully opaque
      tvLineOp = op(g.tvLineOpacity); tvHistOp = op(g.tvHistOpacity);
      tvRefresh = [1, 5, 15, 30, 60].includes(g.tvRefresh) ? g.tvRefresh : 30;
      tvVisibility = ["all", "intraday", "daily", "custom"].includes(g.tvVisibility) ? g.tvVisibility : "all";
      tvVisCustom = Array.isArray(g.tvVisCustom) ? g.tvVisCustom.filter((b) => VIS_BUCKETS.includes(b)) : null;
      tvPauseClosed = g.tvPauseClosed !== false; // default on
      tvStaleMode = ["pulse", "inline", "line"].includes(g.tvStaleMode) ? g.tvStaleMode : "inline";
      tvDetailsPerPane = !!g.tvDetailsPerPane;
      tvAutoUpdate = [0, 1, 5, 15, 30].includes(g.tvAutoUpdate) ? g.tvAutoUpdate : 0;
      tvPushMode = ["off", "manual", "auto"].includes(g.tvPushMode) ? g.tvPushMode : (g.tvPushTicker === true ? "manual" : "off"); // off by default; migrate the old tvPushTicker boolean → manual
      if (TV_GROUPS.some((x) => x.name === g.tvPushGroup)) tvPushGroup = g.tvPushGroup;
      if (tvPushMode !== "auto" && lockedGroup) releaseLock(); // leaving auto (or off/manual) drops any lock we hold
      pushLoop(tvPushMode !== "off"); // start/stop the presence+lock poll to match the mode
      if (!lockRestored) { lockRestored = true; restoreLock(); } // once, on the first config load: reclaim a lock held before a refresh
      tvZoomSync = g.tvZoomSync === true; // opt-in; only effective while auto + locked
      if (!tvZoomSync) { lastZoomVR = null; if (lockedGroup) chrome.storage.local.remove(TVZOOM_KEY + ":" + lockedGroup); } // zoom off (still locked) → drop OUR y-axis record so gexbot unlocks (leaving auto is handled by releaseLock above)
      LANG = self.GXI18N ? self.GXI18N.normLang(g.lang) : "en";
      const s = g.tvLevels || {};
      const lvl = (k, old) => ({ on: (s[k]?.on ?? (old && s[old]?.on)) !== false, color: s[k]?.color || (old && s[old]?.color) || DEFCOL[k] });
      tvLevels = { // 5 lines: classic zg/+vol/-vol, state +vol/-vol. Migrate old 3-key {zg,pos,neg}.
        czg: lvl("czg", "zg"), cpos: lvl("cpos", "pos"), cneg: lvl("cneg", "neg"),
        spos: lvl("spos"), sneg: lvl("sneg"),
      };
      cb && cb();
    });
  }

  // Publish the current status for the MAIN overlay. Blank the node when the overlay is off so
  // the pill + lines both disappear; otherwise always carry {tickers, active, cfg}.
  // Strip the big strikes array (→ hnode) but keep the small detail fields (net gex, OI, max-change, ts) for the pill panel.
  const slim = (o) => o ? { zeroGamma: o.zeroGamma, majorPos: o.majorPos, majorNeg: o.majorNeg, spot: o.spot, minDte: o.minDte, secDte: o.secDte, posOi: o.posOi, negOi: o.negOi, netVol: o.netVol, netOi: o.netOi, ts: o.ts, maxChg: o.maxChg } : null;
  function publish() {
    const n = node(), hn = hnode();
    if (!keyReady || !tvEnabled) {
      if (n.textContent) n.textContent = "";
      if (hn.textContent) { hn.textContent = ""; hgen++; hprev = ""; }
      return;
    }
    const src = effHistSrc();
    // Per-ticker levels (strikes stripped) + a keyed strikes blob for #__gxtvh. One #__gxtvh JSON over all
    // panes; a single hgen bumps only when that blob changes, so MAIN re-reads strikes rarely (not per 100ms).
    const tickers = {}, hobj = {};
    for (const t of paneTickers) {
      const s = tickerState.get(t); if (!s) continue;
      const hasData = !!(s.levels && (s.levels.classic || s.levels.state));
      tickers[t] = {
        valid: s.valid, // true | false | null(universe not loaded yet)
        levels: (s.valid !== false && hasData) ? { classic: slim(s.levels.classic), state: slim(s.levels.state), dte: s.levels.dte } : null,
        err: (s.valid !== false && !hasData) ? s.err : null,
        dte: (s.valid !== false && hasData && s.levels.dte) ? PKG_DTE[tvPackage](s.levels.dte) : null,
      };
      if (tvHistogram && s.valid !== false && hasData && s.levels[src] && s.levels[src].strikes) hobj[t] = { src, strikes: s.levels[src].strikes };
    }
    const hstr = Object.keys(hobj).length ? JSON.stringify(hobj) : "";
    if (hstr !== hprev) { hprev = hstr; hgen++; hn.textContent = hstr; }
    const payload = JSON.stringify({
      tickers,          // { SYM: { valid, levels:{classic,state,dte}|null, err, dte } } — one per distinct pane symbol
      active: activeTicker || null, // the focused pane's symbol (active-pane push/zoom chips read this)
      pkg: PKG_NAME[tvPackage], pkgCat: tvPackage.replace("gex_", ""), // global package label + backend token
      hgen, hist: { on: tvHistogram, src }, // strikes-version + on/off + effective source
      refreshMs: tvRefresh * 1000, autoUpdateMs: tvAutoUpdate * 60000, lang: LANG,
      push: tvPushMode !== "off" ? { mode: tvPushMode, group: tvPushGroup, groups: activeGroups, locked: lockedGroup, zoom: tvPushMode === "auto" && !!lockedGroup && tvZoomSync && activeValid() === true } : null,
      cfg: { enabled: true, linesOn: tvLinesOn, levels: tvLevels, lineOpacity: tvLineOp, histOpacity: tvHistOp, tier: gexTier, caps: caps(), vis: resolveVis(), pauseClosed: tvPauseClosed, staleMode: tvStaleMode, detailsPerPane: tvDetailsPerPane },
    });
    if (n.textContent !== payload) n.textContent = payload;
  }

  function requestTickers() {
    send({ type: "gexsync-gexbot-tickers" }, (res) => {
      if (res && res.ok && Array.isArray(res.tickers)) {
        universe = new Set(res.tickers);
        for (const t of paneTickers) { const s = tickerState.get(t); if (s) { s.valid = universe.has(t); if (s.valid) fetchMajors(t); } } // universe loaded → re-evaluate every pane symbol
        publish(); autoPush();
      }
    });
  }

  const effHistSrc = () => (caps().state ? tvHistSrc : "classic"); // Classic-tier key can't use the State profile
  const needSrc = () => {
    const c = caps();
    return {
      classic: (tvLinesOn && (tvLevels.czg.on || tvLevels.cpos.on || tvLevels.cneg.on)) || (tvHistogram && effHistSrc() === "classic"),
      state: c.state && ((tvLinesOn && (tvLevels.spos.on || tvLevels.sneg.on)) || (tvHistogram && effHistSrc() === "state")),
    };
  };
  function fetchMajors(t) { // fetch ONE ticker's GEX into tickerState (background.js cache dedupes across panes on the same symbol)
    const s = tickerState.get(t);
    if (!t || !keyReady || !tvEnabled || !s || s.valid === false) return;
    const need = needSrc();
    if (!need.classic && !need.state) { s.levels = null; s.err = null; return publish(); } // every line toggled off
    send({ type: "gexsync-gexbot-majors", ticker: t, need, cat: tvPackage }, (res) => {
      const s2 = tickerState.get(t); if (!s2) return; // pane left this symbol before the reply landed → drop it
      if (res && res.ok && res.data) { s2.levels = res.data; s2.err = res.err || null; }
      else { s2.levels = null; s2.err = (res && res.error) || "no data"; }
      publish();
    });
  }
  const fetchAll = () => { for (const t of paneTickers) fetchMajors(t); };

  // MAIN reports the FULL set of distinct pane symbols + which is focused. Reconcile: drop symbols no pane
  // shows, add + fetch new ones. background.js is already ticker-keyed, so N panes = N (deduped) fetches.
  function onSymbols(tickers, active) {
    const next = [...new Set((tickers || []).filter(Boolean).map((t) => String(t).toUpperCase()))];
    const changed = JSON.stringify(next) !== JSON.stringify(paneTickers);
    paneTickers = next;
    activeTicker = (active ? String(active).toUpperCase() : (next[0] || ""));
    for (const t of [...tickerState.keys()]) if (!paneTickers.includes(t)) tickerState.delete(t); // pane symbol gone → forget it
    for (const t of paneTickers) if (!tickerState.has(t)) { // new pane symbol → seed + fetch
      const valid = universe ? universe.has(t) : null;
      tickerState.set(t, { valid, levels: null, err: null });
      if (valid !== false) fetchMajors(t);
    }
    if (changed || active) { publish(); autoPush(); }
  }

  // MAIN overlay reports the pane symbol set (new event) — plus a back-compat singular shim.
  window.addEventListener("gexsync-tv-symbols", (e) => { const d = (e && e.detail) || {}; onSymbols(d.tickers, d.active); });
  window.addEventListener("gexsync-tv-symbol", (e) => { const t = e.detail && e.detail.ticker; if (t) onSymbols([t], t); });
  // MAIN owns the refresh cadence + the countdown/force-refresh click; it pings us to fetch every pane symbol.
  window.addEventListener("gexsync-tv-fetch", () => fetchAll());
  // Click the package label on the pill → cycle latest → next → 90d. Persist to cfg; the
  // onChanged listener below repaints + refetches (so a switch pulls the new expiry fresh).
  const PKG_ORDER = ["gex_zero", "gex_one", "gex_full"];
  window.addEventListener("gexsync-tv-cycle-pkg", () => {
    const next = PKG_ORDER[(PKG_ORDER.indexOf(tvPackage) + 1) % PKG_ORDER.length];
    sGet(CFG_KEY, (r) => sSet({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), tvPackage: next } }));
  });
  // Pill quick-toggles (persist to cfg → onChanged repaints + refetches). Keep the underlying config.
  const cfgFlip = (patch) => sGet(CFG_KEY, (r) => sSet({ [CFG_KEY]: { ...(r[CFG_KEY] || {}), ...patch } }));
  window.addEventListener("gexsync-tv-toggle-lines", () => cfgFlip({ tvLinesOn: !tvLinesOn }));   // show/hide all lines
  window.addEventListener("gexsync-tv-toggle-hist", () => cfgFlip({ tvHistogram: !tvHistogram })); // show/hide histogram
  window.addEventListener("gexsync-tv-cycle-hsrc", () => { if (caps().state) cfgFlip({ tvHistSrc: tvHistSrc === "state" ? "classic" : "state" }); }); // classic↔state (State needs tier)

  // Ticker-push presence + lock discovery. Read every gexsync-tp:<tab> beacon (a gexbot Ticker-mode tab
  // heartbeats its group, 5s expiry) → live count per group; and every gexsync-tvlock:<group> (a TV chart
  // owning a group's auto-push, ~6s expiry) → annotate each group lock:"me"|"other"|null. TV_GROUPS order.
  // Also heartbeats OUR lock while we hold one. Republish only when the picture actually changes.
  function readPresence() {
    if (lockedGroup) sSet({ [TVLOCK_KEY + ":" + lockedGroup]: { owner: TV_TAB, exp: Date.now() + 6000 } }); // heartbeat (< 6s expiry) so the lock survives; frees ~6s after this tab dies
    if (lockedGroup && tvZoomSync && activeValid() === true && lastZoomVR) sSet({ [TVZOOM_KEY + ":" + lockedGroup]: { yMin: lastZoomVR.yMin, yMax: lastZoomVR.yMax, ticker: activeTicker, owner: TV_TAB, exp: Date.now() + 6000 } }); // heartbeat the y-axis record → stays fresh while idle + flushes the last range
    sGet(null, (all) => {
      const now = Date.now(), counts = {}, owner = {};
      for (const k in all) {
        if (k.indexOf("gexsync-tp:") === 0) { const e = all[k]; if (e && e.exp > now && e.group) counts[e.group] = (counts[e.group] || 0) + 1; }
        else if (k.indexOf(TVLOCK_KEY + ":") === 0) { const e = all[k]; if (e && e.exp > now && e.owner) owner[k.slice(TVLOCK_KEY.length + 1)] = e.owner; }
      }
      const lockOf = (n) => (owner[n] ? (owner[n] === TV_TAB ? "me" : "other") : null);
      // present groups + our own locked group (kept visible even if its gexbot tabs all closed → count 0)
      const next = TV_GROUPS.filter((g) => counts[g.name] || lockedGroup === g.name).map((g) => ({ name: g.name, color: g.color, count: counts[g.name] || 0, lock: lockOf(g.name) }));
      if (!lockedGroup && next.length && !next.some((g) => g.name === tvPushGroup)) { // unlocked + selection went dark → follow to a candidate (runtime only, not persisted)
        const cand = next.find((g) => tvPushMode !== "auto" || g.lock !== "other");
        if (cand) tvPushGroup = cand.name;
      }
      if (JSON.stringify(next) !== JSON.stringify(activeGroups)) { activeGroups = next; publish(); }
    });
  }
  function pushLoop(on) {
    if (on && !pushTimer) { readPresence(); pushTimer = setInterval(() => { if (alive()) readPresence(); }, 1500); } // 1.5s poll = the gexbot beacon cadence + our lock heartbeat
    else if (!on && pushTimer) { clearInterval(pushTimer); pushTimer = null; activeGroups = []; }
  }
  // Auto-push: ONLY the chart holding the lock pushes, ONLY for a GEXbot ticker. Fires on symbol change +
  // on lock. The TV chart is the source and gexbot the sink → no feedback loop, no echo-suppression needed.
  function autoPush() {
    if (tvPushMode !== "auto" || !lockedGroup || activeValid() !== true || !activeTicker) return;
    sSet({ [TICKER_KEY + ":" + lockedGroup]: { ticker: activeTicker, t: Date.now() } });
  }
  function releaseLock() { if (!lockedGroup) return; const g = lockedGroup; lockedGroup = null; lastZoomVR = null; try { sessionStorage.removeItem(SELF_KEY); } catch (e) {} try { chrome.storage.local.remove([TVLOCK_KEY + ":" + g, TVZOOM_KEY + ":" + g]); } catch {} } // we own them (heartbeat < expiry) → drop the lock + y-axis records so gexbot unlocks; forget the session lock too
  // Session lock persistence: on load, reclaim the group we had locked before a refresh (SELF_KEY survives the
  // reload; TV_TAB is restored from it so we recognize our own entry). Never steal one another chart took over
  // while we were gone — if it's held by a different owner and unexpired, let go.
  function restoreLock() {
    const self = readSelf();
    if (!self || !self.group || tvPushMode !== "auto" || lockedGroup) return;
    sGet(TVLOCK_KEY + ":" + self.group, (r) => {
      if (tvPushMode !== "auto" || lockedGroup) return; // mode/lock changed under us
      const e = r[TVLOCK_KEY + ":" + self.group];
      if (e && e.exp > Date.now() && e.owner && e.owner !== TV_TAB) { try { sessionStorage.removeItem(SELF_KEY); } catch (x) {} return; } // another chart owns it now
      lockedGroup = self.group;
      sSet({ [TVLOCK_KEY + ":" + lockedGroup]: { owner: TV_TAB, exp: Date.now() + 6000 } }); // retake it immediately
      publish(); autoPush();
    });
  }
  // Chip clicked → cycle the target among live groups (in auto, skips groups another chart locked). Inert
  // while we hold a lock — unlock first to retarget.
  window.addEventListener("gexsync-tv-push-cycle", () => {
    if (tvPushMode === "off" || lockedGroup) return;
    const names = activeGroups.filter((g) => tvPushMode !== "auto" || g.lock !== "other").map((g) => g.name);
    if (!names.length) return;
    tvPushGroup = names[(names.indexOf(tvPushGroup) + 1) % names.length];
    publish(); cfgFlip({ tvPushGroup });
  });
  // Manual ➜ clicked → one-shot push of this chart's ticker to the selected group (manual mode only).
  window.addEventListener("gexsync-tv-push-send", () => {
    if (tvPushMode !== "manual" || !activeTicker || activeValid() !== true || !activeGroups.some((g) => g.name === tvPushGroup)) return; // valid===true → confirmed GEXbot ticker
    sSet({ [TICKER_KEY + ":" + tvPushGroup]: { ticker: activeTicker, t: Date.now() } });
  });
  // Auto lock toggle → claim the selected group (exclusive: only if present & not held by another chart),
  // or release the one we hold. On lock, sync the current ticker immediately.
  window.addEventListener("gexsync-tv-push-lock", () => {
    if (tvPushMode !== "auto") return;
    if (lockedGroup) { releaseLock(); publish(); return; }
    const g = activeGroups.find((x) => x.name === tvPushGroup);
    if (!g || g.lock === "other") return; // gone or already taken
    lockedGroup = tvPushGroup;
    try { sessionStorage.setItem(SELF_KEY, JSON.stringify({ group: lockedGroup, tab: TV_TAB })); } catch (e) {} // remember across a refresh
    sSet({ [TVLOCK_KEY + ":" + lockedGroup]: { owner: TV_TAB, exp: Date.now() + 6000 } });
    publish(); autoPush();
  });
  // y-axis range from the overlay (auto + locked + zoom-sync on, GEXbot ticker) → throttle + write the
  // group's zoom record. readPresence heartbeats it while idle; gexbot validates + follows + locks input.
  window.addEventListener("gexsync-tv-zoom", (e) => {
    const d = (e && e.detail) || {};
    if (d.off) { lastZoomVR = null; if (lockedGroup) chrome.storage.local.remove(TVZOOM_KEY + ":" + lockedGroup); return; } // overlay says zoom inactive (timeframe hides GEX / unlocked) → stop heartbeating + drop the record so gexbot unlocks
    if (tvPushMode !== "auto" || !lockedGroup || !tvZoomSync || activeValid() !== true || !activeTicker) return;
    if (!isFinite(d.yMin) || !isFinite(d.yMax)) return;
    lastZoomVR = { yMin: d.yMin, yMax: d.yMax };
    const now = Date.now();
    if (now - lastZoomWrite < 200) return; // throttle storage writes; the 1.5s heartbeat flushes the final value
    lastZoomWrite = now;
    sSet({ [TVZOOM_KEY + ":" + lockedGroup]: { yMin: d.yMin, yMax: d.yMax, ticker: activeTicker, owner: TV_TAB, exp: now + 6000 } });
  });

  // Popup edits (key / enable / per-level color+toggle) → repaint with cached levels, or refetch.
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "local" || !alive()) return;
      if (c[CFG_KEY] || c[GX_KEY]) readCfg(() => {
        publish(); // repaint with the new toggles/colors
        if (keyReady && tvEnabled) fetchAll(); // need may have changed (e.g. state toggled on) → refetch every pane symbol
      });
    });
  } catch { dead = true; }

  readCfg(() => {
    requestTickers();
    window.dispatchEvent(new CustomEvent("gexsync-tv-hello")); // ask MAIN to (re)emit the current symbol
  });
})();
