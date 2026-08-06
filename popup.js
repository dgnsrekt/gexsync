// i18n: current language + a short lookup helper (i18n.js loads before this script).
let LANG = "en";
const T = (k) => (self.GXI18N ? self.GXI18N.t(k, LANG) : k);

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
    rows.length ? rows.map((r) => `<div>${r}</div>`).join("") : `<span class="muted">${T("dyn.noTabs")}</span>`;
});

// Pages: sync | keys. Same show/hide-by-attribute trick as Mode below (only the
// wrapper DIVs toggle; the seg buttons also carry data-page). Not persisted —
// the popup reopens on Sync, which is what you want 99% of the time.
const pageBtns = [...document.querySelectorAll("#pageSeg .seg-btn")];
const showPage = (p) => {
  document.querySelectorAll("div[data-page]").forEach((el) => { el.hidden = el.dataset.page !== p; });
  pageBtns.forEach((b) => b.setAttribute("aria-selected", b.dataset.page === p ? "true" : "false"));
};
pageBtns.forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
showPage("sync");

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

// ---- Watchlist: curate the tickers the on-chart pill cycles through (Ticker mode).
// Symbols come from the packaged tickers.json (GEXbot's own /tickers list, refreshed
// by scripts/update-tickers.mjs). Order = add order; stored in gexsync-cfg.watchlist. ----
const wlInput = document.getElementById("wlInput");
const wlAdd = document.getElementById("wlAdd");
const wlChips = document.getElementById("wlChips");
const wlList = document.getElementById("wlAll");
let known = new Set(); // valid symbols from tickers.json (futures excluded — hash-cycle can't drive them)
let watchlist = [];
fetch(chrome.runtime.getURL("tickers.json")).then((r) => r.json()).then((j) => {
  const syms = [...(j.indexes || []), ...(j.stocks || [])].sort();
  known = new Set(syms);
  wlList.innerHTML = syms.map((s) => `<option value="${s}"></option>`).join("");
}).catch(() => {}); // no datalist if the file is somehow missing — typing still works against `known` (empty → any)
chrome.storage.local.get("gexsync-cfg", (r) => { watchlist = (r["gexsync-cfg"] || {}).watchlist || []; renderChips(); });
function saveWatchlist() {
  chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), watchlist } }));
}
function renderChips() {
  wlChips.innerHTML = watchlist.map((s) =>
    `<span class="chip">${s}<button data-sym="${s}" title="Remove ${s}" aria-label="Remove ${s}">✕</button></span>`).join("");
}
function addTicker() {
  const s = wlInput.value.trim().toUpperCase();
  wlInput.value = "";
  // Accept a known symbol (or anything if the list failed to load); ignore dupes.
  if (!s || (known.size && !known.has(s)) || watchlist.includes(s)) return;
  watchlist.push(s);
  renderChips(); saveWatchlist();
}
wlAdd.addEventListener("click", addTicker);
wlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
wlChips.addEventListener("click", (e) => {
  const sym = e.target.dataset?.sym;
  if (!sym) return;
  watchlist = watchlist.filter((s) => s !== sym);
  renderChips(); saveWatchlist();
});

