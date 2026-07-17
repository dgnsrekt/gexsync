---
type: Explanation
title: Is GexSync safe?
description: The permissions GexSync requests, its lack of external network access, the data it stores locally, and how to audit it yourself.
tags: [safety, privacy, permissions, security, audit]
timestamp: 2026-07-17T00:00:00Z
---

# Is GexSync safe?

Short answer: yes, and unlike a Web Store binary you can verify every claim
below by reading the source in this repository. GexSync is plain JavaScript with
no build step, so what's in the repo is exactly what runs.

## Permissions it requests

From `manifest.json`, GexSync asks for the minimum it needs:

* `permissions: ["storage"]` — access to `chrome.storage.local`, used purely as
  a message bus so tabs can see each other's synced state.
* `host_permissions: ["https://www.gexbot.com/*"]` — it can only run on GEXbot.
  It has no access to any other website, your browsing history, cookies, or
  other tabs.

Its content scripts are matched only to `https://www.gexbot.com/state*` and
`/classic*`. On every other page it is inert.

## It makes no external network requests

GexSync does not send data anywhere. There is no server, no analytics, no
telemetry, no external fonts or CDNs (the three fonts are bundled `.woff2` files
in `fonts/`).

The one piece that touches the network is `netwatch.js`, and it only *observes*:
it wraps `fetch`/`XHR` in the page to notice when **GEXbot's own** requests come
back with a `429` rate-limit (or an error on their `/hist/` endpoint), then fires
a local browser event so the extension can warn you. It never initiates a request
and never transmits anything off the page. You can read the whole file — it's
about 30 lines.

## What it stores (all local)

Everything lives in `chrome.storage.local`, inside your browser, and never
leaves it. The keys are the sync state: current mode, per-page profile and
options selections, the shared ticker, panel-collapse state, and the active
replay-session metadata (`gexsync*` and `replay*` keys). Uninstalling the
extension removes them.

## What it reads from the page

To sync, it reads the GEXbot UI: profile toggles, the ticker input, options
switches, the panel chevron, and replay controls (slider, play/pause, speed,
date, time-of-day). It watches clicks and DOM changes and mirrors them to other
tabs. It does not read HTTP response bodies or alter your GEXbot data.

## How to audit it yourself

* `manifest.json` — confirm the permissions and host matches above.
* `netwatch.js` — confirm it only observes and dispatches a local event.
* `content.js` and `replay.js` — the sync logic; search for any `fetch(` /
  `XMLHttpRequest` that targets a non-gexbot URL (there are none).

See [install](install.md) to set it up and [usage](usage.md) for what it does.
