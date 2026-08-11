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
  const TV_TAB = Math.random().toString(36).slice(2); // this chart's id (fresh per load) → lock owner tag
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
  let tvAutoUpdate = 0; // auto-heal stale alerts every N minutes (0 = off); MAIN runs it on the wall clock
  let tvPushMode = "off", tvPushGroup = "green", lockedGroup = null, activeGroups = [], pushTimer = null; // ticker-push: mode off|manual|auto, target group, group THIS chart locked (auto), live [{name,color,count,lock}], poll handle
  let tvZoomSync = false, lastZoomVR = null, lastZoomWrite = 0; // y-axis push (auto+locked only): opt-in flag, last {yMin,yMax} the overlay emitted, last storage-write stamp (throttle)
  let universe = null, curTicker = "", valid = null, lastLevels = null, lastErr = null;
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
      tvAutoUpdate = [0, 1, 5, 15, 30].includes(g.tvAutoUpdate) ? g.tvAutoUpdate : 0;
      tvPushMode = ["off", "manual", "auto"].includes(g.tvPushMode) ? g.tvPushMode : (g.tvPushTicker === true ? "manual" : "off"); // off by default; migrate the old tvPushTicker boolean → manual
      if (TV_GROUPS.some((x) => x.name === g.tvPushGroup)) tvPushGroup = g.tvPushGroup;
      if (tvPushMode !== "auto" && lockedGroup) releaseLock(); // leaving auto (or off/manual) drops any lock we hold
      pushLoop(tvPushMode !== "off"); // start/stop the presence+lock poll to match the mode
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
  // the pill + lines both disappear; otherwise always carry {ticker, valid, levels?, cfg}.
  function publish() {
    const n = node(), hn = hnode();
    if (!keyReady || !tvEnabled) {
      if (n.textContent) n.textContent = "";
      if (hn.textContent) { hn.textContent = ""; hgen++; }
      return;
    }
    const hasData = !!(lastLevels && (lastLevels.classic || lastLevels.state));
    // Histogram strikes go in their OWN node so MAIN's 100ms change-sig stays tiny; the main
    // payload only carries a version stamp (hgen) that bumps whenever the strikes string changes.
    const src = effHistSrc();
    const hstr = (tvHistogram && valid !== false && hasData && lastLevels[src] && lastLevels[src].strikes)
      ? JSON.stringify({ src, strikes: lastLevels[src].strikes }) : "";
    if (hn.textContent !== hstr) { hn.textContent = hstr; hgen++; }
    // Strip strikes from the main node's levels (they live in hnode) so this string stays small.
    // Strip only the big strikes array (→ hnode); the small detail fields (net gex, OI, max-change, ts)
    // ride along for the pill's details panel.
    const slim = (o) => o ? { zeroGamma: o.zeroGamma, majorPos: o.majorPos, majorNeg: o.majorNeg, spot: o.spot, minDte: o.minDte, secDte: o.secDte, posOi: o.posOi, negOi: o.negOi, netVol: o.netVol, netOi: o.netOi, ts: o.ts, maxChg: o.maxChg } : null;
    const levelsOut = (valid !== false && hasData) ? { classic: slim(lastLevels.classic), state: slim(lastLevels.state), dte: lastLevels.dte } : null;
    const payload = JSON.stringify({
      ticker: curTicker || null,
      valid,                                          // true | false | null(universe not loaded yet)
      levels: levelsOut, // { classic:{...}|null, state:{...}|null, dte } — strikes excluded (see hnode)
      err: (valid !== false && !hasData) ? lastErr : null, // surfaced on the pill (rate limited / bad key)
      pkg: PKG_NAME[tvPackage], // "latest" | "next" | "90d" — shown on the pill
      pkgCat: tvPackage.replace("gex_", ""), // "zero" | "one" | "full" — backend token, for the alert name tag
      dte: (valid !== false && hasData && lastLevels.dte) ? PKG_DTE[tvPackage](lastLevels.dte) : null,
      hgen, hist: { on: tvHistogram, src }, // GEX profile: strikes-version + on/off + effective source (src computed above)
      refreshMs: tvRefresh * 1000, // countdown/fetch cadence for the MAIN overlay
      autoUpdateMs: tvAutoUpdate * 60000, // auto-heal stale alerts cadence (0 = off); MAIN aligns to the wall clock
      lang: LANG, // popup UI language for the overlay's pill/toasts/labels
      push: tvPushMode !== "off" ? { mode: tvPushMode, group: tvPushGroup, groups: activeGroups, locked: lockedGroup, zoom: tvPushMode === "auto" && !!lockedGroup && tvZoomSync && valid === true } : null, // ticker-push chip: mode + target + live [{name,color,count,lock}] groups + the group THIS chart locked + whether y-axis push is armed (null = feature off)
      cfg: { enabled: true, linesOn: tvLinesOn, levels: tvLevels, lineOpacity: tvLineOp, histOpacity: tvHistOp, tier: gexTier, caps: caps(), vis: resolveVis(), pauseClosed: tvPauseClosed, staleMode: tvStaleMode }, // vis = allowed timeframe buckets (null = all); pauseClosed = pause poll outside RTH; staleMode = stale-alert cue
    });
    if (n.textContent !== payload) n.textContent = payload;
  }

  function requestTickers() {
    send({ type: "gexsync-gexbot-tickers" }, (res) => {
      if (res && res.ok && Array.isArray(res.tickers)) {
        universe = new Set(res.tickers);
        if (curTicker) { valid = universe.has(curTicker); publish(); if (valid) { fetchMajors(); autoPush(); } } // re-evaluate current symbol (universe just loaded → auto-push may now be valid)
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
  function fetchMajors() {
    if (!curTicker || !keyReady || !tvEnabled || valid === false) return;
    const reqTicker = curTicker, need = needSrc(); // guard against the symbol changing before the reply lands
    if (!need.classic && !need.state) { lastLevels = null; lastErr = null; return publish(); } // every line toggled off
    send({ type: "gexsync-gexbot-majors", ticker: reqTicker, need, cat: tvPackage }, (res) => {
      if (reqTicker !== curTicker) return; // stale response for a ticker we've since left — drop it
      if (res && res.ok && res.data) { lastLevels = res.data; lastErr = res.err || null; }
      else { lastLevels = null; lastErr = (res && res.error) || "no data"; }
      publish();
    });
  }

  function onSymbol(ticker) {
    if (ticker === curTicker) return;
    curTicker = ticker;
    lastLevels = null; lastErr = null;
    lastZoomVR = null; // drop the old symbol's range so the y-axis record isn't tagged with the new ticker before the overlay re-emits
    valid = universe ? universe.has(ticker) : null; // null until the universe loads
    publish();
    if (valid !== false) fetchMajors();
    autoPush(); // symbol changed → if we hold a lock and it's a GEXbot ticker, mirror it to the group
  }

  // MAIN overlay tells us the chart's current symbol (bare ticker).
  window.addEventListener("gexsync-tv-symbol", (e) => { const t = e.detail && e.detail.ticker; if (t) onSymbol(String(t).toUpperCase()); });
  // MAIN owns the refresh cadence + the countdown/force-refresh click; it pings us to fetch.
  window.addEventListener("gexsync-tv-fetch", () => { if (curTicker && valid !== false) fetchMajors(); });
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
    if (lockedGroup && tvZoomSync && valid === true && lastZoomVR) sSet({ [TVZOOM_KEY + ":" + lockedGroup]: { yMin: lastZoomVR.yMin, yMax: lastZoomVR.yMax, ticker: curTicker, owner: TV_TAB, exp: Date.now() + 6000 } }); // heartbeat the y-axis record → stays fresh while idle + flushes the last range
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
    if (tvPushMode !== "auto" || !lockedGroup || valid !== true || !curTicker) return;
    sSet({ [TICKER_KEY + ":" + lockedGroup]: { ticker: curTicker, t: Date.now() } });
  }
  function releaseLock() { if (!lockedGroup) return; const g = lockedGroup; lockedGroup = null; lastZoomVR = null; try { chrome.storage.local.remove([TVLOCK_KEY + ":" + g, TVZOOM_KEY + ":" + g]); } catch {} } // we own them (heartbeat < expiry) → drop the lock + y-axis records so gexbot unlocks
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
    if (tvPushMode !== "manual" || !curTicker || valid !== true || !activeGroups.some((g) => g.name === tvPushGroup)) return; // valid===true → confirmed GEXbot ticker
    sSet({ [TICKER_KEY + ":" + tvPushGroup]: { ticker: curTicker, t: Date.now() } });
  });
  // Auto lock toggle → claim the selected group (exclusive: only if present & not held by another chart),
  // or release the one we hold. On lock, sync the current ticker immediately.
  window.addEventListener("gexsync-tv-push-lock", () => {
    if (tvPushMode !== "auto") return;
    if (lockedGroup) { releaseLock(); publish(); return; }
    const g = activeGroups.find((x) => x.name === tvPushGroup);
    if (!g || g.lock === "other") return; // gone or already taken
    lockedGroup = tvPushGroup;
    sSet({ [TVLOCK_KEY + ":" + lockedGroup]: { owner: TV_TAB, exp: Date.now() + 6000 } });
    publish(); autoPush();
  });
  // y-axis range from the overlay (auto + locked + zoom-sync on, GEXbot ticker) → throttle + write the
  // group's zoom record. readPresence heartbeats it while idle; gexbot validates + follows + locks input.
  window.addEventListener("gexsync-tv-zoom", (e) => {
    const d = (e && e.detail) || {};
    if (d.off) { lastZoomVR = null; if (lockedGroup) chrome.storage.local.remove(TVZOOM_KEY + ":" + lockedGroup); return; } // overlay says zoom inactive (timeframe hides GEX / unlocked) → stop heartbeating + drop the record so gexbot unlocks
    if (tvPushMode !== "auto" || !lockedGroup || !tvZoomSync || valid !== true || !curTicker) return;
    if (!isFinite(d.yMin) || !isFinite(d.yMax)) return;
    lastZoomVR = { yMin: d.yMin, yMax: d.yMax };
    const now = Date.now();
    if (now - lastZoomWrite < 200) return; // throttle storage writes; the 1.5s heartbeat flushes the final value
    lastZoomWrite = now;
    sSet({ [TVZOOM_KEY + ":" + lockedGroup]: { yMin: d.yMin, yMax: d.yMax, ticker: curTicker, owner: TV_TAB, exp: now + 6000 } });
  });

  // Popup edits (key / enable / per-level color+toggle) → repaint with cached levels, or refetch.
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "local" || !alive()) return;
      if (c[CFG_KEY] || c[GX_KEY]) readCfg(() => {
        publish(); // repaint with the new toggles/colors
        if (keyReady && tvEnabled && valid !== false) fetchMajors(); // need may have changed (e.g. state toggled on)
      });
    });
  } catch { dead = true; }

  readCfg(() => {
    requestTickers();
    window.dispatchEvent(new CustomEvent("gexsync-tv-hello")); // ask MAIN to (re)emit the current symbol
  });
})();