// ---- Saved lines: overview of the per-ticker horizontal-line store. The popup reads
// and mutates storage["gexsync-lines"] directly; every tab's content.js reacts via
// storage.onChanged and re-renders its ticker's lines. No live tab needed here. ----
const LINES_KEY = "gexsync-lines";
const linesList = document.getElementById("linesList");
const linesClearAll = document.getElementById("linesClearAll");
let lineCol = "#FFC24A", drawCol = "#4AA3FF", _linesStore = {}; // chart-tool colors + cached line store
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function renderLines(store) {
  const tickers = Object.keys(store || {}).filter((t) => store[t] && store[t].length).sort();
  linesList.innerHTML = tickers.map((tk) => {
    const rows = store[tk].map((l) => {
      const px = l.points && l.points[0] != null ? (+l.points[0].price).toFixed(2) : "?";
      const col = (l.overrides && l.overrides.linecolor && l.overrides.linecolor !== "#16E0A3") ? l.overrides.linecolor : lineCol;
      const txt = l.text ? `<span class="ln-txt">${esc(l.text)}</span>` : "";
      return `<div class="ln-row"><span class="ln-sw" style="background:${esc(col)}"></span><span class="ln-px">${px}</span>${txt}<button class="ln-del" data-tk="${esc(tk)}" data-id="${esc(l.id)}" title="Remove this line">✕</button></div>`;
    }).join("");
    const n = store[tk].length;
    return `<div class="ln-grp"><div class="ln-hd"><span class="ln-tk">${esc(tk)}</span><span class="ln-n">${n} line${n === 1 ? "" : "s"}</span><button class="ln-clr" data-tk="${esc(tk)}" title="Clear ${esc(tk)}">clear</button></div>${rows}</div>`;
  }).join("");
  linesClearAll.disabled = tickers.length === 0;
}
const withLines = (fn) => chrome.storage.local.get(LINES_KEY, (r) => { const next = fn(r[LINES_KEY] || {}); if (next !== undefined) chrome.storage.local.set({ [LINES_KEY]: next }); });
chrome.storage.local.get(LINES_KEY, (r) => { _linesStore = r[LINES_KEY] || {}; renderLines(_linesStore); });
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c[LINES_KEY]) { _linesStore = c[LINES_KEY].newValue || {}; renderLines(_linesStore); } });
linesList.addEventListener("click", (e) => {
  const del = e.target.closest(".ln-del"), clr = e.target.closest(".ln-clr");
  if (del) withLines((s) => { if (!s[del.dataset.tk]) return; const kept = s[del.dataset.tk].filter((l) => l.id !== del.dataset.id); const n = { ...s }; if (kept.length) n[del.dataset.tk] = kept; else delete n[del.dataset.tk]; return n; });
  else if (clr) withLines((s) => { if (!s[clr.dataset.tk]) return; const n = { ...s }; delete n[clr.dataset.tk]; return n; });
});
linesClearAll.addEventListener("click", () => { if (confirm("Clear ALL saved lines across every ticker?")) chrome.storage.local.set({ [LINES_KEY]: {} }); });

// ---- Chart tool colors: one per mode, from the group palette. Written into gexsync-cfg;
// content.js reads them and themes the reticle / lines / strokes live. The two can't match. ----
const GROUP_COLORS = ["#16E0A3", "#FF5C5C", "#4AA3FF", "#FFC24A", "#B57AFF", "#22D3EE", "#FF8C42", "#FF5CC8"];
const palLine = document.getElementById("palLine");
const palDraw = document.getElementById("palDraw");
function renderPalette() {
  const build = (host, current, other) => {
    host.innerHTML = GROUP_COLORS.map((hex) =>
      `<span class="cpal-sw${hex === current ? " sel" : ""}${hex === other ? " dis" : ""}" data-hex="${hex}" style="background:${hex};color:${hex}" title="${hex === other ? "used by the other mode" : hex}"></span>`
    ).join("");
  };
  build(palLine, lineCol, drawCol);
  build(palDraw, drawCol, lineCol);
}
const setColor = (which, hex) => chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), [which]: hex } }));
palLine.addEventListener("click", (e) => { const sw = e.target.closest(".cpal-sw"); if (sw && !sw.classList.contains("dis")) setColor("lineColor", sw.dataset.hex); });
palDraw.addEventListener("click", (e) => { const sw = e.target.closest(".cpal-sw"); if (sw && !sw.classList.contains("dis")) setColor("drawColor", sw.dataset.hex); });
const readColors = (g) => { lineCol = g.lineColor || g.triggerColor || "#FFC24A"; drawCol = g.drawColor || "#4AA3FF"; renderPalette(); renderLines(_linesStore); }; // migrate old triggerColor
chrome.storage.local.get("gexsync-cfg", (r) => readColors(r["gexsync-cfg"] || {}));
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c["gexsync-cfg"]) readColors(c["gexsync-cfg"].newValue || {}); });

