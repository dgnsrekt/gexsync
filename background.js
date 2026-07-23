// ponytail: group-shot saves into a Downloads/gexsync/ subfolder. The anchor
// `download` attr can't do that (Chrome flattens "/" → "_"), and content scripts
// can't call chrome.downloads — so route the zip through here. This is the ONLY
// job of this worker; it stays asleep until a group shot fires.
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (!msg || msg.type !== "gexsync-download" || !msg.url || !msg.filename) return;
  chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: false }, (id) => {
    const err = chrome.runtime.lastError;
    reply({ ok: !err && id != null, err: err && err.message });
  });
  return true; // async reply
});
