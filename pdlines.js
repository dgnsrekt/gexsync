// GexSync: draw previous-day OHLC levels as horizontal lines on GEXbot's chart.
// MAIN world — needs the live Chart.js instance to map price -> pixel. content.js
// (isolated) writes the levels + which are enabled to #__gxpd; we render an overlay
// pinned to the chart canvas and track zoom/pan/refresh off the live y-scale. Opt-in:
// nothing draws until a toggle is on AND prev-day data exists. Lines whose price is
// scrolled out of the visible range hide themselves.
(function () {
  if (window.__gexsyncPD) return;
  window.__gexsyncPD = true;

  // Locate the Chart.js instance by SHAPE (same approach as zoom.js/shot.js).
  const isChart = (v) => v && typeof v === "object" && v.scales && v.scales.y && typeof v.zoomScale === "function" && typeof v.update === "function";
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) return el[k]; return null; };
  const hooks = (f) => { const o = []; let h = f && f.memoizedState, i = 0; while (h && typeof h === "object" && i < 400 && ("next" in h || "memoizedState" in h)) { o.push(h.memoizedState); h = h.next; i++; } return o; };
  function findChart() {
    const cv = document.querySelector("canvas"); let top = cv && fiberOf(cv); if (!top) return null; while (top.return) top = top.return;
    const stack = [top], seen = new Set(); let v = 0;
    while (stack.length && v++ < 40000) {
      const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n);
      for (const h of (typeof n.type === "function" ? hooks(n) : [])) { let c = h; if (c && typeof c === "object" && "current" in c) c = c.current; if (isChart(c)) return c; if (isChart(h)) return h; }
      const p = n.memoizedProps; if (p && typeof p === "object") for (const k in p) { let x; try { x = p[k]; } catch (e) { continue; } if (isChart(x)) return x; }
      if (n.child) stack.push(n.child); if (n.sibling) stack.push(n.sibling);
    }
    return null;
  }

  // The fiber walk is expensive, so cache the instance and only re-find when it's
  // been replaced (GEXbot recreates the chart on its ~5-min refresh) — its canvas
  // detaches, so a connectivity check tells us to re-resolve.
  let chartCache = null;
  const chartValid = (c) => c && c.scales && c.scales.y && typeof c.scales.y.getPixelForValue === "function" && c.canvas && c.canvas.isConnected;
  function getChart() {
    if (chartValid(chartCache)) return chartCache;
    chartCache = findChart();
    return chartCache;
  }

  const CFG_ID = "__gxpd";
  const KEYS = ["o", "h", "l", "c"];
  const LABEL = { o: "PDO", h: "PDH", l: "PDL", c: "PDC" };

  let overlay = null;
  const els = {}; // key -> { line, label }
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "gexsync-pd";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147481500;overflow:hidden;display:none;";
    (document.body || document.documentElement).appendChild(overlay);
    for (const k of KEYS) {
      const line = document.createElement("div");
      line.style.cssText = "position:absolute;height:0;border-top:1px solid rgba(255,255,255,.9);display:none;";
      const label = document.createElement("div");
      label.style.cssText = "position:absolute;transform:translateY(-50%);font:600 10px 'JetBrains Mono',ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:0 4px;border-radius:3px;white-space:nowrap;display:none;";
      overlay.append(line, label);
      els[k] = { line, label };
    }
  }

  function readCfg() {
    const n = document.getElementById(CFG_ID);
    if (!n || !n.textContent) return null;
    try { return JSON.parse(n.textContent); } catch (e) { return null; }
  }

  let lastSig = "";
  function render() {
    const cfg = readCfg();
    const anyOn = cfg && cfg.show && cfg.lvl && KEYS.some((k) => cfg.show[k] && cfg.lvl[k] != null);
    if (!anyOn) { if (overlay) overlay.style.display = "none"; lastSig = ""; return; }
    const chart = getChart();
    if (!chart) { if (overlay) overlay.style.display = "none"; return; }
    ensureOverlay();
    const rect = chart.canvas.getBoundingClientRect(), y = chart.scales.y, area = chart.chartArea;
    const pos = cfg.pos === "center" || cfg.pos === "right" ? cfg.pos : "left";
    const sig = JSON.stringify([rect.left, rect.top, rect.width, rect.height, y.min, y.max, area.left, area.right, area.top, area.bottom, cfg.show, cfg.lvl, pos]);
    if (sig === lastSig) return; // nothing moved — skip DOM writes
    lastSig = sig;
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147481500;overflow:hidden;display:block;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    // label anchor within the plot: left edge / centered / right edge
    const anchor = pos === "center" ? { left: (area.left + area.right) / 2, tf: "translate(-50%,-50%)" }
      : pos === "right" ? { left: area.right - 3, tf: "translate(-100%,-50%)" }
      : { left: area.left + 3, tf: "translateY(-50%)" };
    for (const k of KEYS) {
      const { line, label } = els[k];
      const on = cfg.show[k] && cfg.lvl[k] != null;
      const py = on ? y.getPixelForValue(cfg.lvl[k]) : null;
      if (!on || py < area.top || py > area.bottom) { line.style.display = "none"; label.style.display = "none"; continue; }
      line.style.left = area.left + "px"; line.style.width = (area.right - area.left) + "px"; line.style.top = py + "px"; line.style.display = "block";
      label.style.left = anchor.left + "px"; label.style.transform = anchor.tf; label.style.top = py + "px"; label.textContent = `${LABEL[k]} ${(+cfg.lvl[k]).toFixed(2)}`; label.style.display = "block";
    }
  }

  function loop() { try { render(); } catch (e) {} requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
