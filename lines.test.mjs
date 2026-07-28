// Self-check for the per-ticker line store transforms. Run: node lines.test.mjs
// Mirrors addLine / removeLine / clearLines / clearAllLines in content.js — keep in sync.
import assert from "node:assert/strict";

// pure reducers (content.js versions also write storage + the render node)
const addLine = (store, ticker, o) => {
  if (!ticker || !o || typeof o.price !== "number" || !isFinite(o.price)) return { store, res: { ok: false, error: "bad-price" } };
  if (o.shape && o.shape !== "horizontal_line") return { store, res: { ok: false, error: "unsupported-shape" } };
  const id = o._id || "x"; // deterministic id for the test
  const line = { id, shape: "horizontal_line", points: [{ time: o.time ?? null, price: o.price }], text: o.text ?? null,
    overrides: { linecolor: "#16E0A3", linewidth: 1, linestyle: "dashed", ...(o.overrides || {}) } };
  return { store: { ...store, [ticker]: [...(store[ticker] || []), line] }, res: { ok: true, id, ticker } };
};
const removeLine = (store, ticker, id) => {
  if (!store[ticker]) return store;
  const kept = store[ticker].filter((l) => l.id !== id);
  const n = { ...store }; if (kept.length) n[ticker] = kept; else delete n[ticker];
  return n;
};
const clearLines = (store, ticker) => { const n = { ...store }; delete n[ticker]; return n; };

let s = {};
// add is per-ticker and appends
s = addLine(s, "TSLA", { price: 250, _id: "a" }).store;
s = addLine(s, "TSLA", { price: 245.5, _id: "b" }).store;
s = addLine(s, "INTC", { price: 34, _id: "c" }).store;
assert.equal(s.TSLA.length, 2, "two TSLA lines");
assert.equal(s.INTC.length, 1, "one INTC line");
assert.deepEqual(s.TSLA[0].points, [{ time: null, price: 250 }], "TV-shaped point");
assert.equal(s.TSLA[0].overrides.linecolor, "#16E0A3", "default mint");
assert.equal(s.TSLA[0].shape, "horizontal_line", "shape stamped");

// guards
assert.equal(addLine(s, "TSLA", { price: NaN }).res.error, "bad-price", "NaN rejected");
assert.equal(addLine(s, "", { price: 1 }).res.error, "bad-price", "empty ticker rejected");
assert.equal(addLine(s, "TSLA", { price: 1, shape: "trend_line" }).res.error, "unsupported-shape", "non-horizontal rejected");

// remove drops the line; removing the last one drops the ticker key entirely
s = removeLine(s, "TSLA", "a");
assert.equal(s.TSLA.length, 1, "one TSLA line left");
s = removeLine(s, "INTC", "c");
assert.ok(!("INTC" in s), "empty ticker key removed");

// clear a ticker
s = clearLines(s, "TSLA");
assert.ok(!("TSLA" in s), "TSLA cleared");
assert.deepEqual(s, {}, "store empty after clears");

console.log("line store: all OK");
