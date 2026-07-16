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
  // Target the ticker combobox specifically — GEXbot's Settings panel adds a
  // "Time Zone" combobox at DOM index 0, so a bare querySelector("input[role=
  // combobox]") would read the timezone and mistake it for a ticker change.
  const tickerInput = () =>
    [...document.querySelectorAll("input[role=combobox]")].find(
      (el) => (el.closest(".MuiAutocomplete-root, .MuiFormControl-root")?.querySelector("label")?.textContent || "").trim().toLowerCase() === "ticker"
    ) || null;
  const tickerValue = () => tickerInput()?.value || null;
  // Ticker groups: scope ticker sync to same-color tabs, so e.g. a green group on
  // TSLA and a red group on NVDA don't touch each other. Every tab starts green;
  // change some to red (etc.) to split them off. The group lives in sessionStorage
  // (per-tab, survives the reload — localStorage is shared across same-origin
  // tabs, so it can't hold a per-tab value).
  const GROUPS = [
    { name: "green", color: "#00d68f" },
    { name: "red", color: "#ff4d4f" },
    { name: "blue", color: "#4aa3ff" },
    { name: "yellow", color: "#ffb454" },
    { name: "purple", color: "#b57aff" },
    { name: "cyan", color: "#22d3ee" },
    { name: "orange", color: "#ff8c42" },
    { name: "pink", color: "#ff5cc8" },
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
    if (!ticker || tickerValue() === ticker) return; // already on this ticker
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
    const t = tickerValue();
    if (lastTicker === null) { lastTicker = t; return; }       // baseline — don't broadcast the initial value
    if (applyingRemote || !tickerSync()) { lastTicker = t; return; }
    if (t && t !== lastTicker) {
      lastTicker = t;
      send({ [tickerChan()]: { ticker: t, t: performance.now() } });
      send({ [busyKey()]: { exp: Date.now() + 3000 } }); // seed the busy flag; followers extend it as they reload
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
    if (!alive() || !tickerSync()) { setOverlay(false); return; } // orphaned/off-ticker: drop the overlay
    if (pendingReload || sessionStorage.gexsyncReloading === "1") send({ [busyKey()]: { exp: Date.now() + 2500 } });
    get([busyKey(), tickerChan()], (r) => {
      const b = r[busyKey()];
      setOverlay(!!b && Date.now() < b.exp, r[tickerChan()]?.ticker);
    });
  }, 400);

  // ---- persistent chip: mode segment (click cycles mode) + group segment
  // (Ticker mode only, click cycles this tab's color group) ----
  let renderChip = () => {};
  function buildModeChip() {
    if (document.getElementById("gexsync-mode-chip")) return;
    const chip = document.createElement("div");
    chip.id = "gexsync-mode-chip";
    // bottom-LEFT, raised above the replay transport bar (left:20 bottom:20) so
    // they don't overlap in Replay mode; the split-view divider covered the right.
    chip.style.cssText = "position:fixed;left:16px;bottom:72px;z-index:2147482000;display:flex;align-items:center;border-radius:9999px;background:rgba(20,18,32,.82);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);color:#e7e9ea;font:600 13px system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;";
    const MODES = ["profiles", "ticker", "replay"];
    const LABEL = { profiles: "Profiles", ticker: "Ticker", replay: "Replay" };

    const modeSeg = document.createElement("span");
    modeSeg.style.cssText = "display:flex;align-items:center;gap:7px;padding:6px 13px;cursor:pointer;";
    modeSeg.title = "GexSync mode — click to cycle (Profiles / Ticker / Replay)";
    modeSeg.addEventListener("click", () => send({ [MODE_KEY]: MODES[(MODES.indexOf(mode) + 1) % MODES.length] }));

    const grpSeg = document.createElement("span");
    grpSeg.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 13px;cursor:pointer;border-left:1px solid rgba(255,255,255,.14);";
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
    infoSeg.style.cssText = "display:flex;align-items:center;padding:6px 13px;border-left:1px solid rgba(255,255,255,.14);font:600 12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.3px;white-space:nowrap;";

    chip.append(modeSeg, grpSeg, infoSeg);
    const shortId = TAB.slice(0, 3).toUpperCase();
    const paintInfo = () => {
      const role = mode === "replay" && chip.dataset.replayRole ? ` · ${chip.dataset.replayRole}` : "";
      const page = location.pathname.replace(/^\//, "").toUpperCase();
      const prof = profileLabel().replace("90d", "90 days").toUpperCase();
      // order: ticker · CLASSIC/STATE · profile [· role] · tab-id (titled)
      infoSeg.innerHTML = `${tickerValue() || "?"} · ${page} · ${prof}${role} · <span title="tab id" style="cursor:help">#${shortId}</span>`;
    };
    // swatch + how many tabs share this group (min-width holds 2 digits steady)
    let groupCount = 1;
    const paintGroup = () => {
      const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
      grpSeg.innerHTML = `<span style="width:11px;height:11px;border-radius:2px;background:${g.color};box-shadow:0 0 0 1px rgba(255,255,255,.35)"></span><span>${g.name}</span><span style="min-width:15px;text-align:center">${groupCount}</span>`;
    };
    renderChip = () => {
      const m = MODES.includes(mode) ? mode : "profiles";
      modeSeg.textContent = `mode: ${LABEL[m]}`;
      const g = GROUPS.find((x) => x.name === groupName()) || GROUPS[0];
      // tint the pill by group only in Ticker mode (groups are inert otherwise)
      chip.style.color = m === "ticker" ? g.color : "#e7e9ea";
      grpSeg.style.display = m === "ticker" ? "flex" : "none";
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
      if (mode !== "ticker") { chrome.storage.local.remove(TP); return; } // drop presence off-ticker
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
    if (profileSync() && changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed); // panel always
    if (profileSync() && changes[OPTS_KEY]?.newValue) applyOpts(changes[OPTS_KEY].newValue.state);
    if (tickerSync() && changes[tickerChan()]?.newValue) applyTicker(changes[tickerChan()].newValue.ticker);
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
