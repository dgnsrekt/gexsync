// This worker does a few jobs and otherwise stays asleep:
//   1. group-shot downloads — routes a zip into Downloads/gexsync/ (content scripts
//      can't call chrome.downloads; the anchor `download` attr flattens "/" → "_").
//   2. chart data add-ons — EVERY outbound fetch in GexSync lives here, so an API key
//      never rides in a script injected onto gexbot.com, and one cache serves all panes.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "gexsync-download" && msg.url && msg.filename) {
    chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: false }, (id) => {
      const err = chrome.runtime.lastError;
      reply({ ok: !err && id != null, err: err && err.message });
    });
    return true; // async reply
  }
  if (msg.type === "gexsync-massive" && msg.ticker) { // Massive.com ticker fundamentals
    massiveTicker(msg.ticker).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
  if (msg.type === "gexsync-massive-prevday" && msg.ticker && msg.ref) { // prev trading day OHLCV
    massivePrevDay(msg.ticker, msg.ref).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
  if (msg.type === "gexsync-buzz" && msg.ticker) { // ApeWisdom Reddit mentions (keyless)
    buzzTicker(msg.ticker).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
  if (msg.type === "gexsync-buzz-uni" && msg.ticker) { // …ranked against your OPEN tickers
    buzzUniverse(msg.ticker).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
  if (msg.type === "gexsync-gexbot-majors" && msg.ticker) { // GEXbot major levels for the TV overlay (classic/state × package, per msg.need + msg.cat)
    gexbotMajors(msg.ticker, msg.need, msg.cat).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
  if (msg.type === "gexsync-gexbot-tickers") { // GEXbot ticker universe (keyless)
    gexbotTickers().then(reply).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true; // async reply
  }
});

// ---- Massive.com (Polygon) ticker fundamentals -----------------------------
// The key lives only in chrome.storage.local and is read HERE, in the worker, so
// it never rides in a script injected onto gexbot.com. host_permissions covers
// api.massive.com, so the worker's fetch isn't subject to page CORS/CSP.
const MASSIVE_KEY = "gexsync-massive";
const mvHot = new Map();          // TICKER -> { res, day } — successes only
const mvInflight = new Map();     // TICKER -> Promise<res> — coalesce concurrent panes
// Today's date in market time (ET), "YYYY-MM-DD". The overview's market_cap is
// close-price based, so fundamentals don't move intraday — cache per trading day
// and let the ET date rollover refresh them.
const mvToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// One shared cache + in-flight map for ALL panes (the worker is the single context
// they route through): Ticker mode putting 6 panes on SPY at once = ONE call, not
// six, and every request for that ticker for the rest of the ET day = zero calls.
async function massiveTicker(raw) {
  const t = String(raw).replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!t) return { ok: false, error: "no ticker" };
  const hot = mvHot.get(t);
  if (hot && hot.day === mvToday()) return hot.res;         // already fetched today → no call
  if (mvInflight.has(t)) return mvInflight.get(t);          // a pane is already fetching it → share
  const p = massiveFetch(t).then((res) => {
    if (res.ok) mvHot.set(t, { res, day: mvToday() });      // cache successes; errors stay retryable
    mvInflight.delete(t);
    return res;
  }, (e) => { mvInflight.delete(t); return { ok: false, error: String(e && e.message || e) }; });
  mvInflight.set(t, p);
  return p;
}

async function massiveFetch(t) {
  const cfg = await new Promise((r) => chrome.storage.local.get(MASSIVE_KEY, (x) => r(x[MASSIVE_KEY] || null)));
  if (!cfg || !cfg.key) return { ok: false, error: "no API key" };
  let resp;
  try {
    resp = await fetch(`https://api.massive.com/v3/reference/tickers/${encodeURIComponent(t)}`, {
      headers: { Authorization: "Bearer " + cfg.key },
    });
  } catch { return { ok: false, error: "network error" }; }
  if (resp.status === 401 || resp.status === 403) return { ok: false, error: "bad API key" };
  if (resp.status === 429) return { ok: false, error: "rate limited" };
  if (resp.status === 404) return { ok: false, error: "not found" };
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
  const j = await resp.json().catch(() => null);
  const r = j && j.results;
  if (!r) return { ok: false, error: "no data" };
  return { ok: true, data: {
    name: r.name || null,
    exch: r.primary_exchange || null,
    mcap: r.market_cap ?? null,        // equity-only; null for ETFs/indices
    sh: r.weighted_shares_outstanding ?? null, // equity-only
    type: r.type || null,              // "CS", "ETF", "INDEX", … — shown when there's no mkt cap
    desc: r.description || null,
    ccy: r.currency_name || null,
  } };
}

// ---- GEXbot: CLASSIC/LATEST major levels for the TradingView overlay --------
// The public quant API (Bearer key), NOT the app.gexbot.com UI backend. host_permissions
// covers api.gex.bot, so the worker's fetch isn't subject to the TradingView page's CORS/CSP.
// Full-chain endpoint /{ticker}/{src}/{cat} (NOT /majors) — carries the same levels PLUS
// min_dte/sec_min_dte, which /majors lacks. We read only the top-level fields (ignore strikes).
const GEXBOT_KEY = "gexsync-gexbot";
const GEXBOT_BASE = "https://api.gex.bot";
let gxTickersHot = null; // GEXbot ticker universe — read once from the packaged tickers.json
// Dedupe per (ticker, source, category): a short cache + in-flight coalescing so several
// TradingView windows on the same ticker (their :00/:30 marks fire together) share ONE call each
// instead of hammering the key. Keyed "TICKER:src:cat" so classic/state AND each package
// (latest/next/90d) cache independently — switching package can't reuse the other's data.
const gxHot = new Map();      // "TICKER:src:cat" -> { res, at }
const gxInflight = new Map(); // "TICKER:src:cat" -> Promise
const GX_TTL = 500;          // 0.5s anti-stampede only (in-flight coalescing dedups simultaneous
                             // multi-window calls); low enough that a 1s/5s refresh actually refetches
async function pkgMajors(t, src, cat) {
  const k = t + ":" + src + ":" + cat;
  const hot = gxHot.get(k);
  if (hot && Date.now() - hot.at < GX_TTL) return hot.res;
  if (gxInflight.has(k)) return gxInflight.get(k);
  const p = pkgFetch(t, src, cat).then((res) => {
    if (res.levels) gxHot.set(k, { res, at: Date.now() });   // cache successes only; errors stay retryable
    gxInflight.delete(k);
    return res;
  }, (e) => { gxInflight.delete(k); return { levels: null, error: String(e && e.message || e) }; });
  gxInflight.set(k, p);
  return p;
}
// One full-chain call for a source (classic|state) at a category (gex_zero=latest, gex_one=next,
// gex_full=90d). Shape { zero_gamma, major_pos_vol, major_neg_vol, spot, min_dte, sec_min_dte, ... }.
async function pkgFetch(t, src, cat) {
  const cfg = await new Promise((r) => chrome.storage.local.get(GEXBOT_KEY, (x) => r(x[GEXBOT_KEY] || null)));
  if (!cfg || !cfg.key) return { levels: null, error: "no API key" };
  let resp;
  try {
    resp = await fetch(`${GEXBOT_BASE}/${encodeURIComponent(t)}/${src}/${cat}`, {
      headers: { Authorization: "Bearer " + cfg.key, Accept: "application/json" },
    });
  } catch { return { levels: null, error: "network error" }; }
  if (resp.status === 401 || resp.status === 403) return { levels: null, error: "bad key" };
  if (resp.status === 429) return { levels: null, error: "rate limited" };
  if (resp.status === 404) return { levels: null, error: "not found" };
  if (!resp.ok) return { levels: null, error: `HTTP ${resp.status}` };
  const j = await resp.json().catch(() => null);
  if (!j) return { levels: null, error: "no data" };
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  // strikes tuple is [strike, netGEX_vol, netGEX_oi, [5 prior vol readings]] — keep a compact
  // [strike, vol, priors[]] for the histogram (OI unused → dropped to shrink the payload).
  const strikes = Array.isArray(j.strikes) ? j.strikes.map((s) => [s[0], s[1], Array.isArray(s[3]) ? s[3] : []]) : null;
  // max_priors rows [1..5] = [1m,5m,10m,15m,30m], each [strike, value-in-MM] (row 0 is an extra window
  // GEXbot doesn't display). num-guard everything so a field the endpoint omits degrades to null, not a crash.
  const maxChg = Array.isArray(j.max_priors) ? j.max_priors.slice(1, 6).map((p) => [num(p[0]), num(p[1])]) : null;
  return { levels: { zeroGamma: num(j.zero_gamma), majorPos: num(j.major_pos_vol), majorNeg: num(j.major_neg_vol), spot: num(j.spot), minDte: num(j.min_dte), secDte: num(j.sec_min_dte), strikes,
    posOi: num(j.major_pos_oi), negOi: num(j.major_neg_oi), netVol: num(j.sum_gex_vol), netOi: num(j.sum_gex_oi), ts: num(j.timestamp), maxChg }, error: null };
}
// Fetch the requested sources (classic and/or state — only what's toggled on) at the chosen
// package category. cat: gex_zero=latest (nearest expiry, not literally 0dte — VIX has its own
// calendar), gex_one=next, gex_full=90d. Defaults to latest.
async function gexbotMajors(raw, need, cat) {
  const t = String(raw).replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!t) return { ok: false, error: "no ticker" };
  need = need || { classic: true, state: false };
  cat = ["gex_zero", "gex_one", "gex_full"].includes(cat) ? cat : "gex_zero";
  const [c, s] = await Promise.all([
    need.classic ? pkgMajors(t, "classic", cat) : null,
    need.state ? pkgMajors(t, "state", cat) : null,
  ]);
  const err = (c && c.error) || (s && s.error) || null;
  const lv = (c && c.levels) || (s && s.levels) || null; // DTE is per-ticker, same on both sources
  const dte = lv ? { min: lv.minDte, sec: lv.secDte } : null;
  return { ok: true, data: { classic: c ? c.levels : null, state: s ? s.levels : null, dte }, err };
}
async function gexbotTickers() {
  if (gxTickersHot) return { ok: true, tickers: gxTickersHot }; // packaged list — no network, read once
  let j;
  // tickers.json is GEXbot's own /tickers list ({ stocks, indexes, futures }), bundled with the
  // extension (same source the popup's watchlist uses) — no API call to know the universe.
  try { j = await fetch(chrome.runtime.getURL("tickers.json")).then((r) => r.json()); }
  catch { return { ok: false, error: "no ticker list" }; }
  const list = [].concat(j.stocks || [], j.indexes || [], j.futures || []).map((s) => String(s).toUpperCase());
  if (!list.length) return { ok: false, error: "empty ticker list" };
  gxTickersHot = list;
  return { ok: true, tickers: list };
}

// ---- Massive previous trading day OHLCV -------------------------------------
// Previous completed trading day relative to a reference date (GEXbot's update
// date — replay/live aware). Weekend/holiday aware for free: daily aggregates
// only exist for real trading days, so we take the newest bar in a window ending
// the day BEFORE the reference date. Cached per (ticker, ref); concurrent panes
// coalesced. 403 for indices (aggregates are equities/ETF only on this plan).
const mvPrevHot = new Map();       // "TICKER|REF" -> res
const mvPrevInflight = new Map();
const mvAddDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mvETDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));

