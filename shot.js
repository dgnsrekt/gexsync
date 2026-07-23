// ponytail: MAIN-world on-demand capture. The isolated content script can't reach
// the Chart.js instance (it lives in React internals), so on request this shoots the
// chart canvas to a data-URL and hands it back through hidden DOM nodes. Reuses the
// shape-based finder from zoom.js. (The shown DATA date/time is read by content.js
// from the DOM, not here — in replay every in-page timestamp prop is today-anchored.)
(() => {
  if (window.__gexsyncShot) return;
  window.__gexsyncShot = 1;

  const REQ = "__gxShotReq";  // isolated → MAIN: {seq} — capture request (polled)
  const RES = "__gxShotRes";  // MAIN → isolated: {seq, png}
  const node = (id) => { let n = document.getElementById(id); if (!n) { n = document.createElement("div"); n.id = id; n.style.display = "none"; (document.documentElement || document).appendChild(n); } return n; };
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$")) return el[k]; return null; };

  // Locate the Chart.js instance by SHAPE (component is minified) — same finder as zoom.js.
  const isChart = (v) => v && typeof v === "object" && v.scales && v.scales.y && typeof v.zoomScale === "function" && typeof v.update === "function";
  const hooks = (f) => { const o = []; let h = f && f.memoizedState, i = 0; while (h && typeof h === "object" && i < 400 && ("next" in h || "memoizedState" in h)) { o.push(h.memoizedState); h = h.next; i++; } return o; };
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

  let last = null;
  setInterval(() => {
    const req = document.getElementById(REQ);
    if (!req || !req.textContent) return;
    let r; try { r = JSON.parse(req.textContent); } catch (e) { return; }
    if (!r || r.seq === last) return;
    last = r.seq;
    let png = null;
    const c = findChart();
    if (c) { try { png = c.toBase64Image("image/jpeg", 0.92); } catch (e) {} }
    node(RES).textContent = JSON.stringify({ seq: r.seq, png });
    window.dispatchEvent(new CustomEvent("gexsync-shot"));
  }, 120);
})();
