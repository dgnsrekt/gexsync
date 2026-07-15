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
    // title is "TICKER - page - profile"; id unknown until the script responds
    if (!st) { const [ticker, page] = t.title.split(" - "); return `#? · ${ticker || "?"} · ${page || "?"} · (reload tab)`; }
    const parts = [`#${st.id || "?"}`, st.ticker || "?", st.page, st.gex].filter(Boolean);
    if (st.options) parts.push(`opt:${st.options}`);
    if (st.greeks.length) parts.push(st.greeks.join("+"));
    if (st.collapsed) parts.push("collapsed");
    return parts.join(" · ");
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
