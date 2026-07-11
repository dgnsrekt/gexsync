// GexSync/replay: sync the replay *transport* (scrub / play-pause / speed /
// step) across GEXbot tabs. Data is NOT synced — each tab keeps its own
// ticker + date + loaded history, so you can compare (e.g. SPX two different
// Mondays) and scrub them together. Bus = chrome.storage.local, page-scoped.
//
// Alignment is by WALL-CLOCK TIME-OF-DAY (correct for both same-day/different-
// ticker and different-day compares). The master broadcasts its readable time;
// the follower coarse-seeks by fraction (instant), then, if still off, runs a
// secant search on its own time readout to converge on the master's time.
// Inspired by cerberus_gamma: align by timestamp, not by index.
//
// A floating corner transport bar (shadow DOM, xpeaker-style expand) is the
// command center: arm toggle + live synced-tab count, restart-to-start,
// play/pause, ±1s/±30s steps, and speed — each command drives ALL armed tabs.
// Sync is only active when armed (via the bar or the popup). Event-driven: a
// manual scrub fires the slider's `input` event (auto-advance during play does
// not), so seeks broadcast without streaming playback.
(function () {
  const KEY = "replay" + location.pathname; // per page: /state vs /classic
  const CFG_KEY = "replay-cfg";             // shared: { armed }
  const TOL_SEC = 2;      // wall-clock tolerance for "aligned"
  const THROTTLE = 150;   // ms between seek broadcasts (drag fires many)
  const SETTLE = 120;     // ms to wait for the time readout to update after a set
  const MUTE_MS = 400;    // suppress self-broadcast this long after a programmatic move
  let muteUntil = 0;
  let lastSeekSent = 0;
  let seekSeq = 0;
  let cfg = { armed: false };
  const ME = Math.random().toString(36).slice(2); // per-tab id for echo filtering
  chrome.storage.local.get(CFG_KEY, (r) => { if (r[CFG_KEY]) cfg = { ...cfg, ...r[CFG_KEY] }; });

  const muted = () => performance.now() < muteUntil;
  const mute = () => { muteUntil = performance.now() + MUTE_MS; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  const send = (obj) => { if (cfg.armed && !muted() && chrome.runtime?.id) chrome.storage.local.set({ [KEY]: { ...obj, from: ME, t: performance.now() } }); };

  // ---- element lookups ----
  const slider = () => document.querySelector('input[type=range]');
  const iconOf = (b) => b?.querySelector("svg[data-testid]")?.getAttribute("data-testid");
  const transportBtn = () =>
    [...document.querySelectorAll("button")].find((b) => /^(PlayArrowIcon|PauseIcon)$/.test(iconOf(b) || ""));
  const speedBtn = () =>
    [...document.querySelectorAll("button")].find((b) => /^\d+x$/.test(b.textContent.trim()));
  const isPlaying = () => iconOf(transportBtn()) === "PauseIcon";
  const speedLabel = () => speedBtn()?.textContent.trim() || null;
  const SPEEDS = ["1x", "5x", "25x"];
  const stepIcon = { back1: "ArrowLeftIcon", back30: "FastRewindIcon", fwd1: "ArrowRightIcon", fwd30: "FastForwardIcon" };
  const btnByIcon = (id) => [...document.querySelectorAll("button")].find((b) => iconOf(b) === id);
  let barUI = null; // {bar, arm, count} — set by buildBar, refreshed on cfg change

  // The replay time readout is the time-of-day text closest to the slider
  // (the "update time" field also shows a time, but sits further up the tree).
  function replayTimeEl() {
    const s = slider();
    if (!s) return null;
    const anc = new Set();
    for (let x = s; x; x = x.parentElement) anc.add(x);
    const distToSlider = (t) => { let n = 0; for (let y = t; y; y = y.parentElement, n++) if (anc.has(y)) return n; return 1e9; };
    let best = null, bd = 1e9;
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length === 0 && /^\d{1,2}:\d{2}:\d{2}\s*[AP]M$/i.test(el.textContent.trim())) {
        const d = distToSlider(el);
        if (d < bd) { bd = d; best = el; }
      }
    }
    return best;
  }
  function parseTod(txt) {
    const m = txt?.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP])/i);
    if (!m) return null;
    let h = +m[1] % 12; if (/p/i.test(m[4])) h += 12;
    return h * 3600 + +m[2] * 60 + +m[3];
  }
  const readTod = () => parseTod(replayTimeEl()?.textContent.trim());

  function setSlider(value) {
    const el = slider();
    if (!el) return;
    mute();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---- apply a remote message ----
  async function applySeek(msg) {
    const el = slider();
    if (!el) return;
    const my = ++seekSeq;
    const max = +el.max || 1;
    // coarse seek by fraction — instant visual, and the fallback if we can't read the clock
    if (msg.frac != null) setSlider(Math.round(msg.frac * max));
    if (msg.tod == null) return;

    await wait(SETTLE);
    if (my !== seekSeq) return;                 // superseded by a newer seek
    let t = readTod();
    if (t == null || Math.abs(t - msg.tod) <= TOL_SEC) return;

    // secant search on the time readout: monotonic time vs index
    let i0 = +el.value, t0 = t;
    let i1 = clamp(i0 + (msg.tod > t0 ? 200 : -200), max);
    setSlider(i1); await wait(SETTLE); if (my !== seekSeq) return;
    let t1 = readTod();
    for (let k = 0; k < 6 && t1 != null && Math.abs(t1 - msg.tod) > TOL_SEC; k++) {
      const slope = (t1 - t0) / (i1 - i0);      // seconds per index
      if (!isFinite(slope) || slope === 0) break;
      const i2 = clamp(Math.round(i1 + (msg.tod - t1) / slope), max);
      if (i2 === i1) break;
      i0 = i1; t0 = t1; i1 = i2;
      setSlider(i1); await wait(SETTLE); if (my !== seekSeq) return;
      t1 = readTod();
    }
  }

  function apply(msg) {
    switch (msg.action) {
      case "seek": applySeek(msg); break;
      case "play": if (isPlaying() !== msg.playing) { mute(); transportBtn()?.click(); } break;
      case "speed": mute(); for (let i = 0; i < 4 && speedLabel() !== msg.speed; i++) speedBtn()?.click(); break;
      case "restart": setSlider(0); break;
      case "step": mute(); btnByIcon(stepIcon[msg.dir])?.click(); break;
    }
  }

  // Bar commands drive ALL armed tabs (broadcast) AND this tab (apply locally).
  const barCmd = (msg) => { send(msg); apply(msg); };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) {
      cfg = { ...cfg, ...changes[CFG_KEY].newValue };
      if (barUI) { barUI.arm.checked = cfg.armed; barUI.bar.dataset.armed = cfg.armed ? "1" : "0"; }
    }
    const msg = changes[KEY]?.newValue;
    if (cfg.armed && msg && msg.from !== ME) apply(msg);
  });

  // ---- broadcast local changes ----
  // The time readout updates ~120ms after a slider change, so the tod is stale
  // if read immediately. Broadcast fraction now (coarse), tod on the trailing
  // (settled) send. withTod=false → coarse only; true → include the fresh time.
  function bcastSeek(withTod) {
    const el = slider();
    if (!el) return;
    const m = { action: "seek", frac: +el.value / (+el.max || 1) };
    if (withTod) { const td = readTod(); if (td != null) m.tod = td; }
    send(m);
  }

  let settleTimer = null;
  const scheduleSettle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(() => bcastSeek(true), 180); };

  // Manual scrub: input fires on drag (auto-advance does not). Throttled coarse
  // send + one trailing send with the settled time.
  document.addEventListener("input", (e) => {
    if (muted() || e.target !== slider()) return;
    const now = performance.now();
    if (now - lastSeekSent >= THROTTLE) { lastSeekSent = now; bcastSeek(false); }
    scheduleSettle();
  }, true);

  // Transport / speed / step via clicks. Let state settle, then broadcast.
  document.addEventListener("click", (e) => {
    if (muted()) return;
    const btn = e.target.closest?.("button");
    if (!btn) return;
    const icon = iconOf(btn) || "";
    const txt = btn.textContent.trim().toLowerCase();
    if (/^(PlayArrowIcon|PauseIcon)$/.test(icon))
      setTimeout(() => { const p = isPlaying(); send({ action: "play", playing: p }); if (!p) bcastSeek(true); }, 150);
    else if (/^(ArrowLeftIcon|ArrowRightIcon|FastRewindIcon|FastForwardIcon)$/.test(icon))
      setTimeout(() => bcastSeek(true), 150);
    else if (/^\d+x$/.test(txt))
      setTimeout(() => send({ action: "speed", speed: speedLabel() }), 60);
  }, true);

  // ---- presence: each tab heartbeats so the bar can show a live synced count ----
  const PP = "rp:";
  const beat = () => { if (chrome.runtime?.id) chrome.storage.local.set({ [PP + ME]: { t: Date.now() } }); };
  beat(); setInterval(beat, 3000);
  window.addEventListener("beforeunload", () => { if (chrome.runtime?.id) chrome.storage.local.remove(PP + ME); });
  async function tabCount() {
    if (!chrome.runtime?.id) return "·";
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    return Object.entries(all).filter(([k, v]) => k.startsWith(PP) && v && now - v.t < 8000).length;
  }

  // ---- floating transport bar (shadow DOM, corner-anchored expand) ----
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
          background:transparent; color:#9aa0aa; cursor:pointer; font-size:17px; display:grid; place-items:center; }
        .bar[data-armed="1"] .anchor { color:#00d68f; }
        .rest { display:flex; align-items:center; gap:3px; max-width:0; opacity:0; overflow:hidden;
          transition:max-width .42s cubic-bezier(.4,0,.2,1), opacity .25s ease, margin-left .3s ease; }
        .bar:hover .rest, .bar[data-open="1"] .rest { max-width:640px; opacity:1; margin-left:4px; }
        .b { flex:0 0 auto; height:34px; min-width:34px; padding:0 7px; border-radius:9999px; border:none;
          background:transparent; color:#e7e9ea; cursor:pointer; font-size:15px; display:grid; place-items:center; }
        .b:hover { background:rgba(255,255,255,.12); color:#fff; }
        .pp { background:rgba(255,255,255,.95); color:#0a0a12; }
        .pp:hover { background:#fff; color:#000; }
        .speed { font-size:12px; font-weight:600; min-width:40px; }
        .sep { width:1px; height:20px; background:rgba(255,255,255,.14); margin:0 3px; flex:0 0 auto; }
        .arm { display:flex; align-items:center; gap:5px; padding:0 8px 0 4px; font-size:12px; cursor:pointer; white-space:nowrap; }
        .arm input { accent-color:#00d68f; cursor:pointer; margin:0; }
        .count { color:#9aa0aa; font-weight:700; min-width:12px; text-align:center; }
      </style>
      <div class="bar" data-open="0" data-armed="${cfg.armed ? 1 : 0}">
        <button class="anchor" title="GexSync replay">&#9199;</button>
        <div class="rest">
          <label class="arm"><input type="checkbox" ${cfg.armed ? "checked" : ""}>sync<b class="count">·</b></label>
          <span class="sep"></span>
          <button class="b" data-cmd="restart" title="Restart from start">&#9198;</button>
          <button class="b" data-cmd="back30" title="30s back">&laquo;</button>
          <button class="b" data-cmd="back1" title="1s back">&lsaquo;</button>
          <button class="b pp" data-cmd="play" title="Play / pause">&#9654;</button>
          <button class="b" data-cmd="fwd1" title="1s forward">&rsaquo;</button>
          <button class="b" data-cmd="fwd30" title="30s forward">&raquo;</button>
          <span class="sep"></span>
          <button class="b speed" data-cmd="speed" title="Speed">1x</button>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);
    const bar = root.querySelector(".bar");
    const arm = root.querySelector(".arm input");
    const pp = root.querySelector(".pp");
    const speedEl = root.querySelector(".speed");
    const count = root.querySelector(".count");
    barUI = { bar, arm, count };

    root.querySelector(".anchor").addEventListener("click", () => { bar.dataset.open = bar.dataset.open === "1" ? "0" : "1"; });
    arm.addEventListener("change", () => chrome.storage.local.set({ [CFG_KEY]: { armed: arm.checked } }));
    root.querySelectorAll(".b").forEach((b) => b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      if (cmd === "restart") barCmd({ action: "restart" });
      else if (cmd === "play") barCmd({ action: "play", playing: !isPlaying() });
      else if (cmd === "speed") barCmd({ action: "speed", speed: SPEEDS[(SPEEDS.indexOf(speedLabel()) + 1) % SPEEDS.length] || "1x" });
      else barCmd({ action: "step", dir: cmd });
    }));

    // reflect live native state onto the bar
    setInterval(() => { pp.textContent = isPlaying() ? "⏸" : "▶"; const sl = speedLabel(); if (sl) speedEl.textContent = sl; }, 500);
    setInterval(async () => { count.textContent = await tabCount(); }, 2000);
  }
  if (document.body) buildBar(); else window.addEventListener("DOMContentLoaded", buildBar);
})();
