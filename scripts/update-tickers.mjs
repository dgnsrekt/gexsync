// Refresh (or --check) the packaged tickers.json from GEXbot's /tickers endpoint.
//   node scripts/update-tickers.mjs          → fetch + rewrite tickers.json
//   node scripts/update-tickers.mjs --check  → fetch + diff; exit 1 if drifted
// The daily GitHub Action runs --check so the endpoint is hit once a day, not per
// test run. When it flags drift, run the bare command locally and commit the file.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../tickers.json", import.meta.url));
const URL_ = "https://api.gexbot.com/tickers";

// One normalizer for both write and check, so a clean fetch always byte-matches
// the committed file: fixed key order, sorted symbols, 2-space indent + newline.
const normalize = (j) => JSON.stringify({
  stocks: [...(j.stocks || [])].sort(),
  indexes: [...(j.indexes || [])].sort(),
  futures: [...(j.futures || [])].sort(),
}, null, 2) + "\n";

const live = normalize(await fetch(URL_).then((r) => {
  if (!r.ok) throw new Error(`GET /tickers → ${r.status}`);
  return r.json();
}));

if (process.argv.includes("--check")) {
  const have = await readFile(OUT, "utf8").catch(() => "");
  if (have === live) { console.log("tickers.json is current ✓"); process.exit(0); }
  console.error("tickers.json is STALE — GEXbot's list changed. Run:\n  node scripts/update-tickers.mjs\nand commit tickers.json.");
  process.exit(1);
}

await writeFile(OUT, live);
console.log("wrote tickers.json");