const sel = document.getElementById("panelScope");
const wm = document.getElementById("watermark");
const zoomSyncEl = document.getElementById("zoomSync");
const groupShotEl = document.getElementById("groupShot");
const settingsNavEl = document.getElementById("settingsNav");
const settingsSyncEl = document.getElementById("settingsSync");
const dteEl = document.getElementById("dte");
const buzzEl = document.getElementById("buzz");
const matrixEl = document.getElementById("matrix");
const matrixRow = document.getElementById("matrixRow");
const verTap = document.getElementById("verTap");
const pdEls = { pdO: document.getElementById("pdO"), pdH: document.getElementById("pdH"), pdL: document.getElementById("pdL"), pdC: document.getElementById("pdC") };
const pdLabelSeg = document.getElementById("pdLabelSeg");
let pdLabelPos = "left"; // left | center | right
const renderPdLabel = () => pdLabelSeg.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-selected", b.dataset.pos === pdLabelPos ? "true" : "false"));
// DTE rides on the watermark — grey it out and force it off when the watermark is off.
const syncDteLock = () => { dteEl.disabled = !wm.checked; if (!wm.checked) dteEl.checked = false; };
chrome.storage.local.get("gexsync-cfg", (r) => { const g = r["gexsync-cfg"] || {}; sel.value = g.panelScope || "all"; wm.checked = g.watermark !== false; zoomSyncEl.checked = g.zoomSync === true; groupShotEl.checked = g.groupShot === true; settingsNavEl.checked = g.settingsNav === true; settingsSyncEl.checked = g.settingsSync === true; dteEl.checked = g.dte === true; buzzEl.checked = g.buzz === true; for (const k in pdEls) pdEls[k].checked = g[k] === true; pdLabelPos = g.pdLabel || "left"; matrixEl.checked = g.matrix === true; if (g.unlocked) matrixRow.hidden = false; renderPdLabel(); syncDteLock(); });
const saveCfg = () => chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), panelScope: sel.value, watermark: wm.checked, zoomSync: zoomSyncEl.checked, groupShot: groupShotEl.checked, settingsNav: settingsNavEl.checked, settingsSync: settingsSyncEl.checked, dte: dteEl.checked, buzz: buzzEl.checked, pdO: pdEls.pdO.checked, pdH: pdEls.pdH.checked, pdL: pdEls.pdL.checked, pdC: pdEls.pdC.checked, pdLabel: pdLabelPos, matrix: matrixEl.checked } }));
sel.addEventListener("change", saveCfg);
wm.addEventListener("change", () => { syncDteLock(); saveCfg(); });
dteEl.addEventListener("change", saveCfg);
buzzEl.addEventListener("change", saveCfg);
zoomSyncEl.addEventListener("change", saveCfg);
groupShotEl.addEventListener("change", saveCfg);
settingsNavEl.addEventListener("change", saveCfg);
settingsSyncEl.addEventListener("change", saveCfg);
for (const k in pdEls) pdEls[k].addEventListener("change", saveCfg);
matrixEl.addEventListener("change", saveCfg);
pdLabelSeg.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => { pdLabelPos = b.dataset.pos; renderPdLabel(); saveCfg(); }));

