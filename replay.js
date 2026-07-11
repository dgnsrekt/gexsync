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
// Only active when "armed" from the popup. Event-driven: a manual scrub fires
// the slider's `input` event (auto-advance during play does not), so seeks
// broadcast without streaming playback.
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
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) cfg = { ...cfg, ...changes[CFG_KEY].newValue };
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
})();
