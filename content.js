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
  let panelScope = "page"; // config-driven, kept live via onChanged below
  let watermark = true; // append this tab's profile to the chart's ticker watermark
  const panelKey = () => scopedKey("gexsync-panel", panelScope);
  chrome.storage.local.get(CFG_KEY, (r) => {
    if (r[CFG_KEY]?.panelScope) panelScope = r[CFG_KEY].panelScope;
    watermark = r[CFG_KEY]?.watermark !== false; // default on
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
  // Set the ticker via GEXbot's URL-hash scheme (/state#TICKER#profile), which
  // encodes THIS tab's own profile alongside the new ticker; then strip the hash
  // and reload the bare url so the price line renders (see reloadClean below).
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
  const busyKey = () => `${tickerChan()}:busy`; // group-scoped "a sync is in flight" flag
  let pendingReload = false; // this tab is queued/reloading for a ticker change
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
  // Per-tab id. Keep it only across OUR ticker-reload (gexsyncReloading set, so
  // the lock holder still matches after the reload); otherwise mint a fresh one.
  // Duplicating a tab copies sessionStorage, so without this two tabs would share
  // an id and both think they hold the lock — regenerating on any non-reload load
  // gives duplicates distinct ids again.
  const TAB = sessionStorage.gexsyncReloading === "1"
    ? sessionStorage.gexsyncTab
    : (sessionStorage.gexsyncTab = Math.random().toString(36).slice(2));
  const lockFree = (l) => !l || !l.holder || l.holder === TAB || Date.now() > l.exp;
  function applyTicker(ticker) {
    if (!ticker || baseTicker() === ticker) return; // already on this ticker (ignore the es-future suffix)
    applyingRemote = true; // hold off the poll while we queue the reload
    pendingReload = true; // this tab is now part of the in-flight sync (keeps busy fresh)
    const tryReload = () => get(LOCK_KEY, (r) => {
      if (!lockFree(r[LOCK_KEY])) return void setTimeout(tryReload, 500); // another tab is reloading
      send({ [LOCK_KEY]: { holder: TAB, exp: Date.now() + LOCK_MS } });
      setTimeout(() => get(LOCK_KEY, (r2) => { // did we win the lock?
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
      get(LOCK_KEY, (r) => { // hand off to the next queued tab
        if (r[LOCK_KEY]?.holder === TAB) send({ [LOCK_KEY]: { holder: null, exp: 0 } });
      });
    }, 300);
  }
  releaseLockOnBoot();
  let lastTicker = null;
  setInterval(() => {
    if (!onSyncPage()) return;
    const t = baseTicker(); // underlying only — the es-future suffix syncs on its own channel
    if (lastTicker === null) { lastTicker = t; return; }       // baseline — don't broadcast the initial value
    if (applyingRemote || !tickerSync()) { lastTicker = t; return; }
    if (t && t !== lastTicker) {
      lastTicker = t;
      send({ [tickerChan()]: { ticker: t, t: performance.now() } });
      send({ [busyKey()]: { exp: Date.now() + 3000 } }); // seed the busy flag; followers extend it as they reload
    }
  }, 400);

  // ---- spot ↔ es-future sync (Ticker mode; it's a ticker-axis view) ----
  // GEXbot has no dedicated key for it — the toggle just flips the ticker to
  // "SPX⇒ES". Sync it group-scoped like the ticker, but APPLY by clicking the
  // toggle button: it updates the chart live (no reload) and each page (classic /
  // state stores it separately) flips its own button, so it's cross-page safe.
  const ES_CHAN = () => `${TICKER_KEY}-es:${groupName()}`;
  // Brief sync flash so the spot↔future flip feels like the ticker-sync flow even
  // though it applies live (no reload → nothing to wait on). Auto-dismisses; shown
  // on every group tab (the one you toggled and the ones that follow).
  let esFlashEl = null, esFlashTimer = null;
  function flashEsSync(on) {
    const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
    const futLabel = (esToggleBtn(true)?.textContent.trim().toLowerCase()) || "es future";
    const from = on ? "spot price" : futLabel, to = on ? futLabel : "spot price";
    if (!esFlashEl) {
      esFlashEl = document.createElement("div");
      esFlashEl.id = "gexsync-es-overlay";
      esFlashEl.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(8,8,14,.5);backdrop-filter:blur(2px);font-family:system-ui,-apple-system,sans-serif;color:#e7e9ea;pointer-events:none;transition:opacity .2s ease;";
      esFlashEl.innerHTML = `<div style="padding:18px 28px;border-radius:14px;background:rgba(20,18,32,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center">
        <div class="msg" style="font:600 15px system-ui"></div>
        <div class="sub" style="margin-top:8px;color:#9aa0aa;font-size:12px"></div></div>`;
      (document.body || document.documentElement).appendChild(esFlashEl);
    }
    esFlashEl.querySelector(".msg").innerHTML = `syncing <span style="color:${g.color}">${g.name}</span>`;
    esFlashEl.querySelector(".sub").textContent = `${from} → ${to}`;
    esFlashEl.style.display = "flex";
    esFlashEl.style.opacity = "1";
    clearTimeout(esFlashTimer);
    esFlashTimer = setTimeout(() => {
      if (!esFlashEl) return;
      esFlashEl.style.opacity = "0";
      setTimeout(() => { if (esFlashEl) esFlashEl.style.display = "none"; }, 220);
    }, 1100);
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

  // ---- loading overlay during a group ticker sync ----
  // Followers reload one at a time (~seconds each), so block interaction on ALL
  // tabs in the group until it settles — scoped by busyKey so the OTHER color
  // group isn't blocked. A tab is "busy" while queued/reloading (pendingReload)
  // or mid bare-reload (gexsyncReloading); busy tabs keep the flag fresh and
  // everyone shows the overlay while it hasn't expired. It lapses on its own if
  // a tab dies mid-sync, so the overlay can't get stuck.
  let overlayEl = null, overlayMsg = null;
  function setOverlay(on, ticker) {
    if (!on) { if (overlayEl) overlayEl.style.display = "none"; return; }
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "gexsync-ticker-overlay";
      overlayEl.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(8,8,14,.6);backdrop-filter:blur(2px);font-family:system-ui,-apple-system,sans-serif;color:#e7e9ea;";
      overlayEl.innerHTML = `<div style="padding:20px 30px;border-radius:14px;background:rgba(20,18,32,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center">
        <div class="msg" style="font:600 15px system-ui"></div>
        <div style="margin-top:8px;color:#9aa0aa;font-size:12px">tabs are updating — please wait</div></div>`;
      (document.body || document.documentElement).appendChild(overlayEl);
      overlayMsg = overlayEl.querySelector(".msg");
    }
    const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
    overlayMsg.innerHTML = `syncing <span style="color:${g.color}">${g.name}</span> to ${ticker || "…"}`;
    overlayEl.style.display = "flex";
  }
  setInterval(() => {
    if (!alive() || !onSyncPage() || !tickerSync()) { setOverlay(false); return; } // orphaned/off-page/off-ticker: drop the overlay
    if (pendingReload || sessionStorage.gexsyncReloading === "1") send({ [busyKey()]: { exp: Date.now() + 2500 } });
    get([busyKey(), tickerChan()], (r) => {
      const b = r[busyKey()];
      setOverlay(!!b && Date.now() < b.exp, r[tickerChan()]?.ticker);
    });
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
    markSeg.style.cssText = `display:flex;align-items:center;padding:6px 3px 6px 13px;color:${T.muted};`;
    markSeg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4.5v5h5"/></svg>`;

    const modeSeg = document.createElement("span");
    modeSeg.style.cssText = "display:flex;align-items:center;gap:7px;padding:6px 13px 6px 7px;cursor:pointer;";
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
    const wm = [...document.querySelectorAll("h6.MuiTypography-h6")]
      .find((e) => { const t = e.textContent.trim(); return t === tk || t.startsWith(tk + " "); });
    if (!wm) return;
    // off → strip back to just the ticker; on → ticker + profile
    const want = watermark ? `${tk} ${profileLabel().replace("90d", "90 days").toUpperCase()}` : tk;
    if (wm.textContent.trim() !== want) wm.textContent = want;
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
      ticker: tickerValue(),
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
    if (changes[CFG_KEY]?.newValue) { const c = changes[CFG_KEY].newValue; if (c.panelScope) panelScope = c.panelScope; watermark = c.watermark !== false; }
    if (changes[MODE_KEY]?.newValue) { mode = changes[MODE_KEY].newValue === "live" ? "profiles" : changes[MODE_KEY].newValue; renderChip(); }
    if (changes[SESSION_KEY]) { replayLocked = !!changes[SESSION_KEY].newValue && changes[SESSION_KEY].newValue.phase !== "idle"; renderChip(); }
    if (!onSyncPage()) return; // off /classic|/state (SPA nav): don't touch the page
    if (profileSync() && changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed); // panel always
    if (profileSync() && changes[OPTS_KEY]?.newValue) applyOpts(changes[OPTS_KEY].newValue.state);
    if (tickerSync() && changes[tickerChan()]?.newValue) applyTicker(changes[tickerChan()].newValue.ticker);
    if (tickerSync() && changes[ES_CHAN()]?.newValue) applyEs(changes[ES_CHAN()].newValue.es);
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
      setOverlay(false);
      if (toastEl) toastEl.style.display = "none";
      if (alive()) chrome.storage.local.remove("gexsync-tp:" + TAB); // un-count from the group
    }
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
