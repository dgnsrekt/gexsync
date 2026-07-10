// GexSync/replay: sync the replay *transport* (scrub / play-pause / speed /
// step) across GEXbot tabs. Data is NOT synced — each tab keeps its own
// ticker + date + loaded history, so you can compare (e.g. SPX two different
// Mondays) and scrub them together. Bus = chrome.storage.local, page-scoped.
//
// Only active when "armed" from the popup. Alignment mode (popup):
//   index    — mirror the raw slider index (same-day / different-ticker: exact)
//   fraction — mirror position ÷ length (different-day: proportional)
//
// Event-driven: a manual scrub fires the slider's `input` event (auto-advance
// during play does not), so seeks broadcast without streaming playback.
(function () {
  const KEY = "replay" + location.pathname; // per page: /state vs /classic
  const CFG_KEY = "replay-cfg";             // shared: { armed, mode }
  const SEEK_TOL = 3;    // ignore index deltas within this (jitter guard)
  const THROTTLE = 150;  // ms between seek broadcasts (drag fires many)
  let applyingRemote = false;
  let lastSeekSent = 0;
  let cfg = { armed: false, mode: "fraction" };
  chrome.storage.local.get(CFG_KEY, (r) => { if (r[CFG_KEY]) cfg = { ...cfg, ...r[CFG_KEY] }; });

  const send = (obj) => { if (cfg.armed && chrome.runtime?.id) chrome.storage.local.set({ [KEY]: { ...obj, t: performance.now() } }); };

  // ---- element lookups (all replay controls are unique on the page) ----
  const slider = () => document.querySelector('input[type=range]');
  const iconOf = (b) => b?.querySelector("svg[data-testid]")?.getAttribute("data-testid");
  const transportBtn = () =>
    [...document.querySelectorAll("button")].find((b) => /^(PlayArrowIcon|PauseIcon)$/.test(iconOf(b) || ""));
  const speedBtn = () =>
    [...document.querySelectorAll("button")].find((b) => /^\d+x$/.test(b.textContent.trim()));

  const isPlaying = () => iconOf(transportBtn()) === "PauseIcon";
  const speedLabel = () => speedBtn()?.textContent.trim() || null;

  function setSlider(value) {
    const el = slider();
    if (!el) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const guarded = (fn) => { applyingRemote = true; try { fn(); } finally { setTimeout(() => { applyingRemote = false; }, 400); } };

  // Broadcast the slider position as both raw index and fraction; receiver
  // picks per the shared alignment mode.
  function sendSeek() {
    const el = slider();
    if (!el) return;
    const max = +el.max || 1;
    send({ action: "seek", value: +el.value, frac: +el.value / max });
  }

  function apply(msg) {
    switch (msg.action) {
      case "seek": {
        const el = slider();
        if (!el) return;
        const target = cfg.mode === "index" ? msg.value : Math.round(msg.frac * (+el.max || 1));
        if (Math.abs(+el.value - target) > SEEK_TOL) guarded(() => setSlider(target));
        break;
      }
      case "play":
        if (isPlaying() !== msg.playing) guarded(() => transportBtn()?.click());
        break;
      case "speed":
        guarded(() => { for (let i = 0; i < 4 && speedLabel() !== msg.speed; i++) speedBtn()?.click(); });
        break;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CFG_KEY]?.newValue) cfg = { ...cfg, ...changes[CFG_KEY].newValue };
    if (!cfg.armed || applyingRemote || !changes[KEY]?.newValue) return;
    apply(changes[KEY].newValue);
  });

  // ---- broadcast local changes ----
  // Manual scrub: input fires on drag (auto-advance does not). Throttled.
  document.addEventListener("input", (e) => {
    if (applyingRemote || e.target !== slider()) return;
    const now = performance.now();
    if (now - lastSeekSent < THROTTLE) return;
    lastSeekSent = now;
    sendSeek();
  }, true);

  // Transport / speed / step via clicks. Let state settle, then broadcast.
  document.addEventListener("click", (e) => {
    if (applyingRemote) return;
    const btn = e.target.closest?.("button");
    if (!btn) return;
    const icon = iconOf(btn) || "";
    const txt = btn.textContent.trim().toLowerCase();
    if (/^(PlayArrowIcon|PauseIcon)$/.test(icon))
      setTimeout(() => { const p = isPlaying(); send({ action: "play", playing: p }); if (!p) sendSeek(); }, 60);
    else if (/^(ArrowLeftIcon|ArrowRightIcon|FastRewindIcon|FastForwardIcon)$/.test(icon))
      setTimeout(sendSeek, 60);
    else if (/^\d+x$/.test(txt))
      setTimeout(() => send({ action: "speed", speed: speedLabel() }), 60);
  }, true);
})();
