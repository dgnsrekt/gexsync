---
type: Explanation
title: Is GexSync safe?
description: The permissions GexSync requests, exactly when it does and doesn't touch the network, the data it stores locally, and how to audit it yourself.
tags: [safety, privacy, permissions, security, audit, opt-in]
timestamp: 2026-07-25T00:00:00Z
---

# Is GexSync safe?

Short answer: yes, and unlike a Web Store binary you can verify every claim
below by reading the source in this repository. GexSync is plain JavaScript with
no build step, so what's in the repo is exactly what runs.

## Permissions it requests

From `manifest.json`, GexSync asks for the minimum it needs:

* `permissions: ["storage", "downloads"]`
  * `storage` — access to `chrome.storage.local`, used purely as a message bus so
    tabs can see each other's synced state.
  * `downloads` — used **only** by the Group Shot feature, and only when *you*
    click a chart's camera with that toggle on: it saves the ZIP GexSync built
    into a `Downloads/gexsync/` subfolder. (A plain link download can't create a
    subfolder, so a tiny background worker hands the finished file to
    `chrome.downloads`.) It never reads your download history and never downloads
    anything you didn't trigger.
* `host_permissions: ["https://www.gexbot.com/*", "https://api.massive.com/*",
  "https://apewisdom.io/*"]` — GEXbot is the only site GexSync *runs on*. The other
  two are data hosts the background worker is *allowed* to call for the opt-in add-ons
  described below; being allowed isn't the same as doing it, and with the add-ons off
  it never calls either one. It has no access to any other website, your browsing
  history, cookies, or other tabs.

Its content scripts are matched only to `https://www.gexbot.com/state*` and
`/classic*`. On every other page it is inert.

## Network requests: none at all, until you switch on an add-on

Out of the box GexSync sends nothing anywhere. There is no server, no analytics, no
telemetry, no external fonts or CDNs (the three fonts are bundled `.woff2` files in
`fonts/`). Installed and left alone, it makes **zero** outbound requests — all syncing
happens locally through `chrome.storage.local`.

Two **chart add-ons** can change that, and only for as long as they're switched on.
Both are **off by default**, both are controlled on the popup's **Data keys** page, and
both are fetched by the background worker — never by a script running on the gexbot.com
page. Be aware that they are gated differently:

* **Massive.com data** (company details) and **Previous-day levels** (the PDO/PDH/PDL/PDC
  chart lines) → `https://api.massive.com`. **Nothing is requested until you paste in your
  own API key.** With no key saved, this add-on is completely inert; there is nothing to
  send a request with. Each request carries the ticker symbol in the URL and your key in
  an `Authorization` header — nothing else. Not your settings, not your tabs, not
  anything identifying you.
* **Reddit buzz** (mention rank) → `https://apewisdom.io`. This one needs **no key**, so
  the toggle is the only gate: requests start when you switch it on and stop when you
  switch it off. It asks for a public, ranked list of the most-mentioned tickers and then
  matches your current symbol against that list **locally, inside the extension** — which
  means apewisdom.io is never told which ticker you are looking at. The request is
  anonymous and carries nothing about you.

Traffic is deliberately tiny: company details are fetched once per ticker per trading
day, a previous-day bar once per ticker per date (a settled day never changes), and the
Reddit list once per hour for *all* tickers at once. Every open tab shares one cache in
the background worker, so six panes on the same symbol cost one request, not six.

Switching an add-on off stops its requests immediately. Neither host is ever told
anything about the other, and no third host is ever contacted.

One more file touches the network without ever using it: `netwatch.js` only *observes*.
It wraps `fetch`/`XHR` in the page to notice when **GEXbot's own** requests come back
with a `429` rate-limit (or an error on their `/hist/` endpoint), then fires a local
browser event so the extension can warn you. It never initiates a request and never
transmits anything off the page. You can read the whole file — it's about 30 lines.

## What it stores (all local)

Everything lives in `chrome.storage.local`, inside your browser, and never
leaves it. The keys are the sync state: current mode, per-page profile and
options selections, the shared ticker, panel-collapse state, saved chart-zoom
values and layouts, and the active replay-session metadata (`gexsync*` and
`replay*` keys). Your popup toggles live there too, including which add-ons are on.

One entry deserves calling out:

* **Your Massive API key** (`gexsync-massive`) is stored here **in plain text**, as
  Chrome extensions have no secret store. It is masked in the popup after saving (only
  the last four characters are ever displayed again), it is read only by the background
  worker so it never touches a script running on the gexbot.com page, and **Clear**
  removes it. Anything with access to your Chrome profile could read it, so treat it
  like any other locally-stored credential — and prefer a free-tier key, which is all
  these add-ons need.

Fetched market data is *not* persisted: those caches live in memory in the background
worker and vanish when Chrome idles it. Uninstalling the extension removes everything.

## What it reads from the page

To sync, it reads the GEXbot UI: profile toggles, the ticker input, options
switches, the panel chevron, and replay controls (slider, play/pause, speed,
date, time-of-day). It watches clicks and DOM changes and mirrors them to other
tabs.

For replay and zoom, two small page-context helpers (`replaydata.js`, `zoom.js`)
also read data GEXbot has **already loaded into the page** — the replay time-map
and the chart's current zoom — so playback can align by time-of-day and your zoom
can be restored after GEXbot's refresh. This reads the parsed data already sitting
in GEXbot's own page objects, not raw HTTP responses, and it never alters or
transmits your GEXbot data.

For **Group Shot**, a third page-context helper (`shot.js`) captures the chart's
own `<canvas>` to an image when you click the camera, and the extension reads the
date/time GEXbot already shows on screen. Everything — the per-pane images, the
stitched grid, and the manifest — is assembled **in your browser** and saved to
your Downloads; nothing is uploaded.

## How to audit it yourself

* `manifest.json` — confirm the permissions and host matches above.
* `netwatch.js` — confirm it only observes and dispatches a local event.
* `replaydata.js`, `zoom.js`, `shot.js`, and `pdlines.js` — the page-context helpers;
  confirm they only read in-page data, capture the chart canvas, or draw lines onto it,
  and never make a network call.
* `background.js` — the service worker, and **the only file in GexSync that ever calls
  `fetch` for real**. Every outbound request lives here, so this one file is the whole
  network surface. Search it for `fetch(` — there are exactly **three** call sites. Two
  are the Massive endpoints, written inline as `https://api.massive.com/...`; the third
  fetches `AW_URL(n)`, a one-line helper right above it holding the single
  `https://apewisdom.io/...` URL. Grepping the file for `https://` turns up one more host,
  `www.gexbot.com` — that one is a tab-matching pattern used to find your GEXbot tabs, not
  a request, and it is never fetched. Those are the only three hosts in the file. Confirm the
  Massive calls return early when no key is saved, and that the worker's other job —
  handing a GexSync-built ZIP to `chrome.downloads` — makes no requests at all.
* `content.js` and `replay.js` — the sync logic. These have **no `fetch` of their own**:
  when an add-on is on, they ask the background worker by message and render whatever
  comes back, which is why your API key never reaches a script on the page. Confirm the
  two gates — `mvKeyReady` (a key is saved) for the Massive add-on and `buzzOn` (the
  toggle) for Reddit buzz — are what start any request at all.

See [install](install.md) to set it up and [usage](usage.md) for what it does.
