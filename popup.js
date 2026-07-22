const count = (page) =>
  new Promise((r) => chrome.tabs.query({ url: `https://www.gexbot.com/${page}*` }, (t) => r(t.length)));

Promise.all([count("state"), count("classic")]).then(([state, classic]) => {
  const line = (label, n) => `${label}: <b>${n}</b> tab${n === 1 ? "" : "s"} synced`;
  document.getElementById("count").innerHTML =
    `${line("state", state)} · ${line("classic", classic)}`;
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
    if (!st) { const [ticker, page] = t.title.split(" - "); return `${pad("#?", 4)} · ${pad("?", 6)} · ${pad(ticker, 4)} · ${pad(page, 7)} · (reload tab)`; }
    const cols = `${pad("#" + (st.id || "?"), 4)} · ${pad(st.group || "?", 6)} · ${pad(st.ticker, 4)} · ${pad(st.page, 7)} · ${pad(st.gex || "", 6)}`;
    const extra = [];
    if (st.options) extra.push(`opt:${st.options}`);
    if (st.greeks.length) extra.push(st.greeks.join("+"));
    if (st.collapsed) extra.push("collapsed");
    return extra.length ? `${cols} · ${extra.join(" · ")}` : cols.trimEnd();
  }));
  document.getElementById("tabs").innerHTML =
    rows.length ? rows.map((r) => `<div>${r}</div>`).join("") : `<span class="muted">no gexbot tabs</span>`;
});

// Mode: profiles | ticker | replay (shared key read by content.js + replay.js)
const SESSION_KEY = "replay-session";
const idleSession = { phase: "idle", master: null, clients: [] };
// Regular US equity trading hours, tz-correct, no API (holidays ignored — a stray
// "are you sure" on a holiday is harmless). ponytail: add a holiday list only if it annoys.
function marketOpen(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  if (g("weekday") === "Sat" || g("weekday") === "Sun") return false;
  const mins = +g("hour") * 60 + +g("minute");
  return mins >= 570 && mins < 960; // 9:30 – 16:00 ET
}
const modeBtns = [...document.querySelectorAll("#modeSeg .seg-btn")];
let curMode = "profiles", sessionLocked = false;
const showMode = () => {
  // only the content panels toggle — the seg buttons also carry data-mode
  document.querySelectorAll("div[data-mode]").forEach((el) => { el.hidden = el.dataset.mode !== curMode; });
  modeBtns.forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === curMode ? "true" : "false"));
};
chrome.storage.local.get(["gexsync-mode", SESSION_KEY], (r) => {
  const m = r["gexsync-mode"];
  curMode = m === "replay" ? "replay" : m === "ticker" ? "ticker" : "profiles";
  sessionLocked = !!r[SESSION_KEY] && r[SESSION_KEY].phase !== "idle";
  showMode(); applyLock();
});
function selectMode(next) {
  if (next === curMode) return;
  // leaving Replay with a session running → confirm, then tear it down for all tabs
  if (curMode === "replay" && sessionLocked) {
    if (!confirm("Exit the active replay session? This unlocks every tab.")) return;
    chrome.storage.local.set({ [SESSION_KEY]: idleSession });
  }
  // entering Replay during market hours → confirm (replay is for past sessions)
  if (next === "replay" && marketOpen()) {
    if (!confirm("Market's open — replay is for reviewing past sessions. Enter replay anyway?")) return;
  }
  curMode = next;
  showMode();
  chrome.storage.local.set({ "gexsync-mode": next });
}
modeBtns.forEach((b) => b.addEventListener("click", () => selectMode(b.dataset.mode)));

const sel = document.getElementById("panelScope");
const wm = document.getElementById("watermark");
const zoomSel = document.getElementById("zoomMode");
chrome.storage.local.get("gexsync-cfg", (r) => { sel.value = r["gexsync-cfg"]?.panelScope || "all"; wm.checked = r["gexsync-cfg"]?.watermark !== false; zoomSel.value = r["gexsync-cfg"]?.zoomMode || "off"; });
const saveCfg = () => chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), panelScope: sel.value, watermark: wm.checked, zoomMode: zoomSel.value } }));
sel.addEventListener("change", saveCfg);
wm.addEventListener("change", saveCfg);
zoomSel.addEventListener("change", saveCfg);

// Replay settings — merge on write to keep master.
const track = document.getElementById("replayTrack");
const dbg = document.getElementById("replayDebug");
chrome.storage.local.get("replay-cfg", (r) => {
  const c = r["replay-cfg"] || {};
  track.value = c.heartbeat === false ? "onpause" : "heartbeat";
  dbg.checked = !!c.debug;
});
const saveReplay = () => chrome.storage.local.get("replay-cfg", (r) =>
  chrome.storage.local.set({ "replay-cfg": { ...(r["replay-cfg"] || {}), heartbeat: track.value === "heartbeat", debug: dbg.checked } }));
[track, dbg].forEach((el) => el.addEventListener("change", saveReplay));

// Lock every setting while a replay session is active; Mode stays the exit path.
function applyLock() {
  [sel, wm, zoomSel, track, dbg].forEach((el) => { el.disabled = sessionLocked; });
  document.getElementById("lockNote").hidden = !sessionLocked;
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local" || !c[SESSION_KEY]) return;
  sessionLocked = !!c[SESSION_KEY].newValue && c[SESSION_KEY].newValue.phase !== "idle";
  applyLock();
});

// One-click copy of the full plugin state (settings + tab roster) so it can be
// pasted verbatim. Click the "copy" chip or the roster box.
const copyBtn = document.getElementById("copyState");
async function stateSnapshot() {
  const v = chrome.runtime.getManifest().version;
  const sess = await new Promise((r) => chrome.storage.local.get(SESSION_KEY, (x) => r(x[SESSION_KEY])));
  const sessTxt = sess && sess.phase !== "idle"
    ? `${sess.phase} · master ${sess.master ? "#" + String(sess.master).slice(0, 3).toUpperCase() : "none"} · ${(sess.clients || []).length} client(s)`
    : "idle";
  const rows = [...document.querySelectorAll("#tabs > div")].map((d) => d.textContent);
  const count = (document.getElementById("count").textContent || "").replace(/\s+/g, " ").trim();
  return [
    `GexSync ${v} — state snapshot`,
    ``,
    `Mode: ${curMode}`,
    `Cross-page scope: ${sel.value}`,
    `Watermark: ${wm.checked ? "on" : "off"}`,
    `Zoom: ${zoomSel.value}`,
    `Replay session: ${sessTxt}`,
    `Replay play-tracking: ${track.value === "heartbeat" ? "heartbeat" : "on pause"}${dbg.checked ? " · debug" : ""}`,
    ``,
    `Tabs — ${count}`,
    `(columns: #id · group · ticker · page · profile · extras)`,
    ...(rows.length ? rows : ["(no gexbot tabs)"]),
  ].join("\n");
}
async function copyState() {
  const text = await stateSnapshot();
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} ta.remove(); }
  copyBtn.textContent = "copied ✓"; copyBtn.classList.add("done");
  setTimeout(() => { copyBtn.textContent = "⧉ copy"; copyBtn.classList.remove("done"); }, 1400);
}
copyBtn.addEventListener("click", copyState);
document.getElementById("tabs").addEventListener("click", copyState);