// Easter egg: tap the version text 7× (Android "build number" style) to reveal the
// Matrix rain toggle. Counter resets after a short idle; `unlocked` persists in cfg
// (merge-write, mirroring saveWatchlist) so the row stays once found.
let _taps = 0, _tapReset = 0;
verTap.addEventListener("click", () => {
  if (!matrixRow.hidden) return; // already unlocked
  clearTimeout(_tapReset);
  _tapReset = setTimeout(() => { _taps = 0; verTap.textContent = "MV3 · gexbot.com"; }, 1500);
  _taps++;
  const left = 7 - _taps;
  if (left > 0) { if (_taps >= 4) verTap.textContent = `${left} more…`; return; }
  clearTimeout(_tapReset);
  _taps = 0;
  matrixRow.hidden = false;
  chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), unlocked: true } }));
  verTap.textContent = T("dyn.unlocked");
  setTimeout(() => { verTap.textContent = "MV3 · gexbot.com"; }, 1600);
});

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
  // Lock only what would reshape a running replay session: Cross-page scope and
  // Play tracking. Everything else stays usable mid-replay — watermark, group
  // screenshot, the master/client Debug readout, and Live zoom sync (which now works
  // during replay; toggling it off clears the hold and frees the chart).
  [sel, track].forEach((el) => { el.disabled = sessionLocked; });
  document.getElementById("lockNote").hidden = !sessionLocked;
  renderZoomStatus(); // save/recall follow the lock too
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
    `Show DTE: ${dteEl.checked ? "on" : "off"}`,
    `Prev-day lines: ${["pdO", "pdH", "pdL", "pdC"].filter((k) => pdEls[k].checked).map((k) => k.slice(2)).join("/") || "off"}`,
    `Reddit buzz: ${buzzEl.checked ? "on" : "off"}`,
    `Live zoom sync: ${zoomSyncEl.checked ? "on" : "off"}`,
    `Group screenshot: ${groupShotEl.checked ? "on" : "off"}`,
    `Settings nav sync: ${settingsNavEl.checked ? "on" : "off"}`,
    `Chart settings sync: ${settingsSyncEl.checked ? "on" : "off"}`,
    `Zoom layout: ${layoutMeta && layoutMeta.count ? layoutMeta.count + " ticker(s) saved · " + ago(layoutMeta.t) : "none"}`,
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
  copyBtn.textContent = T("dyn.copied"); copyBtn.classList.add("done");
  setTimeout(() => { copyBtn.textContent = T("dyn.copy"); copyBtn.classList.remove("done"); }, 1400);
}
copyBtn.addEventListener("click", (e) => { e.stopPropagation(); copyState(); }); // don't toggle the <details>
document.getElementById("tabs").addEventListener("click", copyState);

// ---- Zoom layout: Save snapshots every open ticker's current zoom into one slot;
// Recall broadcasts a restore. Orthogonal to Live zoom sync (composes with it). ----
const zoomSaveBtn = document.getElementById("zoomSave");
const zoomRecallBtn = document.getElementById("zoomRecall");
const zoomStatus = document.getElementById("zoomLayoutStatus");
let layoutMeta = null;
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 45) return "just now"; const m = Math.round(s / 60); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };
function renderZoomStatus() {
  zoomStatus.textContent = layoutMeta && layoutMeta.count
    ? `Saved ${layoutMeta.count} ticker${layoutMeta.count === 1 ? "" : "s"} · ${ago(layoutMeta.t)}`
    : T("dyn.noLayout");
  zoomSaveBtn.disabled = sessionLocked;
  zoomRecallBtn.disabled = sessionLocked || !(layoutMeta && layoutMeta.count);
}
chrome.storage.local.get("gexsync-zoom-layout", (r) => { layoutMeta = r["gexsync-zoom-layout"] || null; renderZoomStatus(); });
async function saveLayout() {
  const tabs = await new Promise((r) => chrome.tabs.query({ url: "https://www.gexbot.com/*" }, r));
  const gex = tabs.filter((t) => /\/(state|classic)/.test(t.url));
  const zs = await Promise.all(gex.map((t) => new Promise((r) => chrome.tabs.sendMessage(t.id, "getZoom", (z) => r(chrome.runtime.lastError ? null : z)))));
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const stale = Object.keys(all).filter((k) => k.startsWith("gexsync-zoom-saved:"));
  const put = {}, seen = new Set();
  zs.filter((z) => z && z.key).forEach((z) => { if (!seen.has(z.key)) { seen.add(z.key); put[z.key] = { yMin: z.yMin, yMax: z.yMax }; } });
  if (stale.length) await new Promise((r) => chrome.storage.local.remove(stale, r));
  layoutMeta = { t: Date.now(), count: seen.size };
  await new Promise((r) => chrome.storage.local.set({ ...put, "gexsync-zoom-layout": layoutMeta }, r));
  renderZoomStatus();
  return seen.size;
}
zoomSaveBtn.addEventListener("click", async () => {
  const n = await saveLayout();
  zoomSaveBtn.textContent = n ? T("dyn.zoomSaved") : T("dyn.zoomNoCharts");
  if (n) zoomSaveBtn.classList.add("done");
  setTimeout(() => { zoomSaveBtn.textContent = T("dyn.zoomSave"); zoomSaveBtn.classList.remove("done"); }, 1400);
});
zoomRecallBtn.addEventListener("click", () => {
  chrome.storage.local.set({ "gexsync-zoom-recall": { t: Date.now() } });
  zoomRecallBtn.textContent = T("dyn.zoomRecalled"); zoomRecallBtn.classList.add("done");
  setTimeout(() => { zoomRecallBtn.textContent = T("dyn.zoomRecall"); zoomRecallBtn.classList.remove("done"); }, 1400);
});

