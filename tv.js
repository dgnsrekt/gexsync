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
    const slim = (o) => o ? { zeroGamma: o.zeroGamma, majorPos: o.majorPos, majorNeg: o.majorNeg, spot: o.spot, minDte: o.minDte, secDte: o.secDte } : null;
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
      lang: LANG, // popup UI language for the overlay's pill/toasts/labels
      cfg: { enabled: true, linesOn: tvLinesOn, levels: tvLevels, lineOpacity: tvLineOp, histOpacity: tvHistOp, tier: gexTier, caps: caps(), vis: resolveVis() }, // vis = allowed timeframe buckets (null = all)
    });
    if (n.textContent !== payload) n.textContent = payload;
  }

  function requestTickers() {
    send({ type: "gexsync-gexbot-tickers" }, (res) => {
      if (res && res.ok && Array.isArray(res.tickers)) {
        universe = new Set(res.tickers);
        if (curTicker) { valid = universe.has(curTicker); publish(); if (valid) fetchMajors(); } // re-evaluate current symbol
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
    valid = universe ? universe.has(ticker) : null; // null until the universe loads
    publish();
    if (valid !== false) fetchMajors();
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
