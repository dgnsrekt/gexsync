// GexSync: user-drawn horizontal lines on GEXbot's chart (per-ticker). MAIN world —
// needs the live Chart.js instance to map price <-> pixel. content.js (isolated)
// owns the store; it writes the current ticker's lines + line-mode flag to #__gxlines,
// we render an overlay pinned to the canvas (tracking zoom/pan/refresh, like pdlines.js)
// and, while line mode is on, turn chart clicks into place/remove events back to
// content.js. Nothing is drawn until a ticker has stored lines or line mode is on.
(function () {
  if (window.__gexsyncLines) return;
  window.__gexsyncLines = true;

  // Locate the Chart.js instance by SHAPE — same walk as pdlines.js/zoom.js.
  // ponytail: this finder is duplicated across the MAIN-world scripts; stable enough
  // to copy rather than factor into a shared file each IIFE would have to import.
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
  let chartCache = null;
  const chartValid = (c) => c && c.scales && c.scales.y && typeof c.scales.y.getPixelForValue === "function" && c.canvas && c.canvas.isConnected;
  const getChart = () => (chartValid(chartCache) ? chartCache : (chartCache = findChart()));

  const CFG_ID = "__gxlines";
  const HIT = 6; // px: click within this of a line's price deletes it (hover shows ✕)
  const readCfg = () => { const n = document.getElementById(CFG_ID); if (!n || !n.textContent) return null; try { return JSON.parse(n.textContent); } catch (e) { return null; } };

  let overlay = null, guide = null, guideLbl = null, xbadge = null;
  const els = new Map(); // id -> { line, label }
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "gexsync-lines";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147481600;overflow:hidden;display:none;";
    // cursor preview (line mode): a faint line + price tag that tracks the pointer
    guide = document.createElement("div");
    guide.style.cssText = "position:absolute;height:0;border-top:1px dashed rgba(22,224,163,.55);width:100%;left:0;display:none;";
    guideLbl = document.createElement("div");
    guideLbl.style.cssText = "position:absolute;transform:translateY(-50%);right:3px;font:600 10px 'JetBrains Mono',ui-monospace,monospace;color:#16E0A3;background:rgba(0,0,0,.6);padding:0 4px;border-radius:3px;white-space:nowrap;display:none;";
    xbadge = document.createElement("div");
    xbadge.style.cssText = "position:absolute;transform:translate(-50%,-50%);left:3px;width:15px;height:15px;border-radius:50%;background:#FF5C5C;color:#0a0a12;font:700 11px system-ui;line-height:15px;text-align:center;display:none;";
    xbadge.textContent = "×";
    overlay.append(guide, guideLbl, xbadge);
    (document.body || document.documentElement).appendChild(overlay);
  }

  const priceOf = (ln) => ln && ln.points && ln.points[0] ? ln.points[0].price : null;
  let lastSig = "";
  function render() {
    const cfg = readCfg();
    const list = (cfg && Array.isArray(cfg.lines)) ? cfg.lines : [];
    const mode = !!(cfg && cfg.mode);
    if (!list.length && !mode) { if (overlay) overlay.style.display = "none"; for (const { line, label } of els.values()) { line.remove(); label.remove(); } els.clear(); lastSig = ""; return; }
    const chart = getChart();
    if (!chart) { if (overlay) overlay.style.display = "none"; return; }
    ensureOverlay();
    const rect = chart.canvas.getBoundingClientRect(), y = chart.scales.y, area = chart.chartArea;
    // crosshair on the canvas only while line mode is on
    chart.canvas.style.cursor = mode ? "crosshair" : "";
    const sig = JSON.stringify([rect.left, rect.top, rect.width, rect.height, y.min, y.max, area.left, area.right, area.top, area.bottom, mode, list.map((l) => [l.id, priceOf(l), l.overrides && l.overrides.linecolor, l.text])]);
    if (sig === lastSig) return;
    lastSig = sig;
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147481600;overflow:hidden;display:block;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    const live = new Set();
    for (const ln of list) {
      const price = priceOf(ln);
      if (price == null) continue;
      live.add(ln.id);
      let e = els.get(ln.id);
      if (!e) {
        const line = document.createElement("div");
        const label = document.createElement("div");
        label.style.cssText = "position:absolute;transform:translateY(-50%);right:3px;font:600 10px 'JetBrains Mono',ui-monospace,monospace;padding:0 4px;border-radius:3px;background:rgba(0,0,0,.55);white-space:nowrap;";
        overlay.append(line, label);
        e = { line, label }; els.set(ln.id, e);
      }
      const ov = ln.overrides || {};
      const color = ov.linecolor || "#16E0A3", w = ov.linewidth || 1, dash = (ov.linestyle || "dashed") === "solid" ? "" : "border-top-style:dashed;";
      const py = y.getPixelForValue(price);
      if (py < area.top || py > area.bottom) { e.line.style.display = "none"; e.label.style.display = "none"; continue; }
      e.line.style.cssText = `position:absolute;height:0;left:${area.left}px;width:${area.right - area.left}px;top:${py}px;border-top:${w}px solid ${color};${dash}display:block;`;
      e.label.style.top = py + "px"; e.label.style.color = color; e.label.textContent = ln.text || (+price).toFixed(2); e.label.style.display = "block";
    }
    for (const [id, e] of els) if (!live.has(id)) { e.line.remove(); e.label.remove(); els.delete(id); }
  }
  function loop() { try { render(); } catch (e) {} requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // ---- line mode interaction (document-level capture, survives canvas swaps) ----
  const modeOn = () => { const c = readCfg(); return !!(c && c.mode); };
  const onChartCanvas = (e) => { const c = getChart(); return c && e.target === c.canvas; };
  // nearest stored line to a canvas-y pixel, within HIT px → its id, else null
  function hitLine(py) {
    const c = getChart(), cfg = readCfg(); if (!c || !cfg) return null;
    let best = null, bestD = HIT;
    for (const ln of cfg.lines || []) { const p = priceOf(ln); if (p == null) continue; const d = Math.abs(c.scales.y.getPixelForValue(p) - py); if (d <= bestD) { bestD = d; best = ln.id; } }
    return best;
  }
  let hoverId = null;
  document.addEventListener("mousemove", (e) => {
    if (!modeOn() || !onChartCanvas(e) || !overlay) return;
    const c = getChart(), rect = c.canvas.getBoundingClientRect(), py = e.clientY - rect.top, area = c.chartArea;
    if (py < area.top || py > area.bottom) { guide.style.display = guideLbl.style.display = xbadge.style.display = "none"; hoverId = null; return; }
    hoverId = hitLine(py);
    if (hoverId != null) { // over a line → offer delete
      guide.style.display = guideLbl.style.display = "none";
      xbadge.style.top = py + "px"; xbadge.style.display = "block"; c.canvas.style.cursor = "pointer";
    } else { // empty → preview a new line at the cursor price
      xbadge.style.display = "none"; c.canvas.style.cursor = "crosshair";
      guide.style.top = py + "px"; guide.style.display = "block";
      guideLbl.style.top = py + "px"; guideLbl.textContent = (+c.scales.y.getValueForPixel(py)).toFixed(2); guideLbl.style.display = "block";
    }
  }, true);
  // block GEXbot's pan from starting while we're drawing
  document.addEventListener("mousedown", (e) => { if (modeOn() && onChartCanvas(e)) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener("click", (e) => {
    if (!modeOn() || !onChartCanvas(e)) return;
    e.stopPropagation(); e.preventDefault();
    const c = getChart(), rect = c.canvas.getBoundingClientRect(), py = e.clientY - rect.top, area = c.chartArea;
    if (py < area.top || py > area.bottom) return;
    const id = hitLine(py);
    if (id != null) window.dispatchEvent(new CustomEvent("gexsync-line-remove", { detail: { id } }));
    else window.dispatchEvent(new CustomEvent("gexsync-line-place", { detail: { price: +c.scales.y.getValueForPixel(py) } }));
  }, true);
})();
