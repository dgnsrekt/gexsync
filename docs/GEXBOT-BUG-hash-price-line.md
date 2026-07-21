# Bug report: URL hash deep-link (`/state#TICKER`) doesn't render the intraday price line

## Summary

Opening a chart via the URL hash deep-link — e.g. `https://www.gexbot.com/state#TSLA` —
correctly switches the ticker and loads the GEX/strike data, but the **intraday
spot price-history line does not render**. Loading the *same ticker* via the bare
URL (`https://www.gexbot.com/state`, which restores the ticker from local storage)
renders the price line correctly. The only difference is the presence of the
`#TICKER` hash.

So the hash-load code path appears to skip the intraday price-history fetch/render
that the normal bare-URL load performs.

## Environment

- Site: `www.gexbot.com`, `/state` and `/classic` pages
- Browser: Chrome (desktop), no extensions enabled (reproduced with all extensions off)
- Observed: 2026-07-20, US market hours
- Account: logged in

## Steps to reproduce

1. Open `https://www.gexbot.com/state` in a fresh tab. **Observe:** the cyan
   intraday price-history line renders across the chart (9:30a–4:00p).
2. Open `https://www.gexbot.com/state#TSLA` (any liquid ticker) in a fresh tab.
   **Observe:** the ticker switches to TSLA, the GEX strike bars and the current
   spot value load, the time axis is present — **but the intraday price-history
   line is missing** (empty chart body).
3. In that second tab, delete the `#TSLA` from the URL so it reads
   `https://www.gexbot.com/state` and load it. TSLA is restored from storage and
   the **price-history line now renders**.

Reproduces identically on `/classic`.

## Expected

A hash deep-link (`/state#TICKER`) should render the chart fully — including the
intraday price-history line — the same as a bare-URL load of that ticker.

## Actual

The hash-loaded chart shows GEX data and spot, but never renders the intraday
price-history line. A subsequent bare-URL load is required to get it.

## Evidence

Two screenshots, identical ticker (TSLA) and profile (90d agg), same session:
- `state#TSLA` — GEX bars present, **no** price line.
- `state` (bare, TSLA restored) — **full** price line.

(A side-by-side screen recording is attached.)

## Impact

Any deep-link into a ticker — bookmarks, shared links, dashboards, and
multi-tab/automation tools — cannot display the intraday price history without a
second, bare-URL load. That forces a wasteful double page-load (and a second data
fetch) just to get the price line to appear.

## Technical notes (for triage)

- The GEX/options data itself loads fine on the hash path (live updates arrive over
  the Azure Web PubSub socket; profile switches hit
  `app.gexbot.com/chart/<TICKER>/<page>/gex_full`). It's specifically the intraday
  **price-history** series that the hash path doesn't request/draw.
- Hypothesis: the price-history load is wired to the initial bare-render path and
  isn't triggered when the ticker is set via the hash.

## Related (a stronger fix, if feasible)

Even better than making the hash render the price line: allow an **in-place ticker
change to render the price line without a full reload**, the way profile changes
already update live. Today a ticker change effectively requires a full bare-URL
reload to get the price line — if the price-history series refreshed on ticker
change the same way it does on initial load, deep-links and in-app ticker switches
would both "just work" with no reload.
