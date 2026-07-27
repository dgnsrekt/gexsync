// Offline shape check for the packaged tickers.json. Run: node tickers.test.mjs
// Never touches the network — the daily GitHub Action does the live drift check
// (scripts/update-tickers.mjs --check). This just guards the file isn't broken.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const j = JSON.parse(await readFile(fileURLToPath(new URL("./tickers.json", import.meta.url)), "utf8"));

for (const k of ["stocks", "indexes", "futures"]) {
  assert(Array.isArray(j[k]), `${k} is an array`);
  assert(j[k].every((s) => typeof s === "string" && s === s.toUpperCase() && s.length), `${k} are non-empty upper-case strings`);
}
assert(j.stocks.length + j.indexes.length >= 2, "at least 2 cyclable tickers"); // watchlist needs 2+
// sorted + de-duped, so the popup datalist and cycle order are stable
for (const k of ["stocks", "indexes", "futures"]) {
  assert.deepEqual(j[k], [...new Set(j[k])].sort(), `${k} is sorted and unique`);
}
console.log("tickers.json shape: OK");