// ---- Massive.com API key: enter → save → mask ----
const MV_KEY = "gexsync-massive";
const mvKeyEl = document.getElementById("mvKey");
const mvMask = document.getElementById("mvMask");
// Swap the full-width field for a masked readout when a key is saved. Both are
// plain (non-flex) elements, so the `hidden` attribute actually hides them. The
// raw key is never rendered back.
const mvShow = (key) => {
  const has = !!key;
  mvKeyEl.hidden = has; mvMask.hidden = !has;
  if (has) mvMask.textContent = T("dyn.savedPrefix") + "····" + String(key).slice(-4);
  else mvKeyEl.value = "";
};
chrome.storage.local.get(MV_KEY, (r) => mvShow(r[MV_KEY]?.key));
document.getElementById("mvSave").addEventListener("click", () => {
  const key = mvKeyEl.value.trim();
  if (!key) return;
  chrome.storage.local.set({ [MV_KEY]: { key } }, () => mvShow(key));
});
mvKeyEl.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("mvSave").click(); });
document.getElementById("mvClear").addEventListener("click", () => {
  chrome.storage.local.remove(MV_KEY, () => mvShow(null)); // content.js clears its cache on the change
});

// ---- GEXbot API key: enter → save → mask (same pattern as Massive). Gates the TV tab. ----
const GX_KEY = "gexsync-gexbot";
const gxKeyEl = document.getElementById("gxKey");
const gxMask = document.getElementById("gxMask");
const gxTabBtn = () => document.querySelector('#pageSeg .seg-btn[data-page="tv"]'); // revealed only with a key
const gxShow = (key) => {
  const has = !!key;
  gxKeyEl.hidden = has; gxMask.hidden = !has;
  if (has) gxMask.textContent = T("dyn.savedPrefix") + "····" + String(key).slice(-4);
  else gxKeyEl.value = "";
  const tb = gxTabBtn(); if (tb) tb.hidden = !has; // show/hide the TV tab with the key
};
chrome.storage.local.get(GX_KEY, (r) => gxShow(r[GX_KEY]?.key));
document.getElementById("gxSave").addEventListener("click", () => {
  const key = gxKeyEl.value.trim();
  if (!key) return;
  chrome.storage.local.set({ [GX_KEY]: { key } }, () => gxShow(key));
});
gxKeyEl.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("gxSave").click(); });
document.getElementById("gxClear").addEventListener("click", () => {
  chrome.storage.local.remove(GX_KEY, () => gxShow(null));
});