async function massivePrevDay(rawT, ref) {
  const t = String(rawT).replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!t) return { ok: false, error: "no ticker" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ref)) return { ok: false, error: "bad ref date" };
  const key = t + "|" + ref;
  if (mvPrevHot.has(key)) return mvPrevHot.get(key);          // a past trading day never changes → cache forever
  if (mvPrevInflight.has(key)) return mvPrevInflight.get(key);
  const p = massivePrevDayFetch(t, ref).then((res) => {
    if (res.ok) mvPrevHot.set(key, res);
    mvPrevInflight.delete(key);
    return res;
  }, (e) => { mvPrevInflight.delete(key); return { ok: false, error: String(e && e.message || e) }; });
  mvPrevInflight.set(key, p);
  return p;
}

async function massivePrevDayFetch(t, ref) {
  const cfg = await new Promise((r) => chrome.storage.local.get(MASSIVE_KEY, (x) => r(x[MASSIVE_KEY] || null)));
  if (!cfg || !cfg.key) return { ok: false, error: "no API key" };
  const to = mvAddDays(ref, -1), from = mvAddDays(ref, -10); // strictly before ref; 10d covers any weekend+holiday
  let resp;
  try {
    resp = await fetch(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(t)}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=1`, {
      headers: { Authorization: "Bearer " + cfg.key },
    });
  } catch { return { ok: false, error: "network error" }; }
  if (resp.status === 401) return { ok: false, error: "bad API key" };
  // 403 is a REACHABLE, meaningful case on the free plan, not just an index: verified
  // 2026-07-25, a ref date ~3 years back returns 403 (past the 2-year window), not an
  // empty result. So it must not be conflated with a bad key.
  if (resp.status === 403) return { ok: false, error: "not entitled" };
  if (resp.status === 429) return { ok: false, error: "rate limited" };
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
  const j = await resp.json().catch(() => null);
  const b = j && j.results && j.results[0];
  if (!b) return { ok: false, error: "no data" };
  return { ok: true, data: { date: mvETDate(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } };
}

// The GEXbot sync tabs, and their live state. Used by the Reddit ranking below and by
// External control at the bottom of the file — kept up here so that block can be
// removed without taking these with it.
const GEX_MATCHES = ["https://www.gexbot.com/state*", "https://www.gexbot.com/classic*"];

// Query every GEXbot sync tab's live state (same "getState" the popup uses).
function gexTabStates() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: GEX_MATCHES }, async (tabs) => {
      const states = await Promise.all(tabs.map((t) => new Promise((r) =>
        chrome.tabs.sendMessage(t.id, "getState", (s) => r(chrome.runtime.lastError || !s ? null : { ...s, tabId: t.id })))));
      resolve(states.filter(Boolean));
    });
  });
}

// ---- ApeWisdom Reddit mentions (keyless) ------------------------------------
// No key and no signup, but the ranked list is paged 100 at a time and sorted by
// mentions, so the quiet half of the GEXbot universe sits past page 1 (checked
// 2026-07-25: SPY/TSLA/QQQ/NVDA were top-100, PLTR/COIN/IONQ/GME were not). Pull the
// top AW_PAGES pages into one ticker->row map. ApeWisdom updates hourly, so cache per
// ET hour: after the first pane fetches, every pane and every ticker is free until the
// hour rolls. Fetched here in the worker because apewisdom.io sends no CORS header.
// ponytail: 3 pages / top 300, not all 9 — below #300 there's nothing worth badging.
// Raise AW_PAGES if universe names start coming back unranked.
const AW_PAGES = 3;
const AW_URL = (n) => `https://apewisdom.io/api/v1.0/filter/all-stocks/page/${n}`;
const awHour = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).format(new Date());
let awHot = null;      // { map, hour } — successes only
let awInflight = null; // Promise<Map> — coalesce concurrent panes

async function buzzTicker(raw) {
  const t = String(raw).replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!t) return { ok: false, error: "no ticker" };
  let map;
  try { map = await awMap(); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  const row = map.get(t);
  // Unranked is a RESULT, not a failure: "nobody's talking about this one" is worth
  // showing, and it must not land in the caller's retry path.
  return { ok: true, data: row ? { ...row, of: map.size } : { rank: null, of: map.size } };
}

async function awMap() {
  const hour = awHour();
  if (awHot && awHot.hour === hour) return awHot.map;
  if (awInflight) return awInflight;
  awInflight = awFetchPages().then((map) => {
    awHot = { map, hour };
    awInflight = null;
    return map;
  }, (e) => { awInflight = null; throw e; });
  return awInflight;
}

// Pages in parallel (keyless, no rate limit to respect). Page order decides ties, so
// merge in order and let the first hit win — a ticker only appears once anyway.
// A later page failing is survivable; page 1 failing is not.
async function awFetchPages() {
  const pages = await Promise.all(Array.from({ length: AW_PAGES }, (_, i) =>
    fetch(AW_URL(i + 1)).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (!pages[0]) throw new Error("network error");
  const map = awMerge(pages);
  if (!map.size) throw new Error("no data");
  return map;
}

// Where the current ticker sits among the tickers you actually have open. The map is
// already in memory from the badge above, and the worker already knows every sync tab
// (gexTabStates, used by external control), so this costs no network call at all —
// which is why it's part of the same toggle rather than its own.
// The open tabs are a better "universe" than a hardcoded 60: it's whatever you're
// watching right now.
async function buzzUniverse(raw) {
  const t = String(raw).replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!t) return { ok: false, error: "no ticker" };
  let map;
  try { map = await awMap(); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  const states = await gexTabStates();
  const tickers = new Set([t]);
  for (const s of states) { const b = awBase(s.ticker); if (b) tickers.add(b); }
  return { ok: true, data: awRankAmong(map, t, tickers) };
}

// getState reports the raw ticker input, which carries a "⇒" suffix when the futures
// toggle is on — so take the leading symbol run, matching content.js's baseTicker().
const awBase = (v) => String(v || "").match(/^[A-Za-z0-9.]+/)?.[0].toUpperCase() || null;

// Pure, so buzz.test.mjs can check it. Unranked names sort to the bottom (they're
// outside the top ~300, so they can't outrank a ranked one) and `null` means the
// current ticker itself is unranked — nothing worth claiming a position with.
function awRankAmong(map, t, tickers) {
  const mine = map.get(t);
  if (!mine) return { rank: null, of: tickers.size };
  let rank = 1;
  for (const o of tickers) {
    if (o === t) continue;
    const r = map.get(o);
    if (r && r.rank < mine.rank) rank++;
  }
  return { rank, of: tickers.size };
}

// Kept separate + pure so buzz.test.mjs can check it. `name` is deliberately dropped:
// it's the only field carrying HTML entities ("S&amp;P"), and we render the ticker.
function awMerge(pages) {
  const map = new Map();
  for (const j of pages) for (const r of (j && j.results) || []) {
    const t = String(r.ticker || "").toUpperCase();
    if (!t || map.has(t)) continue;
    map.set(t, { rank: r.rank, mentions: r.mentions, upvotes: r.upvotes, rank24: r.rank_24h_ago ?? null, mentions24: r.mentions_24h_ago ?? null });
  }
  return map;
}
