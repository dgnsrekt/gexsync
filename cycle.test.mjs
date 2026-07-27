// Self-check for the watchlist prev/next math. Run: node cycle.test.mjs
// Mirrors cycleTargets() in content.js — keep in sync.
import assert from "node:assert/strict";

const targets = (watchlist, cur) => {
  const n = watchlist.length;
  if (n < 2) return null;
  const i = watchlist.indexOf(cur);
  return {
    prev: i === -1 ? watchlist[n - 1] : watchlist[(i - 1 + n) % n],
    next: i === -1 ? watchlist[0] : watchlist[(i + 1) % n],
  };
};
const wl = ["AMD", "NVDA", "TSLA"];
assert.deepEqual(targets(wl, "AMD"), { prev: "TSLA", next: "NVDA" }, "first wraps back to last");
assert.deepEqual(targets(wl, "NVDA"), { prev: "AMD", next: "TSLA" }, "middle");
assert.deepEqual(targets(wl, "TSLA"), { prev: "NVDA", next: "AMD" }, "last wraps to first");
assert.deepEqual(targets(wl, "SPY"), { prev: "TSLA", next: "AMD" }, "off-list steps in from the ends");
assert.equal(targets(["AMD"], "AMD"), null, "1-item list → no cycle");
assert.equal(targets([], "AMD"), null, "empty → no cycle");
console.log("watchlist cycle: all OK");
