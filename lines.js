// GexSync: user-drawn horizontal lines on GEXbot's chart (per-ticker). MAIN world —
// needs the live Chart.js instance to map price <-> pixel. content.js (isolated)
// owns the store; it writes the current ticker's lines + trigger-mode flag to #__gxlines.
// We render an overlay pinned to the canvas (tracking zoom/pan/refresh, like pdlines.js).
// While trigger mode is armed we show a reticle, lock pan/zoom, and take over the chart's
// right-click for an action menu. Nothing is drawn until a ticker has stored lines or armed.
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
  const HIT = 6; // px: a right-click within this of a line's price → the menu's "Remove line"
  const readCfg = () => { const n = document.getElementById(CFG_ID); if (!n || !n.textContent) return null; try { return JSON.parse(n.textContent); } catch (e) { return null; } };

  let overlay = null, guide = null, vguide = null, dot = null, guideLbl = null, lockBadge = null;
  const els = new Map(); // id -> { line, label }
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "gexsync-lines";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147481600;overflow:hidden;display:none;";
    // reticle horizontal guide: a faint line + price tag that tracks the pointer
    guide = document.createElement("div");
    guide.style.cssText = "position:absolute;height:0;border-top:1px dashed rgba(22,224,163,.55);width:100%;left:0;display:none;";
    // reticle: a vertical guide + a ring at the cursor, so the two dashed lines read as a scope
    vguide = document.createElement("div");
    vguide.style.cssText = "position:absolute;width:0;top:0;height:100%;border-left:1px dashed #16E0A3;display:none;";
    dot = document.createElement("div");
    dot.style.cssText = "position:absolute;width:15px;height:15px;border-radius:50%;border:1.5px solid #16E0A3;box-sizing:border-box;transform:translate(-50%,-50%);display:none;";
    guideLbl = document.createElement("div");
    guideLbl.style.cssText = "position:absolute;transform:translateY(-50%);right:3px;font:600 10px 'JetBrains Mono',ui-monospace,monospace;color:#16E0A3;background:rgba(0,0,0,.6);padding:0 4px;border-radius:3px;white-space:nowrap;display:none;";
    // "zoom locked" badge, pinned to the chart's top-left while trigger mode is armed
    lockBadge = document.createElement("div");
    lockBadge.style.cssText = "position:absolute;display:none;align-items:center;gap:4px;padding:2px 7px;border:1px solid currentColor;border-radius:11px;background:rgba(0,0,0,.6);font:600 10px 'JetBrains Mono',ui-monospace,monospace;white-space:nowrap;";
    lockBadge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg><span>zoom locked</span>`;
    overlay.append(guide, vguide, dot, guideLbl, lockBadge);
    (document.body || document.documentElement).appendChild(overlay);
  }

  const priceOf = (ln) => ln && ln.points && ln.points[0] ? ln.points[0].price : null;
  let lastSig = "";
  function render() {
    const cfg = readCfg();
    const list = (cfg && Array.isArray(cfg.lines)) ? cfg.lines : [];
    const armed = !!(cfg && cfg.armed);
    if (!list.length && !armed) { if (overlay) overlay.style.display = "none"; for (const { line, label } of els.values()) { line.remove(); label.remove(); } els.clear(); lastSig = ""; return; }
    const chart = getChart();
    if (!chart) { if (overlay) overlay.style.display = "none"; return; }
    ensureOverlay();
    const rect = chart.canvas.getBoundingClientRect(), y = chart.scales.y, area = chart.chartArea;
    // crosshair on the canvas while trigger mode is armed
    chart.canvas.style.cursor = armed ? "crosshair" : "";
    const sig = JSON.stringify([rect.left, rect.top, rect.width, rect.height, y.min, y.max, area.left, area.right, area.top, area.bottom, armed, list.map((l) => [l.id, priceOf(l), l.overrides && l.overrides.linecolor, l.text])]);
    if (sig === lastSig) return;
    lastSig = sig;
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147481600;overflow:hidden;display:block;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    // zoom-lock badge: shown while trigger mode is armed
    lockBadge.style.display = armed ? "flex" : "none";
    lockBadge.style.color = "#FFB454";
    lockBadge.style.left = (area.left + 8) + "px";
    lockBadge.style.top = Math.max(2, area.top - 20) + "px"; // sit on the top price axis, not inside the plot
    if (!armed) hideGuide(); // overlay stays up for saved lines, but not armed → clear any leftover reticle
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

  // ---- trigger mode interaction (document-level capture, survives canvas swaps) ----
  const armedOn = () => { const c = readCfg(); return !!(c && c.armed); };
  const onChartCanvas = (e) => { const c = getChart(); return c && e.target === c.canvas; };
  // nearest stored line to a canvas-y pixel, within HIT px → its id, else null (for the menu)
  function hitLine(py) {
    const c = getChart(), cfg = readCfg(); if (!c || !cfg) return null;
    let best = null, bestD = HIT;
    for (const ln of cfg.lines || []) { const p = priceOf(ln); if (p == null) continue; const d = Math.abs(c.scales.y.getPixelForValue(p) - py); if (d <= bestD) { bestD = d; best = ln.id; } }
    return best;
  }
  const hideGuide = () => { if (overlay) guide.style.display = vguide.style.display = dot.style.display = guideLbl.style.display = "none"; };
  // reticle (amber crosshair + ring + price tag) tracks the cursor while armed
  document.addEventListener("mousemove", (e) => {
    if (!armedOn() || !overlay) return;
    if (!onChartCanvas(e)) { hideGuide(); return; } // left the canvas → don't leave a stuck reticle
    const c = getChart(), rect = c.canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top, area = c.chartArea;
    if (py < area.top || py > area.bottom) { hideGuide(); return; }
    const col = "#FFB454";
    guide.style.borderTopColor = col; guide.style.top = py + "px"; guide.style.display = "block";
    vguide.style.borderLeftColor = col; vguide.style.left = px + "px"; vguide.style.display = "block";
    dot.style.borderColor = col; dot.style.left = px + "px"; dot.style.top = py + "px"; dot.style.display = "block";
    guideLbl.style.color = col; guideLbl.style.top = py + "px"; guideLbl.textContent = (+c.scales.y.getValueForPixel(py)).toFixed(2); guideLbl.style.display = "block";
  }, true);
  // Lock the chart while armed: block pan-start (mousedown), wheel-zoom, and GEXbot's double-click
  // reset. Left-click does nothing else; all actions come from the right-click menu below. Leaving
  // trigger mode restores pan/zoom. (Not pointerdown — its preventDefault would kill menu clicks.)
  const lockEv = (e) => { if (armedOn() && onChartCanvas(e)) { e.stopPropagation(); e.preventDefault(); } };
  document.addEventListener("mousedown", lockEv, true);
  document.addEventListener("dblclick", lockEv, true);
  document.addEventListener("wheel", lockEv, { capture: true, passive: false });

  // ---- right-click action menu (only while armed) ----
  let menuEl = null, onDocDown = null, onKey = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    document.removeEventListener("mousedown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("wheel", closeMenu, true);
    window.removeEventListener("blur", closeMenu);
  }
  function menuItem(label, sub, onPick, accent) {
    const it = document.createElement("div");
    it.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:18px;padding:7px 12px;cursor:pointer;white-space:nowrap;color:#e8ecf3;";
    const l = document.createElement("span"); l.textContent = label; if (accent) l.style.color = accent; it.appendChild(l);
    if (sub) { const s = document.createElement("span"); s.textContent = sub; s.style.cssText = "color:#7c8698;font-size:11px;"; it.appendChild(s); }
    it.addEventListener("mouseenter", () => (it.style.background = "rgba(255,255,255,.06)"));
    it.addEventListener("mouseleave", () => (it.style.background = "transparent"));
    it.addEventListener("click", (e) => { e.stopPropagation(); try { onPick(); } catch (err) {} closeMenu(); });
    return it;
  }
  const sep = () => { const d = document.createElement("div"); d.style.cssText = "height:1px;margin:4px 0;background:rgba(255,255,255,.08);"; return d; };
  function buildMenu(x, y, ctx) {
    closeMenu();
    menuEl = document.createElement("div");
    menuEl.style.cssText = "position:fixed;z-index:2147482000;min-width:184px;padding:5px 0;background:#12161f;border:1px solid #2a3342;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.5);font:600 12px 'JetBrains Mono',ui-monospace,monospace;user-select:none;";
    menuEl.appendChild(menuItem("Copy price", ctx.price.toFixed(2), () => navigator.clipboard.writeText(ctx.price.toFixed(2))));
    if (ctx.hitId != null) menuEl.appendChild(menuItem("Remove line", null, () => window.dispatchEvent(new CustomEvent("gexsync-line-remove", { detail: { id: ctx.hitId } }))));
    else menuEl.appendChild(menuItem("Add line here", ctx.price.toFixed(2), () => window.dispatchEvent(new CustomEvent("gexsync-line-place", { detail: { price: ctx.price } }))));
    // ticker actions
    menuEl.appendChild(sep());
    menuEl.appendChild(menuItem(ctx.inWatch ? "Remove from watchlist" : "Add to watchlist", ctx.ticker || "", () => window.dispatchEvent(new CustomEvent("gexsync-watchlist-toggle"))));
    if (ctx.hasLines) menuEl.appendChild(menuItem("Clear lines", ctx.ticker || "", () => window.dispatchEvent(new CustomEvent("gexsync-lines-clear")), "#FF5C5C"));
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect(); // clamp inside the viewport
    menuEl.style.left = Math.min(x, innerWidth - r.width - 6) + "px";
    menuEl.style.top = Math.min(y, innerHeight - r.height - 6) + "px";
    onDocDown = (e) => { if (!menuEl || !menuEl.contains(e.target)) closeMenu(); };
    onKey = (e) => { if (e.key === "Escape") closeMenu(); };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("wheel", closeMenu, true);
    window.addEventListener("blur", closeMenu);
  }
  document.addEventListener("contextmenu", (e) => {
    if (!armedOn() || !onChartCanvas(e)) return;
    e.preventDefault(); e.stopPropagation(); // take over the chart's right-click while armed
    const c = getChart(); if (!c) return;
    const rect = c.canvas.getBoundingClientRect(), py = e.clientY - rect.top, area = c.chartArea;
    if (py < area.top || py > area.bottom) return;
    const cfg = readCfg() || {}, price = +c.scales.y.getValueForPixel(py);
    buildMenu(e.clientX, e.clientY, { price, hitId: hitLine(py), ticker: cfg.ticker, hasLines: Array.isArray(cfg.lines) && cfg.lines.length > 0, inWatch: !!cfg.inWatch });
  }, true);
})();