// ---- TV overlay settings (TV tab; the tab itself is revealed by gxShow) ----
// 5 lines: classic zg/+vol/-vol, state +vol/-vol. Ids follow tv<Key>On / tvPal<Key>.
const TV_KEYS = ["czg", "cpos", "cneg", "spos", "sneg"];
const tvCap = (k) => k[0].toUpperCase() + k.slice(1);
const tvEnabledEl = document.getElementById("tvEnabled");
const tvLinesOnEl = document.getElementById("tvLinesOn");
const tvHistOnEl = document.getElementById("tvHistOn");
const tvPauseClosedEl = document.getElementById("tvPauseClosed");
let tvHistSrc = "classic"; // GEX profile source: classic | state
const tvLineOpEl = document.getElementById("tvLineOpacity"), tvHistOpEl = document.getElementById("tvHistOpacity");
const tvLineOpVal = document.getElementById("tvLineOpVal"), tvHistOpVal = document.getElementById("tvHistOpVal");
const tvLevelEls = {}, tvPalEls = {};
for (const k of TV_KEYS) { tvLevelEls[k] = document.getElementById(`tv${tvCap(k)}On`); tvPalEls[k] = document.getElementById(`tvPal${tvCap(k)}`); }
const TV_DEFCOL = { czg: "#FFC24A", cpos: "#16E0A3", cneg: "#FF5C5C", spos: "#22D3EE", sneg: "#FF8C42" };
let tvLevels = {}; for (const k of TV_KEYS) tvLevels[k] = { on: true, color: TV_DEFCOL[k] };
let tvSource = "poll";
let tvPackage = "gex_zero"; // latest | next | 90d (gex_zero | gex_one | gex_full)
let tvRefresh = 30; // refresh cadence seconds: 15 | 30 | 60
const TIER_RANK = { classic: 1, state: 2, orderflow: 3, quant: 4 }; // GEXbot tiers (cumulative)
let gexTier = "classic"; // which tier the user's key has — controls above it are disabled
const tvExpanded = {}; for (const k of TV_KEYS) tvExpanded[k] = false; // palette collapsed → shows only the current color until clicked
// Timeframe visibility: which chart timeframes show the overlay (lines + histogram). Preset + Custom chips.
const VIS_BUCKETS = ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "ranges"];
const tvVisCustomWrap = document.getElementById("tvVisCustom");
const tvVisChips = [...tvVisCustomWrap.querySelectorAll("input[data-bucket]")];
let tvVis = "all"; // all | intraday | daily | custom
const tvSaveCfg = () => chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), tvEnabled: tvEnabledEl.checked, tvLinesOn: tvLinesOnEl.checked, gexTier, tvSource, tvPackage, tvLevels, tvHistogram: tvHistOnEl.checked, tvHistSrc, tvLineOpacity: tvLineOpEl.value / 100, tvHistOpacity: tvHistOpEl.value / 100, tvRefresh, tvVisibility: tvVis, tvVisCustom: tvVisChips.filter((c) => c.checked).map((c) => c.dataset.bucket), tvPauseClosed: tvPauseClosedEl.checked } }));
const tvPaint = () => {
  for (const k of TV_KEYS) {
    tvLevelEls[k].checked = tvLevels[k].on !== false;
    const cur = tvLevels[k].color;
    tvPalEls[k].innerHTML = tvExpanded[k]
      ? GROUP_COLORS.map((hex) => `<span class="cpal-sw${hex === cur ? " sel" : ""}" data-hex="${hex}" style="background:${hex};color:${hex}" title="${hex}"></span>`).join("")
      : `<span class="cpal-sw sel" data-hex="${cur}" style="background:${cur};color:${cur}" title="click to change color"></span>`;
  }
  [...document.querySelectorAll("#tvSrcSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", b.dataset.src === tvSource ? "true" : "false"));
  [...document.querySelectorAll("#tvPkgSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", b.dataset.pkg === tvPackage ? "true" : "false"));
  [...document.querySelectorAll("#tvHistSrcSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", b.dataset.hsrc === tvHistSrc ? "true" : "false"));
  [...document.querySelectorAll("#tvRefreshSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", +b.dataset.refresh === tvRefresh ? "true" : "false"));
  [...document.querySelectorAll("#gexTierSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", b.dataset.tval === gexTier ? "true" : "false"));
  [...document.querySelectorAll("#tvVisSeg .seg-btn")].forEach((b) => b.setAttribute("aria-selected", b.dataset.vis === tvVis ? "true" : "false"));
  tvVisCustomWrap.hidden = tvVis !== "custom"; // chips only for the Custom preset
};
// Disable every [data-tier] control above the chosen tier (declarative gate — future features just
// add data-tier="<tier>" in the HTML). Classic is the floor (no attribute needed).
const applyTierGate = () => {
  const rank = TIER_RANK[gexTier] || 1;
  if (rank < TIER_RANK.state && tvHistSrc === "state") { tvHistSrc = "classic"; } // clamp: no State profile below State tier
  for (const el of document.querySelectorAll("[data-tier]")) {
    const locked = (TIER_RANK[el.dataset.tier] || 99) > rank;
    const ctl = el.matches("input,button") ? el : el.querySelector("input,button");
    if (ctl) ctl.disabled = locked;
    el.style.opacity = locked ? ".4" : "";
    el.title = locked ? `Requires ${el.dataset.tier[0].toUpperCase() + el.dataset.tier.slice(1)} tier` : "";
  }
};
const tvLoad = (g) => {
  tvEnabledEl.checked = g.tvEnabled !== false; // default on once a key exists
  tvLinesOnEl.checked = g.tvLinesOn !== false; // lines visible by default
  tvSource = g.tvSource === "ws" ? "ws" : "poll";
  tvPackage = ["gex_zero", "gex_one", "gex_full"].includes(g.tvPackage) ? g.tvPackage : "gex_zero";
  tvHistOnEl.checked = g.tvHistogram === true; // GEX profile off by default
  tvHistSrc = g.tvHistSrc === "state" ? "state" : "classic";
  gexTier = ["classic", "state", "orderflow", "quant"].includes(g.gexTier) ? g.gexTier : "classic";
  tvRefresh = [1, 5, 15, 30, 60].includes(g.tvRefresh) ? g.tvRefresh : 30;
  tvPauseClosedEl.checked = g.tvPauseClosed !== false; // pause outside RTH, default on
  tvVis = ["all", "intraday", "daily", "custom"].includes(g.tvVisibility) ? g.tvVisibility : "all";
  const visCustom = Array.isArray(g.tvVisCustom) ? g.tvVisCustom : VIS_BUCKETS; // default: every bucket checked
  for (const c of tvVisChips) c.checked = visCustom.includes(c.dataset.bucket);
  tvLineOpEl.value = Math.round((g.tvLineOpacity != null ? g.tvLineOpacity : 1) * 100);
  tvHistOpEl.value = Math.round((g.tvHistOpacity != null ? g.tvHistOpacity : 1) * 100);
  tvOpPaint();
  const s = g.tvLevels || {};
  const lvl = (k, old) => ({ on: (s[k]?.on ?? (old && s[old]?.on)) !== false, color: s[k]?.color || (old && s[old]?.color) || TV_DEFCOL[k] }); // migrate old {zg,pos,neg}
  tvLevels = { czg: lvl("czg", "zg"), cpos: lvl("cpos", "pos"), cneg: lvl("cneg", "neg"), spos: lvl("spos"), sneg: lvl("sneg") };
  applyTierGate(); // clamp state→classic if below tier + disable locked controls
  tvPaint();
};
const tvOpPaint = () => { tvLineOpVal.textContent = tvLineOpEl.value + "%"; tvHistOpVal.textContent = tvHistOpEl.value + "%"; };
tvEnabledEl.addEventListener("change", tvSaveCfg);
tvLinesOnEl.addEventListener("change", tvSaveCfg);
tvHistOnEl.addEventListener("change", tvSaveCfg);
tvPauseClosedEl.addEventListener("change", tvSaveCfg);
for (const el of [tvLineOpEl, tvHistOpEl]) el.addEventListener("input", () => { tvOpPaint(); tvSaveCfg(); }); // live blend
[...document.querySelectorAll("#tvHistSrcSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; tvHistSrc = b.dataset.hsrc; tvPaint(); tvSaveCfg(); }));
for (const k of TV_KEYS) {
  tvLevelEls[k].addEventListener("change", () => { tvLevels[k].on = tvLevelEls[k].checked; tvSaveCfg(); });
  tvPalEls[k].addEventListener("click", (e) => {
    const sw = e.target.closest(".cpal-sw"); if (!sw) return;
    if (!tvExpanded[k]) { for (const kk of TV_KEYS) tvExpanded[kk] = kk === k; tvPaint(); return; } // open (collapse the others)
    if (sw.dataset.hex && sw.dataset.hex !== tvLevels[k].color) { tvLevels[k].color = sw.dataset.hex; tvSaveCfg(); } // pick a new color
    tvExpanded[k] = false; tvPaint(); // collapse back to just the current color
  });
}
[...document.querySelectorAll("#tvSrcSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; tvSource = b.dataset.src; tvPaint(); tvSaveCfg(); }));
[...document.querySelectorAll("#tvPkgSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; tvPackage = b.dataset.pkg; tvPaint(); tvSaveCfg(); })); // package switch → cfg change → tv.js refetches
[...document.querySelectorAll("#tvRefreshSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; tvRefresh = +b.dataset.refresh; tvPaint(); tvSaveCfg(); }));
[...document.querySelectorAll("#gexTierSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; gexTier = b.dataset.tval; applyTierGate(); tvPaint(); tvSaveCfg(); })); // tier → gate features + refetch
[...document.querySelectorAll("#tvVisSeg .seg-btn")].forEach((b) => b.addEventListener("click", () => { tvVis = b.dataset.vis; tvPaint(); tvSaveCfg(); })); // visibility preset → reveals Custom chips
for (const c of tvVisChips) c.addEventListener("change", tvSaveCfg);
chrome.storage.local.get("gexsync-cfg", (r) => tvLoad(r["gexsync-cfg"] || {}));

// ---- Language (EN | ES). Stored in gexsync-cfg.lang; defaults to the browser's on first run.
// applyI18n handles the static popup text; relocalizeDynamic re-renders the JS-set strings. ----
const langSeg = document.getElementById("langSeg");
function relocalizeDynamic() {
  zoomSaveBtn.textContent = T("dyn.zoomSave");
  zoomRecallBtn.textContent = T("dyn.zoomRecall");
  copyBtn.textContent = T("dyn.copy");
  renderZoomStatus();
  chrome.storage.local.get([MV_KEY, GX_KEY], (r) => { // re-mask saved keys in the new language
    if (r[MV_KEY]?.key) mvShow(r[MV_KEY].key);
    if (r[GX_KEY]?.key) gxShow(r[GX_KEY].key);
  });
}
function applyLangUI() {
  if (self.GXI18N) self.GXI18N.applyI18n(document, LANG);
  if (langSeg) [...langSeg.children].forEach((b) => b.setAttribute("aria-selected", b.dataset.lang === LANG ? "true" : "false"));
  relocalizeDynamic();
}
chrome.storage.local.get("gexsync-cfg", (r) => {
  const g = r["gexsync-cfg"] || {};
  LANG = self.GXI18N ? self.GXI18N.normLang(g.lang || navigator.language) : "en";
  applyLangUI();
});
if (langSeg) langSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-lang]");
  if (!b || b.dataset.lang === LANG) return;
  LANG = b.dataset.lang;
  chrome.storage.local.get("gexsync-cfg", (r) => chrome.storage.local.set({ "gexsync-cfg": { ...(r["gexsync-cfg"] || {}), lang: LANG } }));
  applyLangUI();
});
