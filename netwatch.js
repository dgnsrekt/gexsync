// ponytail: MAIN-world shim — wraps fetch/XHR ONLY to catch GEXbot rate-limit
// responses and hand them to the isolated content script via a DOM event.
// Content scripts run in an isolated world and can't see the page's own fetch,
// so this has to live in the page context (manifest world:MAIN). No app logic.
(() => {
  if (window.__gexsyncNet) return;
  window.__gexsyncNet = 1;

  const flag = (url, status) => {
    url = String(url || "");
    if (!/gexbot\.com/.test(url)) return;
    // 429 anywhere, or any 4xx/5xx on the /hist/ spot endpoint they emailed about
    // (in case their limiter answers with a non-standard code there).
    if (status === 429 || (status >= 400 && /\/hist\//.test(url)))
      window.dispatchEvent(new CustomEvent("gexsync-429", { detail: { url, status } }));
  };

  // Record a successful intraday price-history load — hist/<ticker>/spot, same
  // endpoint on state + classic, no date in the URL so always today's live line —
  // onto the DOM so the isolated content script can read it. The boot repair uses
  // this to tell a loaded line from a stuck one, robustly at market open (a pixel
  // count is not). Content scripts share this DOM node.
  const noteHist = (url, status) => {
    const m = /\/hist\/([A-Za-z0-9.]+)\/spot\b/i.exec(String(url || ""));
    if (m && status >= 200 && status < 300)
      document.documentElement.setAttribute("data-gxhist", m[1]);
  };

  const of = window.fetch;
  window.fetch = function (u, ...a) {
    return of.call(this, u, ...a).then((r) => { const url = (u && u.url) || u; flag(url, r.status); noteHist(url, r.status); return r; });
  };

  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...a) { this.__gxUrl = url; return open.call(this, m, url, ...a); };
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener("load", () => { flag(this.__gxUrl, this.status); noteHist(this.__gxUrl, this.status); });
    return send.apply(this, a);
  };
})();
