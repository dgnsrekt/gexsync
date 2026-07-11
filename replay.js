// GexSync/replay: master→client sync of the replay transport across GEXbot
// tabs. Data is NOT synced — each tab keeps its own ticker/date/history, so you
// can compare (e.g. SPX two different Mondays) and drive them together.
//
// Model (cerberus_gamma style): ONE master tab drives; all others are clients.
//   * The master broadcasts its absolute WALL-CLOCK TIME (not relative steps),
//     so clients can't drift.
//   * A client seeks to the master's time via a secant search on its own time
//     readout — but ONLY if it actually has data within GATE_SEC of that time;
//     otherwise it holds and shows "no data".
//   * The master's floating corner bar shows full transport; client bars show
//     "following HH:MM:SS" + a "Take control" button (no transport).
// First armed tab becomes master; any client can take control. Bus =
// chrome.storage.local, page-scoped.
(function () {
  const KEY = "replay" + location.pathname; // per page: /state vs /classic
  const CFG_KEY = "replay-cfg";             // shared: { armed, master, heartbeat }
  const PP = "rp:";                         // presence heartbeat keys
  const TOL_SEC = 2;        // secant "aligned" tolerance
  const GATE_SEC = 60;      // client must have data within this of the target
  const SETTLE = 120;       // ms for the time readout to update after a set
  const THROTTLE = 150;     // ms between coarse seek broadcasts while dragging
  const HEARTBEAT_MS = 2000;// master re-broadcasts time this often while playing
  let seekSeq = 0, lastSeekSent = 0;
  let timeMap = null, mapMax = -1, building = false, calibrating = false; // index↔time map
  let cfg = { armed: false, master: null, heartbeat: true };
  const ME = Math.random().toString(36).slice(2);
  let lastMasterTod = null, clientNoData = false; // client display state
  let barUI = null;

  const isMaster = () => cfg.armed && cfg.master === ME;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  const send = (obj) => { if (isMaster() && chrome.runtime?.id) chrome.storage.local.set({ [KEY]: { ...obj, from: ME, t: performance.now() } }); };
  const writeCfg = (patch) => { if (chrome.runtime?.id) chrome.storage.local.set({ [CFG_KEY]: { ...cfg, ...patch } }); };

  chrome.storage.local.get(CFG_KEY, (r) => { if (r[CFG_KEY]) cfg = { ...cfg, ...r[CFG_KEY] }; if (barUI) refreshRole(); });

  // ---- element lookups ----
  const slider = () => document.querySelector('input[type=range]');
  const iconOf = (b) => b?.querySelector("svg[data-testid]")?.getAttribute("data-testid");
  const transportBtn = () => [...document.querySelectorAll("button")].find((b) => /^(PlayArrowIcon|PauseIcon)$/.test(iconOf(b) || ""));
  const speedBtn = () => [...document.querySelectorAll("button")].find((b) => /^\d+x$/.test(b.textContent.trim()));
  const isPlaying = () => iconOf(transportBtn()) === "PauseIcon";
  const speedLabel = () => speedBtn()?.textContent.trim() || null;
  const SPEEDS = ["1x", "5x", "25x"];
  const stepIcon = { back1: "ArrowLeftIcon", back30: "FastRewindIcon", fwd1: "ArrowRightIcon", fwd30: "FastForwardIcon" };
  const btnByIcon = (id) => [...document.querySelectorAll("button")].find((b) => iconOf(b) === id);
  const btnByText = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().toLowerCase().includes(t));

  // The replay time readout is the time-of-day text closest to the slider.
  function replayTimeEl() {
    const s = slider();
    if (!s) return null;
    const anc = new Set();
    for (let x = s; x; x = x.parentElement) anc.add(x);
    const dist = (t) => { let n = 0; for (let y = t; y; y = y.parentElement, n++) if (anc.has(y)) return n; return 1e9; };
    let best = null, bd = 1e9;
    for (const el of document.querySelectorAll("*"))
      if (el.children.length === 0 && /^\d{1,2}:\d{2}:\d{2}\s*[AP]M$/i.test(el.textContent.trim())) {
        const d = dist(el); if (d < bd) { bd = d; best = el; }
      }
    return best;
  }
  const parseTod = (txt) => { const m = txt?.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP])/i); if (!m) return null; let h = +m[1] % 12; if (/p/i.test(m[4])) h += 12; return h * 3600 + +m[2] * 60 + +m[3]; };
  const readTod = () => parseTod(replayTimeEl()?.textContent.trim());
  const fmtTod = (s) => { if (s == null) return "—"; let h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60, ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")} ${ap}`; };

  function setSlider(value) {
    const el = slider();
    if (!el) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---- index↔time map: sample the slider once so we can seek to any
  // timestamp instantly + exactly, even during play (cerberus-style). ----
  const MAP_N = 44;
  async function buildMap(max) {
    const el = slider();
    if (!el) return;
    calibrating = true;
    const savedIdx = +el.value, wasPlaying = isPlaying();
    if (wasPlaying) transportBtn()?.click(); // pause during calibration
    const raw = [];
    for (let k = 0; k <= MAP_N; k++) {
      setSlider(Math.round((k / MAP_N) * max));
      await wait(SETTLE);
      const tod = readTod();
      if (tod != null) raw.push({ i: +el.value, tod });
    }
    // collect-then-clean: sort by index, keep the strictly-increasing-tod
    // subsequence (drops the odd stale read instead of aborting the whole map)
    raw.sort((a, b) => a.i - b.i);
    const map = [];
    for (const p of raw) if (!map.length || p.tod > map[map.length - 1].tod) map.push(p);
    timeMap = map.length >= 2 ? map : null;
    setSlider(savedIdx);
    if (wasPlaying) { await wait(SETTLE); transportBtn()?.click(); } // resume
    calibrating = false;
    if (barUI) barUI.bar.dataset.maplen = timeMap ? timeMap.length : 0;
  }
  let buildTries = 0;
  async function maybeBuildMap() {
    const el = slider();
    if (!el || building || calibrating) return;
    const max = +el.max || 0;
    if (max === mapMax && timeMap) return;
    if (max < 2) { timeMap = null; mapMax = max; return; }
    mapMax = max;
    building = true;
    try { await buildMap(max); } finally { building = false; }
    if (!timeMap && buildTries++ < 3) mapMax = -1; // self-heal: retry a few times
  }
  function todToIndex(tod) {
    const m = timeMap;
    if (!m || m.length < 2) return null;
    if (tod <= m[0].tod) return m[0].i;
    if (tod >= m[m.length - 1].tod) return m[m.length - 1].i;
    let lo = 0, hi = m.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m[mid].tod <= tod) lo = mid; else hi = mid; }
    const a = m[lo], b = m[hi], f = (tod - a.tod) / ((b.tod - a.tod) || 1);
    return Math.round(a.i + f * (b.i - a.i));
  }
  const mapInRange = (tod) => timeMap && tod >= timeMap[0].tod - GATE_SEC && tod <= timeMap[timeMap.length - 1].tod + GATE_SEC;

  // ---- client: apply the master's messages ----
  async function applySeek(msg) {
    const el = slider();
    if (!el || msg.tod == null) { if (msg.frac != null && el) setSlider(Math.round(msg.frac * (+el.max || 1))); return; }
    lastMasterTod = msg.tod;
    const max = +el.max || 1;

    // Preferred path: the index↔time map gives an exact index in one shot —
    // stable during play (no reading a moving clock) and time-accurate.
    if (timeMap) {
      if (!mapInRange(msg.tod)) { clientNoData = true; return; } // client lacks this time
      clientNoData = false;
      const target = clamp(todToIndex(msg.tod) ?? +el.value, max);
      setSlider(target);
      if (isPlaying()) return;                 // during play: map is enough, don't fight the clock
      // paused: one quick secant polish from the map seed for sub-tick accuracy
      const my = ++seekSeq;
      await wait(SETTLE); if (my !== seekSeq) return;
      let i1 = +el.value, t1 = readTod();
      for (let k = 0; k < 3 && t1 != null && Math.abs(t1 - msg.tod) > TOL_SEC; k++) {
        const near = timeMap.reduce((p, c) => Math.abs(c.i - i1) < Math.abs(p.i - i1) ? c : p);
        const slope = (t1 - near.tod) / ((i1 - near.i) || 1);
        if (!isFinite(slope) || slope === 0) break;
        const i2 = clamp(Math.round(i1 + (msg.tod - t1) / slope), max);
        if (i2 === i1) break;
        i1 = i2; setSlider(i1); await wait(SETTLE); if (my !== seekSeq) return; t1 = readTod();
      }
      return;
    }

    // Fallback (map not built yet): coarse proportional seek, no secant during play.
    setSlider(Math.round((msg.frac ?? 0) * max));
    clientNoData = false;
  }

  function apply(msg) {
    switch (msg.action) {
      case "seek": applySeek(msg); break;
      case "play": if (isPlaying() !== msg.playing) transportBtn()?.click(); break;
      case "speed": for (let i = 0; i < 4 && speedLabel() !== msg.speed; i++) speedBtn()?.click(); break;
      case "load": btnByText("load history")?.click(); break;   // each tab loads its own selected date
      case "clear": btnByText("clear history")?.click(); break;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) { cfg = { ...cfg, ...changes[CFG_KEY].newValue }; refreshRole(); elect(); }
    const msg = changes[KEY]?.newValue;
    if (cfg.armed && !isMaster() && msg && msg.from !== ME) apply(msg); // only clients apply
  });

  // ---- master: broadcast local changes ----
  function bcastSeek(withTod) {
    const el = slider();
    if (!el) return;
    const m = { action: "seek", frac: +el.value / (+el.max || 1) };
    if (withTod) { const td = readTod(); if (td != null) m.tod = td; }
    send(m);
  }
  let settleTimer = null;
  const scheduleSettle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(() => bcastSeek(true), 180); };

  document.addEventListener("input", (e) => {
    if (!isMaster() || calibrating || e.target !== slider()) return;
    const now = performance.now();
    if (now - lastSeekSent >= THROTTLE) { lastSeekSent = now; bcastSeek(false); }
    scheduleSettle();
  }, true);

  document.addEventListener("click", (e) => {
    if (!isMaster()) return;
    const btn = e.target.closest?.("button");
    if (!btn) return;
    const icon = iconOf(btn) || "", txt = btn.textContent.trim().toLowerCase();
    if (/^(PlayArrowIcon|PauseIcon)$/.test(icon))
      setTimeout(() => { send({ action: "play", playing: isPlaying() }); bcastSeek(true); }, 150);
    else if (/^(ArrowLeftIcon|ArrowRightIcon|FastRewindIcon|FastForwardIcon)$/.test(icon))
      setTimeout(() => bcastSeek(true), 150);
    else if (/^\d+x$/.test(txt))
      setTimeout(() => send({ action: "speed", speed: speedLabel() }), 60);
  }, true);

  // master heartbeat: while playing (and enabled), re-broadcast time so clients track
  setInterval(() => { if (isMaster() && cfg.heartbeat && isPlaying()) bcastSeek(true); }, HEARTBEAT_MS);

  // ---- presence + master election ----
  const beat = () => { if (chrome.runtime?.id) chrome.storage.local.set({ [PP + ME]: { t: Date.now() } }); };
  async function presentIds() {
    if (!chrome.runtime?.id) return new Set();
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    return new Set(Object.entries(all).filter(([k, v]) => k.startsWith(PP) && v && now - v.t < 8000).map(([k]) => k.slice(PP.length)));
  }
  async function elect() {
    if (!cfg.armed) return;
    const present = await presentIds();
    if (!cfg.master || !present.has(cfg.master)) writeCfg({ master: ME }); // first-armed / vacant → claim
  }
  beat(); setInterval(() => { beat(); elect(); maybeBuildMap(); }, 3000);
  setTimeout(maybeBuildMap, 1500); // build the map shortly after load
  window.addEventListener("beforeunload", () => { if (chrome.runtime?.id) chrome.storage.local.remove(PP + ME); });

  // ---- floating bar (shadow DOM, corner-anchored expand) ----
  function refreshRole() {
    if (!barUI) return;
    barUI.bar.dataset.role = isMaster() ? "master" : "client";
    barUI.bar.dataset.armed = cfg.armed ? "1" : "0";
    barUI.arm.checked = cfg.armed;
  }
  // Monochrome SVG icons (block-centered → no glyph-baseline misalignment).
  const s = (inner, o = "") => `<svg viewBox="0 0 24 24" width="16" height="16" ${o}>${inner}</svg>`;
  const stroke = 'fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"';
  const IC = {
    restart: s('<rect x="5" y="5" width="2.4" height="14" rx="1"/><path d="M20 5v14l-10-7z"/>', 'fill="currentColor"'),
    back30: s('<path d="M18 18l-6-6 6-6"/><path d="M11 18l-6-6 6-6"/>', stroke),
    back1: s('<path d="M15 18l-6-6 6-6"/>', stroke),
    fwd1: s('<path d="M9 18l6-6-6-6"/>', stroke),
    fwd30: s('<path d="M6 18l6-6-6-6"/><path d="M13 18l6-6-6-6"/>', stroke),
    play: s('<path d="M7 5v14l12-7z"/>', 'fill="currentColor"'),
    pause: s('<path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/>', 'fill="currentColor"'),
    lock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', stroke),
    replay: s('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4.5v5h5"/>', stroke),
  };

  function buildBar() {
    if (document.getElementById("gexsync-replay-bar")) return;
    const host = document.createElement("div");
    host.id = "gexsync-replay-bar";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .bar { position:fixed; left:20px; bottom:20px; display:flex; align-items:center; padding:6px;
          border-radius:9999px; background:rgba(20,18,32,.66); backdrop-filter:blur(16px);
          border:1px solid rgba(255,255,255,.12); box-shadow:0 16px 48px rgba(0,0,0,.5);
          z-index:2147483000; font:13px system-ui,-apple-system,sans-serif; color:#e7e9ea; user-select:none; }
        .anchor { flex:0 0 auto; width:38px; height:38px; border-radius:9999px; border:none;
          background:transparent; color:#9aa0aa; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
        .bar[data-armed="1"][data-role="master"] .anchor { color:#00d68f; }
        .bar[data-armed="1"][data-role="client"] .anchor { color:#4aa3ff; }
        .bar[data-cal="1"] .anchor { animation:calpulse 1.1s ease-in-out infinite; }
        @keyframes calpulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        .rest { display:flex; align-items:center; gap:3px; max-width:0; opacity:0; overflow:hidden;
          transition:max-width .42s cubic-bezier(.4,0,.2,1), opacity .25s ease, margin-left .3s ease; }
        .bar[data-open="1"] .rest { max-width:760px; opacity:1; margin-left:4px; }
        .b { flex:0 0 auto; height:34px; min-width:34px; padding:0 8px; border-radius:9999px; border:none;
          background:transparent; color:#e7e9ea; cursor:pointer; font:inherit; font-size:13px;
          display:flex; align-items:center; justify-content:center; line-height:1; }
        .b svg, .anchor svg { display:block; }
        .b:hover { background:rgba(255,255,255,.12); color:#fff; }
        .pp { background:rgba(255,255,255,.95); color:#0a0a12; }
        .pp:hover { background:#fff; color:#000; }
        .speed { font-size:12px; font-weight:600; min-width:40px; }
        .lc { font-size:12px; font-weight:600; }
        .lc.clear { color:#ff8a8a; }
        .lc.clear:hover { background:rgba(255,90,90,.18); color:#ffb3b3; }
        .sep { width:1px; height:20px; background:rgba(255,255,255,.14); margin:0 3px; flex:0 0 auto; }
        .arm { display:flex; align-items:center; gap:5px; padding:0 8px 0 4px; font-size:12px; cursor:pointer; white-space:nowrap; }
        .arm input { accent-color:#00d68f; cursor:pointer; margin:0; }
        .count { color:#9aa0aa; font-weight:700; min-width:12px; text-align:center; }
        .master-only, .client-only { display:flex; align-items:center; gap:3px; }
        .bar[data-role="client"] .master-only { display:none; }
        .bar[data-role="master"] .client-only { display:none; }
        .foll { color:#9aa0aa; font-size:12px; white-space:nowrap; }
        .ftime { font-variant-numeric:tabular-nums; font-weight:600; min-width:92px; white-space:nowrap; }
        .bar[data-role="client"].nodata .foll, .bar[data-role="client"].nodata .ftime { color:#ff9d4a; }
        .take { height:30px; padding:0 12px; border-radius:9999px; border:1px solid rgba(255,255,255,.18);
          background:transparent; color:#e7e9ea; cursor:pointer; font-size:12px; white-space:nowrap; }
        .take:hover { background:rgba(255,255,255,.12); }
      </style>
      <div class="bar" data-open="0" data-role="client" data-armed="0">
        <button class="anchor" title="GexSync replay">${IC.replay}</button>
        <div class="rest">
          <label class="arm"><input type="checkbox">sync<b class="count">·</b></label>
          <span class="sep"></span>
          <div class="master-only">
            <button class="b" data-cmd="restart" title="Restart from start">${IC.restart}</button>
            <button class="b" data-cmd="back30" title="30s back">${IC.back30}</button>
            <button class="b" data-cmd="back1" title="1s back">${IC.back1}</button>
            <button class="b pp" data-cmd="play" title="Play / pause">${IC.play}</button>
            <button class="b" data-cmd="fwd1" title="1s forward">${IC.fwd1}</button>
            <button class="b" data-cmd="fwd30" title="30s forward">${IC.fwd30}</button>
            <span class="sep"></span>
            <button class="b speed" data-cmd="speed" title="Speed">1x</button>
            <span class="sep"></span>
            <button class="b lc" data-cmd="loadall" title="Load history on all tabs">load</button>
            <button class="b lc clear" data-cmd="clearall" title="Clear history on all tabs">clear</button>
          </div>
          <div class="client-only">
            <span class="foll">following</span>
            <b class="ftime">—</b>
            <button class="take">Take control</button>
          </div>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);
    const bar = root.querySelector(".bar");
    barUI = { bar, arm: root.querySelector(".arm input"), pp: root.querySelector(".pp"),
      speed: root.querySelector(".speed"), count: root.querySelector(".count"),
      foll: root.querySelector(".foll"), ftime: root.querySelector(".ftime") };

    // Hover opens; leaving keeps it up briefly (or forever if pinned by click).
    const anchor = root.querySelector(".anchor");
    let closeT;
    bar.addEventListener("mouseenter", () => { clearTimeout(closeT); bar.dataset.open = "1"; });
    bar.addEventListener("mouseleave", () => { if (bar.dataset.pinned !== "1") { clearTimeout(closeT); closeT = setTimeout(() => { bar.dataset.open = "0"; }, 1500); } });
    anchor.addEventListener("click", () => {
      const p = bar.dataset.pinned === "1";
      bar.dataset.pinned = p ? "0" : "1";
      bar.dataset.open = p ? "0" : "1";
      anchor.innerHTML = p ? IC.replay : IC.lock; // replay unpinned, padlock locked open
    });

    barUI.arm.addEventListener("change", () => { writeCfg({ armed: barUI.arm.checked }); });
    root.querySelector(".take").addEventListener("click", () => writeCfg({ armed: true, master: ME }));
    // master controls → drive native controls; the master's native listeners
    // broadcast the resulting time. load/clear-all fan a command to every tab.
    root.querySelectorAll(".master-only .b").forEach((b) => b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      if (cmd === "restart") setSlider(0);                       // input listener broadcasts resulting time
      else if (cmd === "play") transportBtn()?.click();
      else if (cmd === "speed") speedBtn()?.click();
      else if (cmd === "loadall") { btnByText("load history")?.click(); send({ action: "load" }); }
      else if (cmd === "clearall") { btnByText("clear history")?.click(); send({ action: "clear" }); }
      else btnByIcon(stepIcon[cmd])?.click();
    }));

    refreshRole();
    setInterval(async () => {
      bar.dataset.cal = calibrating ? "1" : "0";
      if (isMaster()) { barUI.pp.innerHTML = isPlaying() ? IC.pause : IC.play; const sl = speedLabel(); if (sl) barUI.speed.textContent = sl; }
      else { bar.classList.toggle("nodata", clientNoData); barUI.foll.textContent = clientNoData ? "no data" : "following"; barUI.ftime.textContent = fmtTod(lastMasterTod); }
      barUI.count.textContent = (await presentIds()).size || "·";
    }, 500);
  }
  if (document.body) buildBar(); else window.addEventListener("DOMContentLoaded", buildBar);
})();
