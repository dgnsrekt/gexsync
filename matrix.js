// GexSync easter egg: "matrix rain" behind the UI on GEXbot charts. MAIN world.
// A full-viewport, pointer-events:none canvas of falling glyphs, tinted to the pane's
// ticker-group color, with the pane's ticker/profile + GEXbot lexicon sprinkled in as
// highlighted "word drops". content.js (isolated) toggles it via the #__gxmatrix node
// { on, ticker, profile, color } — same node bridge as lines.js/pdlines.js. Off by
// default; nothing runs until it's on. Unlocked from the popup (tap the version 7x).
(function () {
  if (window.__gexsyncMatrix) return;
  window.__gexsyncMatrix = true;

  const CFG_ID = "__gxmatrix";
  const readCfg = () => { const n = document.getElementById(CFG_ID); if (!n || !n.textContent) return null; try { return JSON.parse(n.textContent); } catch (e) { return null; } };

  // GEXbot lexicon (repo-grounded) + a little canonical GEX-world flavor. Short = falls clean.
  const TERMS = ("GEX gamma delta vanna charm greeks 0DTE DTE 90d latest next AGG strike options " +
    "profile spot futures PDO PDH PDL PDC OHLC open high low close volume ES NQ RTY YM GC CL sync " +
    "replay master client ticker watchlist pill zoom snapshot buzz mentions rank intraday " +
    "zero-gamma gamma-flip dealer call-wall put-wall squeeze").split(" ");
  const GLYPHS = [];
  for (let c = 0x30A0; c <= 0x30FF; c++) GLYPHS.push(String.fromCharCode(c)); // katakana
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$".split("").forEach((c) => GLYPHS.push(c));
  const rnd = (a) => a[(Math.random() * a.length) | 0];
  const hexRGB = (hex) => { const h = String(hex || "#16E0A3").replace("#", ""); return [parseInt(h.slice(0, 2), 16) || 22, parseInt(h.slice(2, 4), 16) || 224, parseInt(h.slice(4, 6), 16) || 163]; };

  const CELL = 18; // px per glyph cell
  let canvas = null, ctx, W = 0, H = 0, cols = 0, drops = null;
  const words = []; // active word-drops: { col, row, text }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${CELL}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textBaseline = "top";
    const n = Math.max(1, Math.ceil(W / CELL));
    if (!drops || drops.length !== n) drops = Array.from({ length: n }, () => Math.floor(Math.random() * -50));
    cols = n;
  }
  function ensure() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "gexsync-matrix";
    canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147481400;display:none;";
    (document.body || document.documentElement).appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function frame() {
    const cfg = readCfg();
    if (!cfg || !cfg.on) { stop(); return; }
    const [r, g, b] = hexRGB(cfg.color);
    // Fade the previous frame toward TRANSPARENT (destination-out erases alpha), so the
    // trails fade and the chart underneath stays visible — never darkened.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    // glyph rain, group-tinted
    ctx.fillStyle = `rgba(${r},${g},${b},0.62)`;
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * CELL;
      if (y > -CELL && y < H) ctx.fillText(rnd(GLYPHS), i * CELL, y);
      drops[i]++;
      if (y > H && Math.random() > 0.975) drops[i] = Math.floor(Math.random() * -20);
    }
    // word drops — highlighted so context pops out of the noise
    if (words.length < 6 && Math.random() < 0.035) {
      const pool = TERMS.concat([cfg.ticker, cfg.profile].filter(Boolean));
      words.push({ col: (Math.random() * cols) | 0, row: -3, text: String(rnd(pool) || "GEX").toUpperCase() });
    }
    const br = [Math.min(r + 130, 255), Math.min(g + 130, 255), Math.min(b + 130, 255)];
    for (let w = words.length - 1; w >= 0; w--) {
      const wd = words[w], x = wd.col * CELL;
      for (let k = 0; k < wd.text.length; k++) {
        const yy = (wd.row + k) * CELL;
        if (yy <= -CELL || yy >= H) continue;
        ctx.fillStyle = k === wd.text.length - 1 ? "rgba(255,255,255,0.95)" : `rgba(${br[0]},${br[1]},${br[2]},0.85)`;
        ctx.fillText(wd.text[k], x, yy);
      }
      wd.row++;
      if (wd.row * CELL > H) words.splice(w, 1);
    }
    rafId = requestAnimationFrame(frame);
  }

  let running = false, rafId = 0;
  function start() { if (running) return; ensure(); canvas.style.display = "block"; running = true; rafId = requestAnimationFrame(frame); }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    words.length = 0;
    if (canvas) { try { ctx.clearRect(0, 0, W, H); } catch (e) {} canvas.style.display = "none"; }
  }
  // cheap on/off watcher — the render loop itself also re-reads the node every frame
  setInterval(() => { const cfg = readCfg(); if (cfg && cfg.on) start(); else stop(); }, 300);
})();
