// GexSync: user-drawn horizontal lines + freehand drawings on GEXbot's chart. MAIN world —
// needs the live Chart.js instance to map price/time <-> pixel. content.js (isolated) owns the
// stores; it writes the current ticker's lines, drawings, and the chart mode to #__gxlines.
// We render an overlay pinned to the canvas (tracking zoom/pan/refresh, like pdlines.js).
// Chart tools toggle on/off from the pill (global). Once on, the right-click menu switches
// between two sub-modes: "line" (line-color reticle, locked chart, horizontal price lines) and
// "draw" (draw-color reticle, left-drag paints freehand/arrow strokes). The menu carries
// segmented Line|Draw, Tool, and Scope selectors. Drawings anchor to (time-of-day, price).
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
  // i18n: content.js rides the UI language over on the #__gxlines payload (cfg.lang). GXI18N is
  // bundled into this MAIN-world script too, so t()/ti() resolve here. English is the fallback.
  const GXI = self.GXI18N;
  const tr = (k, lang) => (GXI ? GXI.t(k, lang) : k);
  const tri = (k, vals, lang) => (GXI ? GXI.ti(k, vals, lang) : k);
  const scopeWord = (sc, lang) => tr("lines.scope." + sc, lang); // page|tab|global → localized noun (lowercase)
  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const AMBER = "#FFB454", AZURE = "#4AA3FF"; // line-mode reticle / draw reticle+strokes
  const SVGNS = "http://www.w3.org/2000/svg";

  // Drawings anchor to (time-of-day, price): X is ms-since-midnight so a stroke lands at the same
  // clock slot every day, across every DTE package; Y is absolute price. Mapped each frame via the
  // chart's time scale (xTimeAxis) + y scale, so drawings track zoom/pan/replay for free.
  const timeScale = () => { const c = getChart(); return c && c.scales && c.scales.xTimeAxis; };
  function todToPx(tod) { const t = timeScale(); if (!t) return null; const d = new Date(t.min); d.setHours(0, 0, 0, 0); return t.getPixelForValue(d.getTime() + tod); }
  function pxToTod(px) { const t = timeScale(); if (!t) return null; const ts = t.getValueForPixel(px); const d = new Date(ts); return ts - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  const pathD = (xy) => xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  function arrowHead(x0, y0, x1, y1, s) { const a = Math.atan2(y1 - y0, x1 - x0), a1 = a + Math.PI - 0.42, a2 = a + Math.PI + 0.42; return `${x1},${y1} ${x1 + s * Math.cos(a1)},${y1 + s * Math.sin(a1)} ${x1 + s * Math.cos(a2)},${y1 + s * Math.sin(a2)}`; }

  let overlay = null, guide = null, vguide = null, dot = null, guideLbl = null, lockBadge = null, lockTxt = null, svg = null, drawG = null, previewPath = null;
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
    // "zoom locked" badge, pinned to the chart's top-left while chart tools are armed
    lockBadge = document.createElement("div");
    lockBadge.style.cssText = "position:absolute;display:none;align-items:center;gap:4px;padding:2px 7px;border:1px solid currentColor;border-radius:11px;background:rgba(0,0,0,.6);font:600 10px 'JetBrains Mono',ui-monospace,monospace;white-space:nowrap;";
    lockBadge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg><span>zoom locked</span>`;
    lockTxt = lockBadge.querySelector("span");
    // freehand/arrow drawing layer (the only SVG overlay): drawG holds the stored drawings,
    // previewPath the in-progress stroke while dragging
    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("style", "position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;");
    drawG = document.createElementNS(SVGNS, "g");
    previewPath = document.createElementNS(SVGNS, "path");
    previewPath.setAttribute("fill", "none"); previewPath.setAttribute("stroke-linecap", "round"); previewPath.setAttribute("stroke-linejoin", "round");
    previewPath.style.display = "none";
    svg.append(drawG, previewPath);
    overlay.append(guide, vguide, dot, guideLbl, lockBadge, svg);
    (document.body || document.documentElement).appendChild(overlay);
  }

  const priceOf = (ln) => ln && ln.points && ln.points[0] ? ln.points[0].price : null;
  // rebuild the stored-drawings SVG layer: each drawing's {tod,p} points → pixels this frame
  function paintDraws(chart, drawings, dCol) {
    if (!drawG) return;
    drawG.replaceChildren();
    const y = chart.scales.y;
    for (const dr of drawings) {
      if (!dr || !Array.isArray(dr.points)) continue;
      const xy = [];
      for (const pt of dr.points) { const px = todToPx(pt.tod), py = y.getPixelForValue(pt.p); if (px == null || !isFinite(px) || !isFinite(py)) continue; xy.push([px, py]); }
      if (xy.length < 2) continue;
      const col = dCol, w = dr.width || 2; // all strokes follow the live draw color
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", pathD(xy)); path.setAttribute("fill", "none"); path.setAttribute("stroke", col);
      path.setAttribute("stroke-width", w); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
      drawG.appendChild(path);
      if (dr.type === "arrow") { const s = xy[0], e = xy[xy.length - 1]; const poly = document.createElementNS(SVGNS, "polygon"); poly.setAttribute("points", arrowHead(s[0], s[1], e[0], e[1], 9 + w)); poly.setAttribute("fill", col); drawG.appendChild(poly); }
    }
  }
  let lastSig = "";
  function render() {
    const cfg = readCfg();
    const list = (cfg && Array.isArray(cfg.lines)) ? cfg.lines : [];
    const mode = (cfg && cfg.mode) || "";
    const armed = mode === "line" || mode === "draw", drawing = mode === "draw";
    const tCol = (cfg && cfg.lineColor) || AMBER, dCol = (cfg && cfg.drawColor) || AZURE;
    const drawList = (cfg && Array.isArray(cfg.draws)) ? cfg.draws : [];
    if (!list.length && !armed && !drawList.length) { if (overlay) overlay.style.display = "none"; for (const { line, label } of els.values()) { line.remove(); label.remove(); } els.clear(); if (drawG) drawG.replaceChildren(); lastSig = ""; return; }
    const chart = getChart();
    if (!chart) { if (overlay) overlay.style.display = "none"; return; }
    ensureOverlay();
    const rect = chart.canvas.getBoundingClientRect(), y = chart.scales.y, area = chart.chartArea, t = timeScale();
    // crosshair on the canvas while a mode is armed
    chart.canvas.style.cursor = armed ? "crosshair" : "";
    const sig = JSON.stringify([rect.left, rect.top, rect.width, rect.height, y.min, y.max, t ? t.min : 0, t ? t.max : 0, area.left, area.right, area.top, area.bottom, mode, (cfg && cfg.scope) || "", tCol, dCol, list.map((l) => [l.id, priceOf(l), l.overrides && l.overrides.linecolor, l.text]), drawList.map((d) => d.id)]);
    if (sig === lastSig) return;
    lastSig = sig;
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147481600;overflow:hidden;display:block;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    paintDraws(chart, drawList, dCol);
    // zoom-lock badge: shown while a mode is armed, tinted to the mode
    lockBadge.style.display = armed ? "flex" : "none";
    lockBadge.style.color = drawing ? dCol : tCol;
    if (lockTxt) lockTxt.textContent = drawing ? tri("lines.drawScope", { scope: scopeWord((cfg && cfg.scope) || "page", cfg && cfg.lang) }, cfg && cfg.lang) : tr("lines.zoomLocked", cfg && cfg.lang);
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
      // follow the live line color unless the line has an explicit non-default override
      const color = (ov.linecolor && ov.linecolor !== "#16E0A3") ? ov.linecolor : tCol, w = ov.linewidth || 1, dash = (ov.linestyle || "dashed") === "solid" ? "" : "border-top-style:dashed;";
      const py = y.getPixelForValue(price);
      if (py < area.top || py > area.bottom) { e.line.style.display = "none"; e.label.style.display = "none"; continue; }
      e.line.style.cssText = `position:absolute;height:0;left:${area.left}px;width:${area.right - area.left}px;top:${py}px;border-top:${w}px solid ${color};${dash}display:block;`;
      e.label.style.top = py + "px"; e.label.style.color = color; e.label.textContent = ln.text || (+price).toFixed(2); e.label.style.display = "block";
    }
    for (const [id, e] of els) if (!live.has(id)) { e.line.remove(); e.label.remove(); els.delete(id); }
  }
  function loop() { try { render(); } catch (e) {} requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // ---- line/draw mode interaction (document-level capture, survives canvas swaps) ----
  const modeVal = () => { const c = readCfg(); return (c && c.mode) || ""; };
  const armedOn = () => { const m = modeVal(); return m === "line" || m === "draw"; };
  const drawOn = () => modeVal() === "draw";
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
    const cfg = readCfg() || {}, col = drawOn() ? (cfg.drawColor || AZURE) : (cfg.lineColor || AMBER);
    guide.style.borderTopColor = col; guide.style.top = py + "px"; guide.style.display = "block";
    vguide.style.borderLeftColor = col; vguide.style.left = px + "px"; vguide.style.display = "block";
    dot.style.borderColor = col; dot.style.left = px + "px"; dot.style.top = py + "px"; dot.style.display = "block";
    guideLbl.style.color = col; guideLbl.style.top = py + "px"; guideLbl.textContent = (+c.scales.y.getValueForPixel(py)).toFixed(2); guideLbl.style.display = "block";
  }, true);
  // Lock the chart while armed: block pan-start (mousedown), wheel-zoom, and GEXbot's double-click
  // reset. Left-click does nothing else; all actions come from the right-click menu below. Leaving
  // turning tools off restores pan/zoom. (Not pointerdown — its preventDefault would kill menu clicks.)
  const lockEv = (e) => { if (armedOn() && onChartCanvas(e)) { e.stopPropagation(); e.preventDefault(); } };
  document.addEventListener("mousedown", lockEv, true);
  document.addEventListener("dblclick", lockEv, true);
  document.addEventListener("wheel", lockEv, { capture: true, passive: false });

  // ---- freehand/arrow capture (draw mode only): left-drag on the canvas → a stroke ----
  let cap = null; // { type, pts:[{tod,p}], xy:[[px,py]] }
  const todPricePt = (chart, px, py) => ({ tod: pxToTod(px), p: chart.scales.y.getValueForPixel(py) });
  function updatePreview() {
    if (!cap || cap.xy.length < 1) { previewPath.style.display = "none"; return; }
    previewPath.setAttribute("d", pathD(cap.xy)); previewPath.setAttribute("stroke", (readCfg() || {}).drawColor || AZURE); previewPath.setAttribute("stroke-width", 2); previewPath.style.display = "block";
  }
  document.addEventListener("pointerdown", (e) => {
    if (!drawOn() || e.button !== 0 || !onChartCanvas(e)) return;
    const c = getChart(); if (!c || !timeScale()) return; // no time axis → can't anchor; bail
    e.preventDefault(); e.stopPropagation();
    ensureOverlay();
    const rect = c.canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    const tool = (readCfg() || {}).tool === "arrow" ? "arrow" : "free";
    cap = { type: tool, pts: [todPricePt(c, px, py)], xy: [[px, py]] };
    updatePreview();
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (!cap) return;
    const c = getChart(); if (!c) return;
    const rect = c.canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (cap.type === "arrow") { cap.xy = [cap.xy[0], [px, py]]; cap.pts = [cap.pts[0], todPricePt(c, px, py)]; } // start + current end
    else { const last = cap.xy[cap.xy.length - 1]; if (!last || Math.hypot(px - last[0], py - last[1]) >= 3) { cap.xy.push([px, py]); cap.pts.push(todPricePt(c, px, py)); } } // decimate ~3px
    updatePreview();
  }, true);
  const endCapture = () => {
    if (!cap) return;
    const done = cap; cap = null; previewPath.style.display = "none";
    if (done.pts.length >= 2) window.dispatchEvent(new CustomEvent("gexsync-draw-add", { detail: { type: done.type, points: done.pts, width: 2 } }));
  };
  document.addEventListener("pointerup", endCapture, true);
  document.addEventListener("pointercancel", endCapture, true);

  // ---- right-click action menu (only while armed) ----
  let menuEl = null, backdrop = null, onKey = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    if (backdrop) { backdrop.remove(); backdrop = null; }
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("wheel", closeMenu, true);
    window.removeEventListener("blur", closeMenu);
  }
  function menuItem(label, sub, onPick, accent, disabled) {
    const it = document.createElement("div");
    it.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:18px;padding:7px 12px;cursor:${disabled ? "default" : "pointer"};white-space:nowrap;color:#e8ecf3;${disabled ? "opacity:.32;" : ""}`;
    const l = document.createElement("span"); l.textContent = label; if (accent) l.style.color = accent; it.appendChild(l);
    if (sub) { const s = document.createElement("span"); s.textContent = sub; s.style.cssText = "color:#7c8698;font-size:11px;"; it.appendChild(s); }
    if (disabled) { it.addEventListener("click", (e) => e.stopPropagation()); return it; } // dimmed → no-op, menu stays open
    it.addEventListener("mouseenter", () => (it.style.background = "rgba(255,255,255,.06)"));
    it.addEventListener("mouseleave", () => (it.style.background = "transparent"));
    it.addEventListener("click", (e) => { e.stopPropagation(); try { onPick(); } catch (err) {} closeMenu(); });
    return it;
  }
  const sep = () => { const d = document.createElement("div"); d.style.cssText = "height:1px;margin:4px 0;background:rgba(255,255,255,.08);"; return d; };
  // segmented control row: label + inline pills (active = mint). onPick(value) does NOT close the
  // menu — the caller re-renders it in place so selection is a live toggle, not a dismiss.
  function segRow(label, opts, current, onPick) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:9px;padding:6px 12px;white-space:nowrap;";
    if (label) { const l = document.createElement("span"); l.textContent = label; l.style.cssText = "color:#7c8698;font-size:11px;min-width:38px;"; row.appendChild(l); }
    const seg = document.createElement("div");
    seg.style.cssText = "display:flex;gap:3px;padding:2px;border-radius:8px;background:#0c0f16;border:1px solid #2a3342;";
    for (const [val, text] of opts) {
      const b = document.createElement("span");
      const on = val === current;
      b.textContent = text;
      b.style.cssText = `padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;transition:background .12s,color .12s;${on ? "background:#16E0A3;color:#08110c;" : "color:#9aa0aa;"}`;
      if (!on) { b.addEventListener("mouseenter", () => (b.style.color = "#e8ecf3")); b.addEventListener("mouseleave", () => (b.style.color = "#9aa0aa")); }
      b.addEventListener("click", (e) => { e.stopPropagation(); if (val !== current) { try { onPick(val); } catch (err) {} } });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    return row;
  }
  function buildMenu(x, y, ctx) {
    closeMenu();
    // click-away backdrop: a transparent full-viewport layer just under the menu. It catches the
    // dismiss on POINTERDOWN (draw mode's pointerdown-capture preventDefault suppresses the
    // compatibility mousedown, so a mousedown-based dismiss never fires) and absorbs the click so
    // it can't draw / pan / hit GEXbot underneath.
    backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:2147481999;background:transparent;";
    const dismiss = (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); };
    backdrop.addEventListener("pointerdown", dismiss, true);
    backdrop.addEventListener("mousedown", dismiss, true);
    backdrop.addEventListener("contextmenu", (e) => e.preventDefault(), true);
    document.body.appendChild(backdrop);
    menuEl = document.createElement("div");
    menuEl.style.cssText = "position:fixed;z-index:2147482000;min-width:184px;padding:5px 0;background:#12161f;border:1px solid #2a3342;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.5);font:600 12px 'JetBrains Mono',ui-monospace,monospace;user-select:none;";
    const lang = ctx.lang;
    const mode = ctx.mode === "draw" ? "draw" : "line"; // "" never opens a menu; default to line
    // header: Line | Draw — switches sub-mode in place (dispatch + rebuild body, menu stays open)
    menuEl.appendChild(segRow("", [["line", tr("lines.line", lang)], ["draw", tr("lines.draw", lang)]], mode, (m) => {
      window.dispatchEvent(new CustomEvent("gexsync-chart-mode", { detail: { mode: m } }));
      buildMenu(x, y, { ...ctx, mode: m });
    }));
    menuEl.appendChild(sep());
    // shared: read the price under the cursor (works in both modes)
    menuEl.appendChild(menuItem(tr("lines.copyPrice", lang), ctx.price.toFixed(2), () => navigator.clipboard.writeText(ctx.price.toFixed(2))));
    menuEl.appendChild(sep());
    if (mode === "draw") {
      menuEl.appendChild(segRow(tr("lines.tool", lang), [["free", tr("lines.freehand", lang)], ["arrow", tr("lines.arrow", lang)]], ctx.tool || "free", (t) => { window.dispatchEvent(new CustomEvent("gexsync-draw-tool", { detail: { tool: t } })); buildMenu(x, y, { ...ctx, tool: t }); }));
      menuEl.appendChild(segRow(tr("lines.scopeLabel", lang), [["page", capFirst(scopeWord("page", lang))], ["tab", capFirst(scopeWord("tab", lang))], ["global", capFirst(scopeWord("global", lang))]], ctx.scope || "page", (s) => { window.dispatchEvent(new CustomEvent("gexsync-draw-scope", { detail: { scope: s } })); buildMenu(x, y, { ...ctx, scope: s }); }));
      menuEl.appendChild(sep());
      menuEl.appendChild(menuItem(tr("lines.undoLast", lang), null, () => window.dispatchEvent(new CustomEvent("gexsync-draw-undo"))));
      // all three scope-clears always present; a scope with no drawings is dimmed. Each targets its
      // own scope (no need to switch scope first) — content.js reads detail.scope.
      const counts = ctx.drawCounts || {};
      for (const sc of ["page", "tab", "global"]) {
        const n = counts[sc] || 0;
        menuEl.appendChild(menuItem(tri("lines.clearDrawings", { scope: scopeWord(sc, lang) }, lang), n ? String(n) : null, () => window.dispatchEvent(new CustomEvent("gexsync-draws-clear", { detail: { scope: sc } })), "#FF5C5C", n === 0));
      }
    } else {
      if (ctx.hitId != null) menuEl.appendChild(menuItem(tr("lines.removeLine", lang), null, () => window.dispatchEvent(new CustomEvent("gexsync-line-remove", { detail: { id: ctx.hitId } }))));
      else menuEl.appendChild(menuItem(tr("lines.addLineHere", lang), ctx.price.toFixed(2), () => window.dispatchEvent(new CustomEvent("gexsync-line-place", { detail: { price: ctx.price } }))));
      menuEl.appendChild(menuItem(ctx.inWatch ? tr("lines.removeWatch", lang) : tr("lines.addWatch", lang), ctx.ticker || "", () => window.dispatchEvent(new CustomEvent("gexsync-watchlist-toggle"))));
      if (ctx.hasLines) menuEl.appendChild(menuItem(tr("lines.clearLines", lang), ctx.ticker || "", () => window.dispatchEvent(new CustomEvent("gexsync-lines-clear")), "#FF5C5C"));
    }
    menuEl.appendChild(sep());
    menuEl.appendChild(menuItem(tr("lines.off", lang), null, () => window.dispatchEvent(new CustomEvent("gexsync-chart-mode", { detail: { mode: "" } }))));
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect(); // clamp inside the viewport
    menuEl.style.left = Math.min(x, innerWidth - r.width - 6) + "px";
    menuEl.style.top = Math.min(y, innerHeight - r.height - 6) + "px";
    onKey = (e) => { if (e.key === "Escape") closeMenu(); };
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
    buildMenu(e.clientX, e.clientY, { price, hitId: hitLine(py), ticker: cfg.ticker, hasLines: Array.isArray(cfg.lines) && cfg.lines.length > 0, inWatch: !!cfg.inWatch, mode: cfg.mode, tool: cfg.tool, scope: cfg.scope, drawCounts: cfg.drawCounts, lang: cfg.lang });
  }, true);
})();
