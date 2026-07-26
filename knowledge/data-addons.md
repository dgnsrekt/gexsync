---
type: Guide
title: Chart data add-ons
description: The opt-in add-ons that pull outside data onto the GEXbot chart — company details, previous-day levels, and Reddit mention rank — what each one needs, and exactly when it makes a request.
tags: [add-ons, opt-in, massive, polygon, apewisdom, reddit, api-key, previous-day, network]
timestamp: 2026-07-25T00:00:00Z
---

# Chart data add-ons

Everything else in GexSync moves data *between your own tabs*. These add-ons are the one
exception: they bring in outside data and put it on the chart. Because of that they are
**all off by default**, and each is switched on individually on the popup's **Data keys**
page.

There are two providers, and they're gated differently — worth knowing before you turn
anything on:

| Add-on | Provider | What gates it | Requests before that? |
| --- | --- | --- | --- |
| Massive.com data | api.massive.com | **your own API key**, saved in the popup | none — inert with no key |
| Previous-day levels | api.massive.com | the same key, plus per-line toggles | none — inert with no key |
| Reddit buzz | apewisdom.io | **just the toggle** (no key exists) | none — nothing until it's on |

See [safety](safety.md) for exactly what each request contains and where your key is
stored.

## Where they show up

All three appear in one place: a details panel that grows out of the **bottom pill**.
Hover the pill's ticker segment (`SPY · STATE · LATEST · #A1B`) to peek at it, **click**
that segment to pin it open, and press **Esc** (or click again) to close it. The panel is
exactly as wide as the pill, so the two read as one object.

Previous-day levels are the exception — those draw as labelled horizontal lines on the
chart itself, not in the panel.

## Massive.com data (company details)

Paste a [Massive.com](https://massive.com) API key (formerly Polygon.io) into the **Data
keys** page and the panel gains the current ticker's company details: name, primary
exchange, market cap and share count for a stock, or the security type and currency for
an ETF.

**A free key is enough.** Massive's free "Stocks Basic" plan covers everything both
add-ons ask for. What the free plan costs you:

* **5 requests per minute**, and in practice only about two can land at once. Opening a
  lot of panes on *different* tickers at once will briefly hit that ceiling — see
  *When something's throttled* below.
* **About two years of history**, which limits how far back replay can find levels.
* End-of-day data, which is exactly right here: a previous day's bar is settled and a
  market cap is close-based, so neither changes intraday.

Company details are fetched **once per ticker per trading day** and shared across every
open pane, so revisiting a symbol costs nothing.

## Previous-day levels (PDO / PDH / PDL / PDC)

Four independent toggles draw the previous trading day's **O**pen, **H**igh, **L**ow and
**C**lose as white horizontal lines on the chart, labelled `PDO`, `PDH`, `PDL`, `PDC`. A
fourth control puts those labels on the left, centre or right.

* It uses the same Massive key — no separate setup.
* The panel also shows the same day's OHLC and volume as text.
* **It follows replay.** The "previous day" is measured from the chart's own update date,
  not from today, so a tab parked on a past session shows *that* session's previous day.
* **Stocks and ETFs only.** Indexes like SPX, NDX and VIX have no daily bars on this
  plan, so the lines simply don't appear and the panel says why.

## Reddit buzz (mention rank)

One toggle, **no key, no signup** — the only add-on here with nothing to configure. The
panel gains the current ticker's standing on Reddit:

```
Reddit #9 of 285 · ↓3
26 mentions
#2 most-discussed of your 6 open tickers
```

* **`#9 of 285`** — rank by mention count across the tickers being tracked, and how many
  that is today.
* **`↓3`** — where it sat 24 hours ago. A *smaller* rank is better, so `↑` means it
  climbed.
* **`26 mentions`** — the current count. Only the *rank* change is shown as a comparison,
  because the mention counts and the 24-hour figures are not measured over the same window
  and comparing them directly would mislead.
* **The last line** ranks the current symbol against the other tickers you have open right
  now. It appears only when you have more than one open and the current one is ranked.

Data comes from [apewisdom.io](https://apewisdom.io) and refreshes hourly. It covers
roughly the 300 most-mentioned tickers, so a quiet symbol shows **`not in today's top
285`** rather than a rank — that's a real answer, not a failure. One request per hour
covers every ticker, and your current symbol is matched **locally**, so apewisdom.io is
never told what you're looking at.

## When something's throttled or unavailable

Failures are visible rather than silent, which matters on a free key:

* An **amber dot** appears on the pill's ticker segment whenever a source is failing —
  whether or not the panel is open. Open the panel for the reason.
* The panel says what happened in plain language. The common ones:
  * *throttled, retrying* — a free key's per-minute ceiling. It clears itself: GexSync
    waits about 20 seconds and asks again, so panels fill in progressively. Opening six
    panes on six new tickers at once can take a couple of minutes to settle.
  * *not on your plan — index, or past ~2 years* — you're on an index, or replaying
    further back than the plan's history window.
  * *key rejected* — re-check the key copied cleanly, then save it again.
  * *nothing for this symbol* — the provider has no record for it (indexes, mostly).

Throttling is expected on a free key, not a bug. Hard problems (a rejected key, an
unsupported symbol) aren't retried, because asking again can't change the answer.

## Turning it all off

Clearing the key (the **Clear** button) disables both Massive add-ons and forgets the
key. Switching off Reddit buzz stops its requests. With all of them off, GexSync makes no
outbound requests at all — see [safety](safety.md).
