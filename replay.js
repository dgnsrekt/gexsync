// GexSync/replay: master→client sync of the replay transport across GEXbot
// tabs. Data is NOT synced — each tab keeps its own ticker/date/history, so you
// can compare (e.g. SPX two different Mondays) and drive them together.
//
// Rigid session flow (state machine, all explicit):
//   idle    — pick roles. Configure this tab (ticker/profile/date) on GEXbot's
//             own UI, THEN click "Be master" or "Join as client". First a master,
//             then clients join. Claiming a role locks that tab + resets speed→1x.
//   loading — master hit Load All (after an on-page review). Every participant
//             loads its history and builds a time map; overlay shows N/M.
//   running — all maps built. Transport appears; master drives, clients follow by
//             wall-clock time. Everything stays locked until someone Exits.
// Master broadcasts absolute time (not steps) so clients can't drift; a client
// seeks via the time map only if it has data within GATE_SEC, else shows "no data".
// Bus = chrome.storage.local. Exit (bar or popup) tears the session down for all.
(function () {
  const MODE_KEY = "gexsync-mode";          // "profiles" | "ticker" | "replay"
  const CFG_KEY = "replay-cfg";             // persistent prefs { heartbeat, debug }
  const SESSION_KEY = "replay-session";     // live session { phase, master, clients:[] }
  const PART = "rp-part:";                   // per-tab presence + config snapshot
  const LOCK_KEY = "replay-callock";        // only one tab calibrates at a time (avoids browser freeze)
  const CHAN = "replay:session";            // single transport channel (roster is explicit now)
  const TOL_SEC = 2;        // secant "aligned" tolerance
  const GATE_SEC = 60;      // client must have data within this of the target
  const SETTLE = 120;       // ms for the time readout to update after a set
  const THROTTLE = 150;     // ms between coarse seek broadcasts while dragging
  const HEARTBEAT_MS = 2000;// master re-broadcasts time this often while playing
  let seekSeq = 0, lastSeekSent = 0;
  let timeMap = null, mapMax = -1, building = false, calibrating = false; // index↔time map
  let scrubUntil = 0; // suppress live-position updates while dragging the mini scrubber
  const PAGE = location.pathname;           // "/state" | "/classic"
  let mode = "live";
  const active = () => mode === "replay";
  const ME = Math.random().toString(36).slice(2);
  let cfg = { heartbeat: true, debug: false };
  let session = { phase: "idle", master: null, clients: [] };
  let lastMasterTod = null, clientNoData = false; // client display state
  let masterSeen = Date.now();
  let barUI = null, renderBar = () => {}, resetTickCache = () => {};

  // ---- session helpers ----
  const isMaster = () => active() && session.master === ME;
  const isClient = () => active() && session.clients.includes(ME);
  const participating = () => isMaster() || isClient();
  const myRole = () => (session.master === ME ? "master" : session.clients.includes(ME) ? "client" : null);
  const locked = () => active() && session.phase !== "idle";
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  const alive = () => !!chrome.runtime?.id;
  const send = (obj) => { if (isMaster() && alive()) chrome.storage.local.set({ [CHAN]: { ...obj, from: ME, t: performance.now() } }); };
  const writeSession = (patch) => { try { if (alive()) chrome.storage.local.set({ [SESSION_KEY]: { ...session, ...patch } }); } catch (e) { /* orphaned */ } };
  const writeCfg = (patch) => { try { if (alive()) chrome.storage.local.set({ [CFG_KEY]: { ...cfg, ...patch } }); } catch (e) {} };

  chrome.storage.local.get([CFG_KEY, SESSION_KEY, MODE_KEY], (r) => {
    if (r[CFG_KEY]) cfg = { ...cfg, ...r[CFG_KEY] };
    if (r[SESSION_KEY]) session = r[SESSION_KEY];
    if (r[MODE_KEY]) mode = r[MODE_KEY] === "live" ? "live" : r[MODE_KEY];
    renderBar();
  });

  // ---- element lookups ----
  const slider = () => document.querySelector('input[type=range]');
  const iconOf = (b) => b?.querySelector("svg[data-testid]")?.getAttribute("data-testid");
  const transportBtn = () => [...document.querySelectorAll("button")].find((b) => /^(PlayArrowIcon|PauseIcon)$/.test(iconOf(b) || ""));
  const speedBtn = () => [...document.querySelectorAll("button")].find((b) => /^\d+x$/.test(b.textContent.trim()));
  const isPlaying = () => iconOf(transportBtn()) === "PauseIcon";
  const speedLabel = () => speedBtn()?.textContent.trim() || null;
  const stepIcon = { back1: "ArrowLeftIcon", back30: "FastRewindIcon", fwd1: "ArrowRightIcon", fwd30: "FastForwardIcon" };
  const btnByIcon = (id) => [...document.querySelectorAll("button")].find((b) => iconOf(b) === id);
  const btnByText = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().toLowerCase().includes(t));
  // GEXbot's "Live" button (only present while in Historical Playback) returns the
  // tab to live and resets the native transport — click it on session exit.
  const exitPlayback = () => [...document.querySelectorAll('button[aria-label="Live"]')][0]?.click();
  // reset playback speed to 1x (clicking the speed toggle cycles 1x→5x→25x→1x)
  const resetSpeed = () => { for (let i = 0; i < 4 && speedLabel() && speedLabel() !== "1x"; i++) speedBtn()?.click(); };

  // this tab's config, read live for the roster/review (mirrors content.js selectors)
  const tickerInput = () => [...document.querySelectorAll("input[role=combobox]")].find(
    (el) => (el.closest(".MuiAutocomplete-root, .MuiFormControl-root")?.querySelector("label")?.textContent || "").trim().toLowerCase() === "ticker") || null;
  const tickerValue = () => tickerInput()?.value || null;
  const profileValue = () => { const b = [...document.querySelectorAll("button[aria-pressed='true']")].find((x) => /^(90d|latest|next)/i.test(x.textContent.trim())); return b ? b.textContent.trim().split(/\s+/)[0] : null; };
  const dateValue = () => { const b = [...document.querySelectorAll("button")].find((x) => x.querySelector("svg[data-testid='CalendarMonthIcon']")); return b?.textContent.trim() || null; }; // the date button; "?" in review = no historical date picked yet

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
  let _tEl = null; // cache the time element so frequent reads don't re-scan the DOM
  function timeEl() {
    if (_tEl && _tEl.isConnected && /^\d{1,2}:\d{2}:\d{2}\s*[AP]M$/i.test(_tEl.textContent.trim())) return _tEl;
    return (_tEl = replayTimeEl());
  }
  const readTod = () => parseTod(timeEl()?.textContent.trim());
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
      if (k % 10 === 0 && alive()) chrome.storage.local.set({ [LOCK_KEY]: { holder: ME, t: Date.now() } }); // keep the lock alive (slow bg tabs)
    }
    // collect-then-clean: sort by index, keep the strictly-increasing-tod subsequence
    raw.sort((a, b) => a.i - b.i);
    const map = [];
    for (const p of raw) if (!map.length || p.tod > map[map.length - 1].tod) map.push(p);
    const span = map.length ? map[map.length - 1].tod - map[0].tod : 0;
    timeMap = map.length >= 2 && span > 300 ? map : null; // reject degenerate maps
    setSlider(savedIdx);
    if (wasPlaying) { await wait(SETTLE); transportBtn()?.click(); } // resume
    calibrating = false;
  }
  // Serialize calibration across tabs: only one holds the lock at a time, so we
  // never redraw N charts at once (that froze the whole browser).
  async function acquireCalLock() {
    if (!alive()) return false;
    const lock = (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY];
    if (lock && lock.holder !== ME && Date.now() - lock.t < 15000) return false;
    await chrome.storage.local.set({ [LOCK_KEY]: { holder: ME, t: Date.now() } });
    await wait(250);
    return alive() && (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY]?.holder === ME;
  }
  async function releaseCalLock() {
    if (!alive()) return;
    if ((await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY]?.holder === ME) await chrome.storage.local.remove(LOCK_KEY);
  }
  let buildTries = 0;
  async function maybeBuildMap() {
    const el = slider();
    // only participants calibrate, and only once the session is loading/running
    if (!el || building || calibrating || !participating() || session.phase === "idle") return;
    if (document.hidden) return; // hidden tabs don't repaint the chart → stale reads
    const max = +el.max || 0;
    if (max === mapMax && timeMap) return;
    if (max < 2) { timeMap = null; mapMax = max; return; }
    if (!(await acquireCalLock())) return;
    mapMax = max;
    building = true;
    try { await buildMap(max); } finally { building = false; await releaseCalLock(); }
    if (!timeMap && buildTries++ < 3) mapMax = -1; // self-heal: retry a few times
    beat(); // publish readiness now — don't wait for the 3s heartbeat to flip the group ready
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
  function indexToTod(idx) {
    const m = timeMap;
    if (!m || m.length < 2) return null;
    if (idx <= m[0].i) return m[0].tod;
    if (idx >= m[m.length - 1].i) return m[m.length - 1].tod;
    let lo = 0, hi = m.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m[mid].i <= idx) lo = mid; else hi = mid; }
    const a = m[lo], b = m[hi], f = (idx - a.i) / ((b.i - a.i) || 1);
    return Math.round(a.tod + f * (b.tod - a.tod));
  }
  const localTod = () => { const t = readTod(); if (t != null) return t; const s = slider(); return s ? indexToTod(+s.value) : null; };

  // ---- client: apply the master's messages ----
  async function applySeek(msg) {
    const el = slider();
    if (!el || msg.tod == null) { if (msg.frac != null && el) setSlider(Math.round(msg.frac * (+el.max || 1))); return; }
    lastMasterTod = msg.tod;
    const max = +el.max || 1;
    if (timeMap) {
      if (!mapInRange(msg.tod)) { clientNoData = true; return; }
      clientNoData = false;
      const target = clamp(todToIndex(msg.tod) ?? +el.value, max);
      setSlider(target);
      if (isPlaying()) return;
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
    setSlider(Math.round((msg.frac ?? 0) * max));
    clientNoData = false;
  }
  function apply(msg) {
    switch (msg.action) {
      case "seek": applySeek(msg); break;
      case "play": if (isPlaying() !== msg.playing) transportBtn()?.click(); break;
      case "speed": for (let i = 0; i < 4 && speedLabel() !== msg.speed; i++) speedBtn()?.click(); break;
      case "load": btnByText("load history")?.click(); break;
      case "clear": btnByText("clear history")?.click(); break;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) cfg = { ...cfg, ...changes[CFG_KEY].newValue };
    if (changes[SESSION_KEY]) {
      const wasPart = participating();
      const prevPhase = session.phase;
      session = changes[SESSION_KEY].newValue || { phase: "idle", master: null, clients: [] };
      // exit → return to live + drop this tab's cached map so a fresh session recalibrates cleanly
      if (wasPart && session.phase === "idle") { exitPlayback(); timeMap = null; mapMax = -1; buildTries = 0; clientNoData = false; lastMasterTod = null; }
      // entering loading → force a fresh calibration so "ready" is honest. Otherwise the
      // stale idle-phase ready:true (slider max<2) flips the session straight to running,
      // killing the syncing overlay and the post-load restart.
      if (participating() && prevPhase !== "loading" && session.phase === "loading") { timeMap = null; mapMax = -1; buildTries = 0; clientNoData = false; beat(); }
      renderBar(); updateBlocker();
    }
    if (changes[MODE_KEY]?.newValue) { mode = changes[MODE_KEY].newValue === "live" ? "live" : changes[MODE_KEY].newValue; renderBar(); updateBlocker(); if (active()) maybeBuildMap(); }
    const msg = changes[CHAN]?.newValue;
    // ONLY enrolled clients apply — a replay-mode tab that never joined must not
    // load history / play / seek just because it's not the master.
    if (isClient() && msg && msg.from !== ME) apply(msg);
  });

  // ---- master: broadcast local changes (our bar drives native controls, whose
  // listeners fire even for programmatic clicks → the resulting time is sent) ----
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
  setInterval(() => { if (isMaster() && cfg.heartbeat && isPlaying()) bcastSeek(true); }, HEARTBEAT_MS);

  // ---- role actions ----
  function claimMaster() { if (session.master && session.master !== ME) return; resetSpeed(); beat(); writeSession({ master: ME, clients: session.clients.filter((c) => c !== ME) }); }
  function joinClient() { if (session.master === ME || !session.master) return; resetSpeed(); beat(); if (!session.clients.includes(ME)) writeSession({ clients: [...session.clients, ME] }); }
  function leave() { writeSession({ clients: session.clients.filter((c) => c !== ME) }); }
  function takeControl() { writeSession({ master: ME, clients: [...session.clients.filter((c) => c !== ME), session.master].filter(Boolean) }); }
  function exitSession() { if (alive()) chrome.storage.local.set({ [SESSION_KEY]: { phase: "idle", master: null, clients: [] } }); }
  function loadAll() { if (!isMaster()) return; writeSession({ phase: "loading" }); btnByText("load history")?.click(); send({ action: "load" }); }

  // ---- presence + roster (explicit, no election) ----
  // During "loading" a tab is ready ONLY once its map is built — otherwise the
  // pre-load slider (max<2) would report ready during the load gap and flip the
  // whole session to running before anyone calibrated (skipping the overlay +
  // breaking the post-load restart). Empty-date wedge escapes via Exit.
  const selfReady = () => {
    if (!participating() || document.hidden) return true;
    if (session.phase === "loading") return timeMap != null;
    return timeMap != null || (+(slider()?.max) || 0) < 2;
  };
  const beat = () => { if (alive()) chrome.storage.local.set({ [PART + ME]: { t: Date.now(), role: myRole(), page: PAGE, ticker: tickerValue(), profile: profileValue(), date: dateValue(), ready: selfReady() } }); };
  async function partEntries() {
    if (!alive()) return [];
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    return Object.entries(all).filter(([k, v]) => k.startsWith(PART) && v && now - v.t < 8000).map(([k, v]) => ({ id: k.slice(PART.length), ...v }));
  }
  const presentIds = async () => new Set((await partEntries()).map((e) => e.id));
  // roster = present tabs that are in this session (master + clients)
  async function roster() { const ids = new Set([session.master, ...session.clients].filter(Boolean)); return (await partEntries()).filter((e) => ids.has(e.id)); }
  async function groupReady() { const r = await roster(); return { n: r.filter((e) => e.ready).length, m: r.length }; }
  beat();
  setInterval(() => { beat(); maybeBuildMap(); }, 3000);
  setTimeout(maybeBuildMap, 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeBuildMap(); });
  window.addEventListener("beforeunload", () => { if (alive()) chrome.storage.local.remove(PART + ME); });

  // ---- panel click-blocker: freeze GEXbot's settings column on participating
  // tabs once locked (our bar drives the transport programmatically underneath) ----
  let blocker = null;
  function updateBlocker() {
    const show = locked() && participating();
    if (!show) { if (blocker) blocker.style.display = "none"; return; }
    const ti = tickerInput();
    let rect = null;
    for (let el = ti, i = 0; el && i < 12; el = el.parentElement, i++) { const r = el.getBoundingClientRect(); if (r.height > 400 && r.width > 200 && r.width < 520) { rect = r; break; } }
    if (!rect) { if (blocker) blocker.style.display = "none"; return; }
    if (!blocker) {
      blocker = document.createElement("div");
      blocker.id = "gexsync-panel-lock";
      // visible amber scrim (amber = the brand "locked" role) + a message so the
      // user knows GexSync locked the panel on purpose — not a GEXbot bug.
      blocker.style.cssText = "position:fixed;z-index:2147482500;display:flex;align-items:center;justify-content:center;cursor:not-allowed;background:rgba(10,8,16,.42);backdrop-filter:saturate(.5);-webkit-backdrop-filter:saturate(.5);box-shadow:inset 0 0 0 1.5px rgba(255,180,84,.4);font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;";
      blocker.title = "Locked by GexSync for replay sync — Exit the replay bar to unlock";
      blocker.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 16px;border-radius:14px;background:rgba(22,20,31,.95);border:1px solid rgba(255,180,84,.5);box-shadow:0 12px 34px rgba(0,0,0,.55);max-width:210px;text-align:center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFB454" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <div style="color:#FFB454;font:700 12.5px 'IBM Plex Sans',system-ui">Locked for replay sync</div>
        <div style="color:#9AA0AA;font:500 11px 'IBM Plex Sans',system-ui;line-height:1.4">GexSync locked this panel so the tabs stay in sync. Hit <b style="color:#E7E9EA">Exit</b> in the replay bar to unlock.</div></div>`;
      document.documentElement.appendChild(blocker);
    }
    blocker.style.display = "flex";
    blocker.style.left = rect.x + "px"; blocker.style.top = rect.y + "px";
    blocker.style.width = rect.width + "px"; blocker.style.height = rect.height + "px";
  }

  // ---- reusable modal (review before load, confirm before exit) ----
  function modal(bodyHtml, okLabel, onOk, okBg = "#16E0A3", okInk = "#08110c") {
    let m = document.getElementById("gexsync-replay-modal");
    if (!m) { m = document.createElement("div"); m.id = "gexsync-replay-modal"; m.style.cssText = "position:fixed;inset:0;z-index:2147483003;display:flex;align-items:center;justify-content:center;background:rgba(12,8,18,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;color:#E7E9EA;"; document.documentElement.appendChild(m); }
    const btn = "height:36px;padding:0 18px;border-radius:9999px;font:600 13px 'IBM Plex Sans',system-ui;cursor:pointer;border:1px solid rgba(255,255,255,.18);";
    m.innerHTML = `<div style="min-width:320px;max-width:560px;padding:24px 28px;border-radius:18px;background:rgba(22,20,31,.97);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.65)">
        ${bodyHtml}
        <div style="margin-top:22px;display:flex;gap:10px;justify-content:flex-end">
          <button data-x="cancel" style="${btn}background:transparent;color:#E7E9EA">Cancel</button>
          <button data-x="ok" style="${btn}background:${okBg};border-color:${okBg};color:${okInk}">${okLabel}</button>
        </div></div>`;
    m.style.display = "flex";
    m.querySelector('[data-x=cancel]').onclick = () => { m.style.display = "none"; };
    m.querySelector('[data-x=ok]').onclick = () => { m.style.display = "none"; onOk(); };
  }
  async function showReview() {
    const r = await roster();
    const cell = "padding:6px 11px;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;font:500 12.5px 'JetBrains Mono',ui-monospace,monospace";
    const hcell = "padding:6px 11px;border-bottom:1px solid rgba(255,255,255,.12);font:500 10px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#9AA0AA";
    const rows = r.map((e) => {
      const role = e.role === "master" ? `<span style="color:#16E0A3">★ master</span>` : `<span style="color:#4AA3FF">client</span>`;
      return `<tr>
        <td style="${cell}">${role}</td>
        <td style="${cell}">${(e.page || "").replace(/^\//, "")}</td>
        <td style="${cell}">${e.ticker || "?"}</td>
        <td style="${cell}">${e.profile || "?"}</td>
        <td style="${cell}">${e.date || "?"}</td></tr>`;
    }).join("");
    modal(`<div style="font:600 17px 'IBM Plex Sans',system-ui;margin-bottom:4px">Start replay session?</div>
      <div style="color:#9AA0AA;font-size:12px;margin-bottom:14px">Review every tab — loading locks all of these until you Exit.</div>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="text-align:left">
          <th style="${hcell}">role</th><th style="${hcell}">page</th><th style="${hcell}">ticker</th><th style="${hcell}">profile</th><th style="${hcell}">date</th></tr></thead>
        <tbody>${rows}</tbody></table>`, "Confirm &amp; load", loadAll);
  }
  const confirmExit = () => modal(`<div style="font:600 17px 'IBM Plex Sans',system-ui">Exit replay session?</div>
    <div style="color:#9AA0AA;font-size:12px;margin-top:8px">Unlocks every tab and ends the session for everyone.</div>`, "Exit replay", exitSession, "#FF5C5C", "#2a0808");

  // ---- floating bar (shadow DOM, corner-anchored expand) ----
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

  // per-state markup for the expanded part of the bar (.rest). Event handling is
  // delegated, so re-rendering innerHTML on a state change loses no listeners.
  function restHtml(role) {
    if (session.phase === "idle") {
      if (role === "master") {
        const n = session.clients.length;
        return `<span class="tag master">★ master</span><span class="cnt">${n} client${n === 1 ? "" : "s"} joined</span>
          <span class="sep"></span>
          <button class="b act" data-cmd="loadall"${n < 1 ? " disabled" : ""}>Load All</button>
          <button class="b ex" data-cmd="exit">Exit</button>`;
      }
      if (role === "client")
        return `<span class="tag client">● client</span><span class="cnt">joined — waiting for master</span>
          <span class="sep"></span><button class="b" data-cmd="leave">Leave</button>`;
      if (!session.master)
        return `<button class="b act" data-cmd="bemaster">Be master</button><span class="hint">set this tab's ticker &amp; profile first</span>`;
      return `<button class="b act" data-cmd="joinclient">Join as client</button><span class="hint">master ready — join to sync this tab</span>`;
    }
    // active session (loading/running) but this tab never joined → bystander:
    // no transport, no data touched, just a note. It can leave via the popup.
    if (!role)
      return `<span class="tag">replay in progress</span><span class="hint">not joined — this tab stays live</span>`;
    if (session.phase === "loading")
      return `<span class="tag">syncing…</span><span class="cnt">calibrating tabs — please wait</span>
        <span class="sep"></span><button class="b ex" data-cmd="exit">Exit</button>`;
    // running
    if (role === "master")
      return `<button class="b" data-cmd="restart" title="Restart">${IC.restart}</button>
        <button class="b" data-cmd="back30" title="30s back">${IC.back30}</button>
        <button class="b" data-cmd="back1" title="1s back">${IC.back1}</button>
        <button class="b pp" data-cmd="play" title="Play / pause">${IC.play}</button>
        <button class="b" data-cmd="fwd1" title="1s forward">${IC.fwd1}</button>
        <button class="b" data-cmd="fwd30" title="30s forward">${IC.fwd30}</button>
        <span class="sep"></span>
        <button class="b speed" data-cmd="speed" title="Speed">1x</button>
        <span class="sep"></span>
        <input class="scrub" type="range" min="0" max="100" value="0" title="Scrub position">
        <b class="mtime" title="Replay time">—</b>
        <span class="sep"></span>
        <button class="b ex" data-cmd="exit">Exit</button>`;
    return `<span class="foll">following</span><b class="ftime">—</b>
      <button class="b" data-cmd="take">Take control</button>
      <button class="b ex" data-cmd="exit">Exit</button>`;
  }

  let lastKey = "";
  function buildBar() {
    if (document.getElementById("gexsync-replay-bar")) return;
    const host = document.createElement("div");
    host.id = "gexsync-replay-bar";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        /* brand: mint #16E0A3 master, azure #4AA3FF client, red #FF5C5C exit,
           amber #FFB454 no-data. Fonts injected at document level by content.js. */
        .bar { position:fixed; left:16px; bottom:20px; display:flex; align-items:center; padding:6px;
          border-radius:9999px; background:rgba(22,20,31,.8); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
          border:1px solid rgba(255,255,255,.12); box-shadow:0 16px 48px rgba(0,0,0,.5);
          z-index:2147483000; font:500 13px 'IBM Plex Sans',system-ui,-apple-system,sans-serif; color:#E7E9EA; user-select:none; }
        .anchor { flex:0 0 auto; width:38px; height:38px; border-radius:9999px; border:none;
          background:transparent; color:#9AA0AA; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
        .bar[data-role="master"] .anchor { color:#16E0A3; }
        .bar[data-role="client"] .anchor { color:#4AA3FF; }
        .bar[data-cal="1"] .anchor { animation:calpulse 1.1s ease-in-out infinite; }
        @keyframes calpulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        .rest { display:flex; align-items:center; gap:3px; max-width:0; opacity:0; overflow:hidden;
          transition:max-width .42s cubic-bezier(.4,0,.2,1), opacity .25s ease, margin-left .3s ease; }
        .bar[data-open="1"] .rest { max-width:940px; opacity:1; margin-left:4px; }
        .scrub { width:130px; height:4px; -webkit-appearance:none; appearance:none; margin:0 4px;
          background:rgba(255,255,255,.22); border-radius:9999px; cursor:pointer; outline:none; flex:0 0 auto; }
        .scrub::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px; border-radius:50%; background:#16E0A3; cursor:pointer; }
        .scrub::-moz-range-thumb { width:13px; height:13px; border:none; border-radius:50%; background:#16E0A3; cursor:pointer; }
        .b { flex:0 0 auto; height:34px; min-width:34px; padding:0 8px; border-radius:9999px; border:none;
          background:transparent; color:#E7E9EA; cursor:pointer; font:inherit; font-size:13px;
          display:flex; align-items:center; justify-content:center; line-height:1; }
        .b svg { display:block; }
        .b:hover { background:rgba(255,255,255,.12); color:#fff; }
        .b[disabled] { opacity:.4; cursor:default; }
        .b[disabled]:hover { background:transparent; }
        .pp { background:#E7E9EA; color:#0a0a12; }
        .pp:hover { background:#fff; color:#000; }
        .act { background:#16E0A3; color:#08110c; font-weight:700; padding:0 14px; }
        .act:hover { background:#3BF7C0; color:#000; }
        .act[disabled] { background:rgba(255,255,255,.14); color:#9AA0AA; }
        .ex { color:#FF9D9D; font-weight:600; padding:0 12px; }
        .ex:hover { background:rgba(255,92,92,.18); color:#FFBCBC; }
        .speed { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; font-weight:700; min-width:40px; }
        .sep { width:1px; height:20px; background:rgba(255,255,255,.12); margin:0 3px; flex:0 0 auto; }
        .tag { font-weight:700; padding:0 4px 0 8px; white-space:nowrap; }
        .tag.master { color:#16E0A3; } .tag.client { color:#4AA3FF; }
        .cnt, .hint { color:#9AA0AA; font-size:12px; padding:0 8px; white-space:nowrap; }
        .foll { color:#9AA0AA; font-size:12px; white-space:nowrap; padding-left:6px; }
        .mtime, .ftime { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; font-weight:600; min-width:96px; white-space:nowrap; text-align:center; }
        .bar.nodata .foll, .bar.nodata .ftime { color:#FFB454; }
      </style>
      <div class="bar" data-open="0" data-role="none">
        <button class="anchor" title="GexSync replay">${IC.replay}</button>
        <div class="rest"></div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    // calibration overlay: blocks interaction + shows group progress ("2 / 4")
    const overlay = document.createElement("div");
    overlay.id = "gexsync-cal-overlay";
    // z-index sits BELOW the bar (2147483000) so the loading-phase Exit stays clickable if a sync hangs
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147482900;display:none;align-items:center;justify-content:center;background:rgba(12,8,18,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;color:#E7E9EA;";
    overlay.innerHTML = `<div style="padding:24px 32px;border-radius:16px;background:rgba(22,20,31,.92);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center">
      <div style="font:600 15px 'IBM Plex Sans',system-ui">Syncing replay…</div>
      <div class="calprog" style="margin-top:12px;color:#16E0A3;font:700 28px 'JetBrains Mono',ui-monospace,monospace">0 / 0</div>
      <div style="margin-top:8px;color:#9AA0AA;font-size:12px">loading history + building time maps — please wait</div></div>`;
    document.documentElement.appendChild(overlay);

    const bar = root.querySelector(".bar");
    const rest = root.querySelector(".rest");
    barUI = { host, overlay, bar, rest };

    // delegated controls — one handler survives .rest re-renders
    rest.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-cmd]");
      if (!b || b.disabled) return;
      switch (b.dataset.cmd) {
        case "bemaster": claimMaster(); break;
        case "joinclient": joinClient(); break;
        case "leave": leave(); break;
        case "loadall": showReview(); break;
        case "exit": confirmExit(); break;
        case "take": takeControl(); break;
        case "restart": setSlider(0); break;               // input listener broadcasts resulting time
        case "play": transportBtn()?.click(); break;
        case "speed": speedBtn()?.click(); break;
        case "back30": case "back1": case "fwd1": case "fwd30": btnByIcon(stepIcon[b.dataset.cmd])?.click(); break;
      }
    });
    rest.addEventListener("input", (e) => { if (e.target.classList.contains("scrub")) { scrubUntil = performance.now() + 500; setSlider(+e.target.value); } });

    renderBar = () => {
      barUI.host.style.display = active() ? "" : "none";
      const role = myRole();
      bar.dataset.role = role || "none";
      bar.dataset.open = active() ? "1" : "0"; // always expanded while in Replay mode
      const key = `${active() ? 1 : 0}|${session.phase}|${role}|${session.master ? 1 : 0}|${session.clients.length}`;
      if (key === lastKey) return;
      lastKey = key;
      rest.innerHTML = active() ? restHtml(role) : "";
      resetTickCache(); // new layout → repaint dynamic bits next tick
    };
    renderBar();

    // slow tick: phase transition, calibration overlay, blocker, dead-master watchdog
    setInterval(async () => {
      bar.dataset.cal = calibrating ? "1" : "0";
      updateBlocker();
      const chip = document.getElementById("gexsync-mode-chip");
      if (chip) chip.dataset.replayRole = cfg.debug && participating() ? (isMaster() ? "MASTER" : "client") : "";
      if (!active()) { overlay.style.display = "none"; return; }

      const ids = await presentIds();
      if (ids.has(session.master)) masterSeen = Date.now();
      if (session.phase === "idle") {
        // setup: a claimed master that vanished (tab closed / extension reloaded)
        // would leave every tab stuck on "Join as client" with no way to claim.
        // Release it once it's been gone a beat or two so someone can be master.
        if (session.master && Date.now() - masterSeen > 8000)
          writeSession({ master: null, clients: session.clients.filter((c) => ids.has(c)) });
      } else if (!ids.has(session.master) && Date.now() - masterSeen > 10000) {
        exitSession(); return; // dead master mid-session → tear down so it can't wedge
      }

      if (session.phase === "loading") {
        const { n, m } = await groupReady();
        // hold the syncing overlay up for the WHOLE loading phase (not just while n<m)
        overlay.style.display = participating() && !document.hidden ? "flex" : "none";
        overlay.querySelector(".calprog").textContent = `${n} / ${m}`;
        // all maps built → run, and always jump everyone to the start (master seeks; clients follow)
        if (isMaster() && m > 0 && n >= m) { writeSession({ phase: "running" }); if (!document.hidden) setTimeout(() => setSlider(0), 150); }
      } else overlay.style.display = "none";
    }, 500);

    // fast tick: live play icon / speed / times / scrub position. Only touch the
    // DOM when a value actually CHANGES — rewriting a button's innerHTML every tick
    // drops any click whose mousedown/up straddles the swap (the "2-3 clicks" bug).
    let lastPlay = null, lastSpeed = null, lastM = null, lastF = null, lastND = null;
    resetTickCache = () => { lastPlay = lastSpeed = lastM = lastF = lastND = null; };
    setInterval(() => {
      if (!barUI || !active()) return;
      if (isMaster()) {
        const pp = rest.querySelector(".pp"), p = isPlaying();
        if (pp && p !== lastPlay) { lastPlay = p; pp.innerHTML = p ? IC.pause : IC.play; }
        const sp = rest.querySelector(".speed"), sl = speedLabel();
        if (sp && sl && sl !== lastSpeed) { lastSpeed = sl; sp.textContent = sl; }
        const mt = rest.querySelector(".mtime"), mv = fmtTod(localTod());
        if (mt && mv !== lastM) { lastM = mv; mt.textContent = mv; }
        const sc = rest.querySelector(".scrub"), el = slider();
        if (sc && el) { if (sc.max !== el.max) sc.max = el.max; if (performance.now() > scrubUntil) sc.value = el.value; }
      } else {
        if (clientNoData !== lastND) { lastND = clientNoData; bar.classList.toggle("nodata", clientNoData); }
        const ft = rest.querySelector(".ftime"), fv = fmtTod(clientNoData ? lastMasterTod : localTod());
        if (ft && fv !== lastF) { lastF = fv; ft.textContent = fv; }
      }
    }, 120);
  }
  if (document.body) buildBar(); else window.addEventListener("DOMContentLoaded", buildBar);
})();
