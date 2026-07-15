const count = (page) =>
  new Promise((r) => chrome.tabs.query({ url: `https://www.gexbot.com/${page}*` }, (t) => r(t.length)));

Promise.all([count("state"), count("classic")]).then(([state, classic]) => {
  const line = (label, n) => `${label}: ${n} tab${n === 1 ? "" : "s"} synced`;
  document.getElementById("count").innerHTML =
    `${line("state", state)}<br>${line("classic", classic)}`;
});

// Per-tab state list. Ask each gexbot tab's content script for its state.
const ask = (id) =>
  new Promise((res) => chrome.tabs.sendMessage(id, "getState", (st) => res(chrome.runtime.lastError ? null : st)));

chrome.tabs.query({ url: "https://www.gexbot.com/*" }, async (tabs) => {
  const gex = tabs.filter((t) => /\/(state|classic)/.test(t.url));
  const rows = await Promise.all(gex.map(async (t) => {
    const st = await ask(t.id);
    // fixed-width columns so the id/ticker/page/profile line up in the mono list
    const pad = (s, n) => String(s ?? "?").padEnd(n); // ticker≤4, page "classic"=7, profile "latest"=6
    // title is "TICKER - page - profile"; id unknown until the script responds
    if (!st) { const [ticker, page] = t.title.split(" - "); return `${pad("#?", 4)} · ${pad(ticker, 4)} · ${pad(page, 7)} · (reload tab)`; }
    const cols = `${pad("#" + (st.id || "?"), 4)} · ${pad(st.ticker, 4)} · ${pad(st.page, 7)} · ${pad(st.gex || "", 6)}`;
    const extra = [];
    if (st.options) extra.push(`opt:${st.options}`);
    if (st.greeks.length) extra.push(st.greeks.join("+"));
    if (st.collapsed) extra.push("collapsed");
    return extra.length ? `${cols} · ${extra.join(" · ")}` : cols.trimEnd();
  }));
  document.getElementById("tabs").innerHTML =
    rows.length ? rows.map((r) => `<div>${r}</div>`).join("") : "no gexbot tabs";
});

// Mode: live | replay (shared key read by content.js + replay.js)
const modeSel = document.getElementById("modeSel");
const showMode = () => document.querySelectorAll("[data-mode]").forEach((el) => { el.hidden = el.dataset.mode !== modeSel.value; });
chrome.storage.local.get("gexsync-mode", (r) => { const m = r["gexsync-mode"]; modeSel.value = m === "replay" ? "replay" : m === "ticker" ? "ticker" : "profiles"; showMode(); });
modeSel.addEventListener("change", () => { showMode(); chrome.storage.local.set({ "gexsync-mode": modeSel.value }); });

const sel = document.getElementById("panelScope");
const wm = document.getElementById("watermark");
chrome.storage.local.get("gexsync-cfg", (r) => { sel.value = r["gexsync-cfg"]?.panelScope || "page"; wm.checked = r["gexsync-cfg"]?.watermark !== false; });
const saveCfg = () => chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), panelScope: sel.value, watermark: wm.checked } }));
sel.addEventListener("change", saveCfg);
wm.addEventListener("change", saveCfg);

// Replay settings — merge on write to keep master.
const track = document.getElementById("replayTrack");
const dbg = document.getElementById("replayDebug");
const scope = document.getElementById("replayScope");
const auto = document.getElementById("replayAutoRestart");
chrome.storage.local.get("replay-cfg", (r) => {
  const c = r["replay-cfg"] || {};
  track.value = c.heartbeat === false ? "onpause" : "heartbeat";
  dbg.checked = !!c.debug;
  scope.value = c.scope === "all" ? "all" : "page";
  auto.checked = !!c.autorestart;
});
const saveReplay = () => chrome.storage.local.get("replay-cfg", (r) =>
  chrome.storage.local.set({ "replay-cfg": { ...(r["replay-cfg"] || {}), heartbeat: track.value === "heartbeat", debug: dbg.checked, scope: scope.value, autorestart: auto.checked } }));
[track, dbg, scope, auto].forEach((el) => el.addEventListener("change", saveReplay));
