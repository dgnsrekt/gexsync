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

  const of = window.fetch;
  window.fetch = function (u, ...a) {
    return of.call(this, u, ...a).then((r) => { flag((u && u.url) || u, r.status); return r; });
  };

  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...a) { this.__gxUrl = url; return open.call(this, m, url, ...a); };
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener("load", () => flag(this.__gxUrl, this.status));
    return send.apply(this, a);
  };
})();
