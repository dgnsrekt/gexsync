// Self-check for the ApeWisdom page merge + rank arrow. Run: node buzz.test.mjs
// Mirrors awMerge() in background.js and bzArrow() in content.js — keep in sync.
function awMerge(pages) {
  const map = new Map();
  for (const j of pages) for (const r of (j && j.results) || []) {
    const t = String(r.ticker || "").toUpperCase();
    if (!t || map.has(t)) continue;
    map.set(t, { rank: r.rank, mentions: r.mentions, upvotes: r.upvotes, rank24: r.rank_24h_ago ?? null, mentions24: r.mentions_24h_ago ?? null });
  }
  return map;
}
const bzArrow = (d) => {
  if (d.rank24 == null) return "";
  const n = d.rank24 - d.rank;
  return n > 0 ? ` · ↑${n}` : n < 0 ? ` · ↓${-n}` : " · =";
};
const awBase = (v) => String(v || "").match(/^[A-Za-z0-9.]+/)?.[0].toUpperCase() || null;
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

const eq = (a, b, what) => { if (a !== b) { console.error(`FAIL ${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); process.exit(1); } };

// shape taken from a live call on 2026-07-25
const page1 = { count: 860, pages: 9, current_page: 1, results: [
  { rank: 1, ticker: "SPY", name: "SPDR S&amp;P 500 ETF Trust", mentions: 83, upvotes: 381, rank_24h_ago: 2, mentions_24h_ago: 365 },
  { rank: 7, ticker: "TSLA", name: "Tesla", mentions: 46, upvotes: 232, rank_24h_ago: 7, mentions_24h_ago: 232 },
  { rank: 9, ticker: "qqq", name: "Invesco QQQ", mentions: 36, upvotes: 153, rank_24h_ago: 4, mentions_24h_ago: 153 },
] };
const page2 = { results: [
  { rank: 140, ticker: "IONQ", name: "IonQ", mentions: 2, upvotes: 9, rank_24h_ago: null, mentions_24h_ago: null },
  { rank: 141, ticker: "SPY", name: "dupe that must not overwrite page 1", mentions: 999, upvotes: 0 },
  { rank: 142, ticker: "", name: "blank ticker, skipped", mentions: 1 },
] };

const m = awMerge([page1, page2, null]); // a failed later page arrives as null
eq(m.size, 4, "merged size");                       // SPY, TSLA, QQQ, IONQ — blank dropped
eq(m.get("QQQ").rank, 9, "lowercased ticker upcased");
eq(m.get("SPY").mentions, 83, "page 1 wins over a later dupe");
eq(m.get("SPY").mentions24, 365, "prior mentions kept");
eq(m.get("IONQ").rank24, null, "missing rank_24h_ago -> null");
eq(m.get("IONQ").mentions24, null, "missing mentions_24h_ago -> null");
eq(m.has(""), false, "blank ticker never stored");
eq(awMerge([]).size, 0, "no pages -> empty");
eq(awMerge([{ results: null }]).size, 0, "null results -> empty");

// a SMALLER rank is better, so rank24 - rank > 0 means it climbed
eq(bzArrow({ rank: 1, rank24: 2 }), " · ↑1", "climbed");
eq(bzArrow({ rank: 9, rank24: 4 }), " · ↓5", "fell");
eq(bzArrow({ rank: 7, rank24: 7 }), " · =", "unchanged");
eq(bzArrow({ rank: 140, rank24: null }), "", "no prior rank -> no arrow");
// getState reports the raw ticker input, "⇒" suffix and all when futures are toggled
eq(awBase("SPY"), "SPY", "plain ticker");
eq(awBase("spy"), "SPY", "lowercase upcased");
eq(awBase("SPX ⇒ ES"), "SPX", "futures suffix stripped");
eq(awBase("BRK.B"), "BRK.B", "dot kept");
eq(awBase(""), null, "empty -> null");
eq(awBase(null), null, "null -> null");
eq(awBase("⇒"), null, "no leading symbol -> null");

// rank among the tickers you have open. m: SPY #1, TSLA #7, QQQ #9, IONQ #140
const open = (...t) => new Set(t);
eq(JSON.stringify(awRankAmong(m, "SPY", open("SPY", "TSLA", "QQQ"))), '{"rank":1,"of":3}', "best of three");
eq(JSON.stringify(awRankAmong(m, "QQQ", open("SPY", "TSLA", "QQQ"))), '{"rank":3,"of":3}', "worst of three");
eq(JSON.stringify(awRankAmong(m, "TSLA", open("SPY", "TSLA", "QQQ"))), '{"rank":2,"of":3}', "middle of three");
eq(JSON.stringify(awRankAmong(m, "SPY", open("SPY"))), '{"rank":1,"of":1}', "alone -> 1 of 1 (caller hides it)");
// an unranked open tab can't outrank a ranked one, but it still counts as one you have open
eq(JSON.stringify(awRankAmong(m, "TSLA", open("TSLA", "GME", "PLTR"))), '{"rank":1,"of":3}', "unranked peers sort below");
// the current ticker being unranked means there's no position to claim
eq(JSON.stringify(awRankAmong(m, "GME", open("GME", "SPY"))), '{"rank":null,"of":2}', "unranked self -> null");
console.log("buzz merge + arrow + universe rank: all OK");
