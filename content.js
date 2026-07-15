// GexSync: mirror gex/options profile (90d/latest/next) + settings-panel
// collapse across GEXbot tabs. Tickers untouched. Bus = chrome.storage.local.
(function () {
  const KEY = "gexsync" + location.pathname; // profile channel, always per page
  const CFG_KEY = "gexsync-cfg";
  let applyingRemote = false; // suppress re-broadcast during programmatic click

  // chrome.runtime?.id is falsy once this content script is orphaned by an
  // extension reload/update; guard writes so orphans don't throw uncaught.
  const send = (obj) => { if (chrome.runtime?.id) chrome.storage.local.set(obj); };

  // Channel scope: "page" appends pathname (state/classic separate); "all" shares.
  const scopedKey = (base, scope) => (scope === "all" ? base : base + location.pathname);
  let panelScope = "page"; // config-driven, kept live via onChanged below
  const panelKey = () => scopedKey("gexsync-panel", panelScope);
  chrome.storage.local.get(CFG_KEY, (r) => { if (r[CFG_KEY]?.panelScope) panelScope = r[CFG_KEY].panelScope; });

  // Mode gates what syncs (one axis at a time; panel-collapse always syncs):
  //   profiles — gex + options profiles sync; ticker independent
  //   ticker   — the ticker syncs across state+classic; profiles independent
  //   replay   — handled by replay.js
  const MODE_KEY = "gexsync-mode";
  const TICKER_KEY = "gexsync-ticker"; // cross-page (state + classic share the ticker)
  let mode = "profiles";
  chrome.storage.local.get(MODE_KEY, (r) => { if (r[MODE_KEY]) mode = r[MODE_KEY] === "live" ? "profiles" : r[MODE_KEY]; renderChip(); });
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
    if (!group) return;
    new MutationObserver(() => {
      if (applyingRemote || !profileSync()) return; // gex/options only sync in Live mode
      const keyword = selectedKeyword(group);
      // ponytail: t forces onChanged to fire even when keyword repeats
      if (keyword) send({ [KEY]: { group: groupName, keyword, t: performance.now() } });
    }).observe(group, { attributes: true, subtree: true, attributeFilter: ["aria-pressed", "class"] });
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
  // Set the ticker via GEXbot's URL-hash scheme (/state#TICKER#profile), which
  // encodes THIS tab's own profile alongside the new ticker; then strip the hash
  // and reload the bare url so the price line renders (see reloadClean below).
  const tickerValue = () => document.querySelector("input[role=combobox]")?.value || null;
  function profileSegment() {
    const { gex, options } = getGroups();
    const g = selectedKeyword(gex);
    if (g) return g; // gex mode: 90d | latest | next
    const o = selectedKeyword(options), sw = getSwitches();
    const greek = OPTS.find((k) => sw[k]?.checked);
    if (o && greek) return `option#${o}#greek:${greek}`; // options mode
    return o || "latest";
  }
  function reloadClean(ticker) {
    applyingRemote = true;
    sessionStorage.gexsyncReloading = "1"; // marks us as lock holder across the reload
    // Apply ticker + THIS tab's profile via the hash (GEXbot persists both to
    // localStorage), then strip the hash and reload the BARE url. The intraday
    // price line only renders on a fresh bare-url load — an in-place hash strip
    // leaves it blank. The lock (below) serializes tabs so the two /state tabs
    // never read the shared localStorage profile at the same time and collapse.
    location.hash = `#${ticker}#${profileSegment()}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    setTimeout(() => {
      history.replaceState(null, "", location.pathname);
      location.reload();
    }, 800); // let GEXbot commit the hash's ticker + profile to localStorage first
  }
  // Serialize follower reloads. Two /state tabs reloading + fetching at once
  // wedges the second on "Loading… / no data" AND races the shared localStorage
  // profile into a collapse — so tabs reload ONE AT A TIME via a storage lock:
  // acquire before reload, release once this tab's data has loaded (below). The
  // holder id lives in sessionStorage so it survives the reload — sessionStorage
  // is per-tab, so the two /state tabs get distinct ids (unlike the shared
  // localStorage that caused the profile race).
  // ponytail: 15s expiry frees the lock if a holder never finishes (e.g. a
  // hidden tab that won't repaint) — fine for the all-monitors-visible use case.
  const LOCK_KEY = "gexsync-ticker-lock", LOCK_MS = 15000;
  const TAB = sessionStorage.gexsyncTab || (sessionStorage.gexsyncTab = Math.random().toString(36).slice(2));
  const lockFree = (l) => !l || !l.holder || l.holder === TAB || Date.now() > l.exp;
  function applyTicker(ticker) {
    if (!ticker || tickerValue() === ticker) return; // already on this ticker
    applyingRemote = true; // hold off the poll while we queue the reload
    const tryReload = () => chrome.storage.local.get(LOCK_KEY, (r) => {
      if (!lockFree(r[LOCK_KEY])) return void setTimeout(tryReload, 500); // another tab is reloading
      send({ [LOCK_KEY]: { holder: TAB, exp: Date.now() + LOCK_MS } });
      setTimeout(() => chrome.storage.local.get(LOCK_KEY, (r2) => { // did we win the lock?
        if (r2[LOCK_KEY]?.holder === TAB) reloadClean(ticker);
        else setTimeout(tryReload, 300 + Math.random() * 400); // lost the race — back off, retry
      }), 150);
    });
    tryReload();
  }
  // After a ticker-mode reload the tab lands on the bare url holding the lock
  // (sessionStorage flag). Wait until data has actually loaded (spot value
  // populated), then release the lock so the next queued tab can reload. Waiting
  // for real data — not just controls — avoids handing off mid-fetch. 10s cap so
  // a tab that never loads can't hold the lock forever.
  function releaseLockOnBoot() {
    if (sessionStorage.gexsyncReloading !== "1") return;
    const t0 = performance.now();
    const wait = setInterval(() => {
      const ready = /spot\s+[\d,]*[1-9][\d.,]*/i.test(document.body.innerText); // real data in
      if (!ready && performance.now() - t0 < 10000) return;
      clearInterval(wait);
      sessionStorage.removeItem("gexsyncReloading");
      chrome.storage.local.get(LOCK_KEY, (r) => { // hand off to the next queued tab
        if (r[LOCK_KEY]?.holder === TAB) send({ [LOCK_KEY]: { holder: null, exp: 0 } });
      });
    }, 300);
  }
  releaseLockOnBoot();
  let lastTicker = null;
  setInterval(() => {
    const t = tickerValue();
    if (lastTicker === null) { lastTicker = t; return; }       // baseline — don't broadcast the initial value
    if (applyingRemote || !tickerSync()) { lastTicker = t; return; }
    if (t && t !== lastTicker) { lastTicker = t; send({ [TICKER_KEY]: { ticker: t, t: performance.now() } }); }
  }, 400);

  // ---- persistent mode chip: shows the current sync mode, click to cycle ----
  let renderChip = () => {};
  function buildModeChip() {
    if (document.getElementById("gexsync-mode-chip")) return;
    const chip = document.createElement("div");
    chip.id = "gexsync-mode-chip";
    chip.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147482000;display:flex;align-items:center;gap:7px;padding:6px 13px;border-radius:9999px;background:rgba(20,18,32,.82);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);color:#e7e9ea;font:600 12px system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;";
    chip.title = "GexSync mode — click to cycle (Profiles / Ticker / Replay)";
    const MODES = ["profiles", "ticker", "replay"];
    const LABEL = { profiles: "Profiles", ticker: "Ticker", replay: "Replay" };
    const COLOR = { profiles: "#4aa3ff", ticker: "#00d68f", replay: "#ffb454" };
    renderChip = () => { const m = MODES.includes(mode) ? mode : "profiles"; chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${COLOR[m]}"></span>sync: ${LABEL[m]}`; };
    chip.addEventListener("click", () => chrome.storage.local.set({ [MODE_KEY]: MODES[(MODES.indexOf(mode) + 1) % MODES.length] }));
    (document.body || document.documentElement).appendChild(chip);
    renderChip();
  }
  if (document.body) buildModeChip(); else window.addEventListener("DOMContentLoaded", buildModeChip);

  // Report this tab's full state to the popup on request.
  function getState() {
    const { gex, options } = getGroups();
    const sw = getSwitches();
    return {
      page: location.pathname.replace(/^\//, ""), // "state" | "classic"
      ticker: document.querySelector("input[role=combobox]")?.value || null,
      gex: selectedKeyword(gex),
      options: selectedKeyword(options),
      greeks: OPTS.filter((k) => sw[k]?.checked),
      collapsed: panelCollapsed(),
    };
  }
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg === "getState") reply(getState());
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue?.panelScope) panelScope = changes[CFG_KEY].newValue.panelScope;
    if (changes[MODE_KEY]?.newValue) { mode = changes[MODE_KEY].newValue === "live" ? "profiles" : changes[MODE_KEY].newValue; renderChip(); }
    if (profileSync() && changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed); // panel always
    if (profileSync() && changes[OPTS_KEY]?.newValue) applyOpts(changes[OPTS_KEY].newValue.state);
    if (tickerSync() && changes[TICKER_KEY]?.newValue) applyTicker(changes[TICKER_KEY].newValue.ticker);
  });

  // SPA renders late; poll until controls exist, attach each once.
  let groupsDone = false, panelDone = false;
  const boot = setInterval(() => {
    if (!groupsDone) {
      const { gex, options } = getGroups();
      if (gex || options) { watch(gex, "gex"); watch(options, "options"); groupsDone = true; }
    }
    if (!panelDone) panelDone = watchPanel();
    if (groupsDone && panelDone) clearInterval(boot);
  }, 500);
})();
