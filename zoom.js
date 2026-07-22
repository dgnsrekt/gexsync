// ponytail: MAIN-world zoom bridge. GEXbot's chart is Chart.js + chartjs-plugin-zoom
// on a <canvas>; the live instance lives in React props, invisible to the isolated
// content script. This finds it and bridges it to content.js through hidden DOM
// nodes: publishes the current y-range (for reads/Save), HOLDS a desired range
// through refreshes (live sync), and does one-shot APPLYs (Recall). No storage.
(() => {
  if (window.__gexsyncZoom) return;
  window.__gexsyncZoom = 1;

  const CUR_ID = "__gxZoom";       // MAIN → isolated: the chart's current y-range (fresh each tick)
  const HOLD_ID = "__gxZoomHold";  // isolated → MAIN: a range to hold through refreshes (live sync)
  const APPLY_ID = "__gxZoomApply";// isolated → MAIN: {..,seq} — apply once, don't hold (Recall)
  const node = (id) => { let n = document.getElementById(id); if (!n) { n = document.createElement("div"); n.id = id; n.style.display = "none"; (document.documentElement || document).appendChild(n); } return n; };
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$")) return el[k]; return null; };

  // Locate the Chart.js instance by SHAPE (component is minified) — an object with a
  // y-scale and the chartjs-plugin-zoom API.
  const isChart = (v) => v && typeof v === "object" && v.scales && v.scales.y && typeof v.zoomScale === "function" && typeof v.update === "function";
  // cap high: GEXbot's classic chart component holds the instance past hook #110.
  const hooks = (f) => { const o = []; let h = f && f.memoizedState, i = 0; while (h && typeof h === "object" && i < 400 && ("next" in h || "memoizedState" in h)) { o.push(h.memoizedState); h = h.next; i++; } return o; };
  // Always resolve the LIVE instance fresh — GEXbot may recreate the chart on refresh.
  function findChart() {
    const cv = document.querySelector("canvas");
    let top = cv && fiberOf(cv); if (!top) return null; while (top.return) top = top.return;
    const stack = [top], seen = new Set(); let v = 0;
    while (stack.length && v++ < 40000) {
      const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n);
      for (const h of (typeof n.type === "function" ? hooks(n) : [])) { let c = h; if (c && typeof c === "object" && "current" in c) c = c.current; if (isChart(c)) return c; if (isChart(h)) return h; }
      const p = n.memoizedProps; if (p && typeof p === "object") for (const k in p) { let x; try { x = p[k]; } catch (e) { continue; } if (isChart(x)) return x; }
      if (n.child) stack.push(n.child); if (n.sibling) stack.push(n.sibling);
    }
    return null;
  }

  let applying = false, lastInput = 0, lastInputWall = 0;
  const BUSY_MS = 1200; // while the user is zooming THIS tab, it's the authority
  const set = (chart, d) => { applying = true; try { chart.zoomScale("y", { min: d.yMin, max: d.yMax }, "none"); chart.update("none"); } catch (e) {} setTimeout(() => { applying = false; }, 50); };
  const publish = (yMin, yMax) => JSON.stringify({ yMin, yMax, busyUntil: lastInputWall + BUSY_MS });
  const onCanvas = (e) => e.target && e.target.tagName === "CANVAS";
  ["wheel", "pointerdown", "pointermove", "pointerup", "dblclick"].forEach((t) =>
    document.addEventListener(t, (e) => { if (onCanvas(e)) { lastInput = performance.now(); lastInputWall = Date.now(); } }, true));

  // Capture: after the user finishes a wheel/drag on the canvas, publish the range
  // and signal content.js (for live-sync propagation). Skipped while WE apply.
  let capTimer = 0;
  const scheduleCapture = (e) => {
    if (!onCanvas(e)) return;
    clearTimeout(capTimer);
    capTimer = setTimeout(() => {
      if (applying) return; const c = findChart(); if (!c) return;
      node(CUR_ID).textContent = publish(c.scales.y.min, c.scales.y.max);
      window.dispatchEvent(new CustomEvent("gexsync-zoom"));
    }, 350);
  };
  document.addEventListener("wheel", scheduleCapture, true);
  document.addEventListener("pointerup", scheduleCapture, true);
  document.addEventListener("dblclick", scheduleCapture, true);

  let lastMin = null, lastMax = null, lastApplySeq = null;
  function tick() {
    const chart = findChart(); if (!chart) return;
    const y = chart.scales.y;
    // publish current range (+ busy window) so content.js can read/Save it any time
    const cur = publish(y.min, y.max);
    const cn = node(CUR_ID); if (cn.textContent !== cur) cn.textContent = cur;

    // one-shot apply (Recall) — apply once when seq changes, then leave it be
    const ap = document.getElementById(APPLY_ID);
    if (ap && ap.textContent) {
      let a; try { a = JSON.parse(ap.textContent); } catch (e) { a = null; }
      if (a && a.seq !== lastApplySeq && isFinite(a.yMin) && isFinite(a.yMax)) {
        lastApplySeq = a.seq;
        if (performance.now() - lastInput > 300) { set(chart, a); lastMin = a.yMin; lastMax = a.yMax; return; }
      }
    }

    // hold (live sync) — keep the chart at the held range through refreshes, but
    // wait for GEXbot to stop re-fitting (stability gate) and yield to the user.
    const hn = document.getElementById(HOLD_ID);
    if (!hn || !hn.textContent) { lastMin = y.min; lastMax = y.max; return; }
    if (performance.now() - lastInput < 900) { lastMin = y.min; lastMax = y.max; return; }
    let d; try { d = JSON.parse(hn.textContent); } catch (e) { return; }
    if (!d || !isFinite(d.yMin) || !isFinite(d.yMax)) return;
    const tol = (Math.abs(d.yMax - d.yMin) || 1) * 0.005;
    const stable = lastMin != null && Math.abs(y.min - lastMin) <= tol && Math.abs(y.max - lastMax) <= tol;
    lastMin = y.min; lastMax = y.max;
    if (stable && (Math.abs(y.min - d.yMin) > tol || Math.abs(y.max - d.yMax) > tol)) {
      set(chart, d); lastMin = d.yMin; lastMax = d.yMax;
    }
  }
  setInterval(tick, 400);
})();
