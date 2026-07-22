// ponytail: MAIN-world zoom bridge. GEXbot's chart is Chart.js + chartjs-plugin-zoom
// on a <canvas>; the live instance lives in React props, invisible to the isolated
// content script. This finds it and (a) publishes the user's zoom so content.js can
// remember it per ticker, and (b) keeps the chart at content.js's "desired" range —
// re-asserting it after GEXbot's ~5-min refresh resets the view, while yielding to
// the user whenever they're actively zooming. No storage, no app logic.
(() => {
  if (window.__gexsyncZoom) return;
  window.__gexsyncZoom = 1;

  const STATE_ID = "__gxZoom";   // MAIN → isolated: the user's latest zoom
  const CMD_ID = "__gxZoomCmd";  // isolated → MAIN: the desired zoom to hold
  const node = (id) => { let n = document.getElementById(id); if (!n) { n = document.createElement("div"); n.id = id; n.style.display = "none"; (document.documentElement || document).appendChild(n); } return n; };
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$")) return el[k]; return null; };

  // Locate the Chart.js instance by SHAPE (component is minified) — an object with a
  // y-scale and the chartjs-plugin-zoom API. Cached; re-found when the chart rebuilds.
  const isChart = (v) => v && typeof v === "object" && v.scales && v.scales.y && typeof v.zoomScale === "function" && typeof v.update === "function";
  const hooks = (f) => { const o = []; let h = f && f.memoizedState, i = 0; while (h && typeof h === "object" && i < 80 && ("next" in h || "memoizedState" in h)) { o.push(h.memoizedState); h = h.next; i++; } return o; };
  let cached = null;
  function findChart() {
    if (cached && isChart(cached) && cached.canvas && cached.canvas.isConnected) return cached;
    cached = null;
    const cv = document.querySelector("canvas");
    let top = cv && fiberOf(cv); if (!top) return null; while (top.return) top = top.return;
    const stack = [top], seen = new Set(); let v = 0;
    while (stack.length && v++ < 40000) {
      const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n);
      for (const h of (typeof n.type === "function" ? hooks(n) : [])) { let c = h; if (c && typeof c === "object" && "current" in c) c = c.current; if (isChart(c)) { cached = c; return c; } if (isChart(h)) { cached = h; return h; } }
      const p = n.memoizedProps; if (p && typeof p === "object") for (const k in p) { let x; try { x = p[k]; } catch (e) { continue; } if (isChart(x)) { cached = x; return x; } }
      if (n.child) stack.push(n.child); if (n.sibling) stack.push(n.sibling);
    }
    return null;
  }

  let applying = false, lastInput = 0;
  const onCanvas = (e) => e.target && e.target.tagName === "CANVAS";
  ["wheel", "pointerdown", "pointermove", "pointerup", "dblclick"].forEach((t) =>
    document.addEventListener(t, (e) => { if (onCanvas(e)) lastInput = performance.now(); }, true));

  // Capture: after the user finishes a wheel/drag/reset on the canvas, publish the
  // resulting y-range so content.js can remember it. Debounced; skipped while WE apply.
  let capTimer = 0;
  const scheduleCapture = (e) => {
    if (!onCanvas(e)) return;
    clearTimeout(capTimer);
    capTimer = setTimeout(() => {
      if (applying) return; const c = findChart(); if (!c) return;
      node(STATE_ID).textContent = JSON.stringify({ yMin: c.scales.y.min, yMax: c.scales.y.max });
      window.dispatchEvent(new CustomEvent("gexsync-zoom"));
    }, 350);
  };
  document.addEventListener("wheel", scheduleCapture, true);
  document.addEventListener("pointerup", scheduleCapture, true);
  document.addEventListener("dblclick", scheduleCapture, true);

  // Assert: hold the chart at content.js's desired range. Idempotent when already
  // there; fixes it after a refresh reset. Never fights an actively-zooming user.
  function tick() {
    const chart = findChart(); if (!chart) return;
    if (performance.now() - lastInput < 900) return;
    const cmd = document.getElementById(CMD_ID); if (!cmd || !cmd.textContent) return;
    let d; try { d = JSON.parse(cmd.textContent); } catch (e) { return; }
    if (!d || !isFinite(d.yMin) || !isFinite(d.yMax)) return;
    const y = chart.scales.y, tol = (Math.abs(d.yMax - d.yMin) || 1) * 0.005;
    if (Math.abs(y.min - d.yMin) > tol || Math.abs(y.max - d.yMax) > tol) {
      applying = true;
      try { chart.zoomScale("y", { min: d.yMin, max: d.yMax }, "none"); chart.update("none"); } catch (e) {}
      setTimeout(() => { applying = false; }, 50);
    }
  }
  setInterval(tick, 400);
})();
