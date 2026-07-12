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
    if (!st) return `${t.title.split(" - ").slice(0, 2).join(" · ")} · (reload tab)`;
    const parts = [st.page, st.ticker || "?", st.gex].filter(Boolean);
    if (st.options) parts.push(`opt:${st.options}`);
    if (st.greeks.length) parts.push(st.greeks.join("+"));
    if (st.collapsed) parts.push("collapsed");
    return parts.join(" · ");
  }));
  document.getElementById("tabs").innerHTML =
    rows.length ? rows.map((r) => `<div>${r}</div>`).join("") : "no gexbot tabs";
});

const sel = document.getElementById("panelScope");
chrome.storage.local.get("gexsync-cfg", (r) => { sel.value = r["gexsync-cfg"]?.panelScope || "page"; });
sel.addEventListener("change", () => chrome.storage.local.set({ "gexsync-cfg": { panelScope: sel.value } }));

// Replay sync config: { armed, master, heartbeat } — merge on write to keep master.
const armed = document.getElementById("replayArmed");
const track = document.getElementById("replayTrack");
const dbg = document.getElementById("replayDebug");
chrome.storage.local.get("replay-cfg", (r) => {
  const c = r["replay-cfg"] || {};
  armed.checked = !!c.armed;
  track.value = c.heartbeat === false ? "onpause" : "heartbeat";
  dbg.checked = !!c.debug;
});
const saveReplay = () => chrome.storage.local.get("replay-cfg", (r) =>
  chrome.storage.local.set({ "replay-cfg": { ...(r["replay-cfg"] || {}), armed: armed.checked, heartbeat: track.value === "heartbeat", debug: dbg.checked } }));
armed.addEventListener("change", saveReplay);
track.addEventListener("change", saveReplay);
dbg.addEventListener("change", saveReplay);
