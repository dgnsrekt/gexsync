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
      if (applyingRemote) return;
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

  // Delegated change listener survives the re-render when latest/next flips.
  document.addEventListener("change", (e) => {
    if (applyingRemote || !e.target.closest?.(".MuiSwitch-root")) return;
    const sw = getSwitches(), state = {};
    for (const k of OPTS) if (sw[k]) state[k] = sw[k].checked;
    send({ [OPTS_KEY]: { state, t: performance.now() } });
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue?.panelScope) panelScope = changes[CFG_KEY].newValue.panelScope;
    if (changes[KEY]?.newValue) applyProfile(changes[KEY].newValue.group, changes[KEY].newValue.keyword);
    if (changes[panelKey()]?.newValue) applyPanel(changes[panelKey()].newValue.collapsed);
    if (changes[OPTS_KEY]?.newValue) applyOpts(changes[OPTS_KEY].newValue.state);
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
