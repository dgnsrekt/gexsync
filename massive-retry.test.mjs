// Self-check for the Massive soft/hard failure gate. Run: node massive-retry.test.mjs
// Mirrors MV_SOFT / mvFail() / mvFresh() in content.js — keep in sync if those change.
const MV_SOFT = /^(rate limited|network error|fetch failed|HTTP 5\d\d)$/;
const MV_COOL_MS = 20000;
const mvFail = (e) => { const error = e || "fetch failed"; return { error, retry: MV_SOFT.test(error) ? Date.now() + MV_COOL_MS : 0 }; };
const mvFresh = (v) => !!v && !(v.retry && Date.now() > v.retry);

const eq = (a, b, what) => { if (a !== b) { console.error(`FAIL ${what}: got ${a}, want ${b}`); process.exit(1); } };

// nothing cached -> fetch
eq(mvFresh(undefined), false, "empty cache");
// a success has no retry field -> never re-fetched
eq(mvFresh({ name: "SPDR S&P 500" }), true, "success");
// hard failures stick: re-asking can't change the answer
for (const e of ["bad API key", "not found", "no data", "not entitled", "no API key", "HTTP 404"])
  eq(mvFresh(mvFail(e)), true, `hard: ${e}`);
// soft failures are fresh during the cooldown, stale after -> the tick re-asks
for (const e of ["rate limited", "network error", "fetch failed", "HTTP 503", undefined]) {
  const v = mvFail(e);
  eq(mvFresh(v), true, `soft now: ${e}`);
  eq(mvFresh({ ...v, retry: Date.now() - 1 }), false, `soft lapsed: ${e}`);
}
console.log("massive retry gate: all OK");
