// ponytail: MAIN-world reader — GEXbot's replay dataset (one row per slider
// index, each carrying an epoch `timestamp`) lives in a React component's props,
// invisible to the isolated content script. This finds it and republishes the
// index→timestamp array via a shared DOM node, so replay.js can build its
// index↔time map INSTANTLY instead of scrubbing the slider 44× (which had to be
// serialized across tabs to avoid freezing the browser). No app logic.
(() => {
  if (window.__gexsyncReplayData) return;
  window.__gexsyncReplayData = 1;

  const NODE_ID = "__gxReplayTS";
  const holder = () => {
    let n = document.getElementById(NODE_ID);
    if (!n) {
      n = document.createElement("div"); // inert data holder; hidden, never rendered
      n.id = NODE_ID;
      n.style.display = "none";
      (document.documentElement || document).appendChild(n);
    }
    return n;
  };
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$")) return el[k]; return null; };

  // Locate the props array of length slider.max+1 whose rows carry `timestamp`.
  // Name-independent (component is minified): match by shape, not by class name.
  let cached = null; // cache the fiber node; its memoizedProps updates in place across renders
  function findArr(N) {
    if (cached) {
      const a = cached.memoizedProps && cached.memoizedProps.arr;
      if (Array.isArray(a) && a.length === N + 1 && a[0] && a[0].timestamp != null) return a;
      cached = null;
    }
    const s = document.querySelector("input[type=range]");
    const f = s && fiberOf(s);
    if (!f) return null;
    let top = f, g = 0; while (top.return && g++ < 300) top = top.return;
    const stack = [top], seen = new Set(); let v = 0;
    while (stack.length && v++ < 20000) {
      const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n);
      const p = n.memoizedProps;
      if (p && Array.isArray(p.arr) && p.arr.length === N + 1 && p.arr[0] && p.arr[0].timestamp != null) { cached = n; return p.arr; }
      if (n.child) stack.push(n.child);
      if (n.sibling) stack.push(n.sibling);
    }
    return null;
  }

  let sig = "";
  function tick() {
    const s = document.querySelector("input[type=range]");
    const N = s ? +s.max : 0;
    if (!s || N < 2) return; // no loaded replay yet
    const arr = findArr(N);
    if (!arr) return;
    const first = arr[0].timestamp, last = arr[N].timestamp;
    const nextSig = N + ":" + first + ":" + last;
    if (nextSig === sig) return; // unchanged — don't republish
    sig = nextSig;
    const ts = new Array(N + 1);
    for (let i = 0; i <= N; i++) ts[i] = arr[i].timestamp;
    holder().textContent = JSON.stringify(ts);
    window.dispatchEvent(new CustomEvent("gexsync-replaymap")); // signal only; data is in the node
  }
  setInterval(tick, 1000);
})();
