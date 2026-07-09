const count = (page) =>
  new Promise((r) => chrome.tabs.query({ url: `https://www.gexbot.com/${page}*` }, (t) => r(t.length)));

Promise.all([count("state"), count("classic")]).then(([state, classic]) => {
  const line = (label, n) => `${label}: ${n} tab${n === 1 ? "" : "s"} synced`;
  document.getElementById("count").innerHTML =
    `${line("state", state)}<br>${line("classic", classic)}`;
});
