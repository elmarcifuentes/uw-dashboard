# Unusual Whales API — Inventory, Scalp-Relevance Ranking & Keep/Cancel Verdict

Reconnaissance before a possible redesign. **No code changes.** Goal: map the full UW API surface,
compare it to what we actually use, and judge — for a **gamma-magnet scalp model** — whether properly
using UW would materially help, or whether we already touch the useful parts and just display them
poorly. Sources: our own code (verified), UW's OpenAPI docs (`api.unusualwhales.com/docs`), and live UW
MCP responses (ground-truth field names). Confidence tags: **[CODE]** verified in our repo, **[DOC]**
from UW docs, **[LIVE]** confirmed against a real UW response, **[INFERRED]** reasoned/unverified.

> **Headline:** UW exposes the exact gamma-magnet primitives our model wants — `call_wall`, `put_wall`,
> `gamma_flip`, `gamma_magnet` (`/gex-levels`), plus **intraday** spot-gamma per strike (`/spot-exposures*`)
> and an intraday net-premium tape (`/net-prem-ticks`). **We fetch none of them.** Worse, the per-strike
> GEX we *do* fetch (`greek-exposure/strike`) is **computed then discarded** (FLAG-4), and the GEX we
> *display* is by-**expiry** (a time-bucket regime), not by-**price** (the magnet zones). The data the
> model needs is on the plan we already pay for and is going unused.

---

## 1. What we use today

Every UW call in the codebase. Five feed scoring (`server/scorer/fetchData.js`); the rest feed the
Catalyst/News/Overview/PreSession tabs and the price poll. **[CODE]**

### 1a. Scoring sources — `fetchData.js` (frozen) → `runFullScore`
| Endpoint | Returns | Fields we **consume** | Fields we **ignore** |
|---|---|---|---|
| `GET /api/darkpool/{QQQ}` | recent dark-pool prints | `price`/`executed_price`, `premium`/`notional`/`size` (summed in a ±0.30% window); `dpPrints[0].price` = `current_price` | **`executed_at` (timestamps!), `nbbo_bid/ask`, `market_center`, `size` vs `premium` split, `sale_cond_codes`** — no recency filter (FLAG-2) |
| `GET /api/option-trades/flow-alerts?ticker_symbol=QQQ` | unusual-flow alerts | `strike`, `total_premium`/`premium`, `type`/`sentiment`/`put_call` (±0.30% strike window) | **`has_sweep`, `has_floor`, `has_multileg`, `volume_oi_ratio`, `open_interest`, `dte`, `created_at`, `alert_rule`** — sweeps/0DTE/recency all dropped |
| `GET /api/stock/{QQQ}/options-volume` | session call/put volume | `call_volume`/`put_volume` (session-wide options bias) | everything else; no intraday |
| `GET /api/stock/{QQQ}/greek-exposure/strike` | **per-strike GEX** (`call_gex`,`put_gex`,`call_delta`,`put_delta`,`call_charm`,`put_charm`,`call_vanna`,`put_vanna`,`strike`,`date`) **[LIVE]** | `gexContext()` computes a per-level net GEX in a ±1% window… | **…then it is DROPPED from `levelPayloads` (FLAG-4)** — the per-strike gamma never reaches the UI or scoring. Charm/vanna/delta entirely unused. |
| `GET /api/market/{QQQ}/etf-tide` | intraday ETF net-premium tide | `net_call_premium`/`net_put_premium` (newest vs ~30 bars ago → bullish/bearish) | per-bar series, magnitude |

### 1b. Catalyst / display sources — `server/index.js` proxies (`/api-data/*`) + `fetchCatalystData`
| Endpoint | Surface | What we use |
|---|---|---|
| `GET /api/stock/{QQQ}/greek-exposure/expiry` | **GexByExpiry** card + Catalyst bias | `call_gex`+`put_gex` per expiry → net, bucketed **today/thisWeek/nextWeek/later**; Catalyst `netGex < -50000 → 'expansion' else 'pinning'`. **This is GEX by *time*, not by *price-strike*.** |
| `GET /api/stock/{QQQ}/greek-flow` | **GreekFlow** card | delta/vega flow series |
| `GET /api/stock/{QQQ}/put-call-ratio` | Catalyst | put/call ratio |
| `GET /api/stock/{QQQ}/flow-per-expiry` | Catalyst/Overview | flow by expiry |
| `GET /api/stock/QQQ/stock-state` | price poll (`RestDataProvider`) | `close`/`last`/`price` = the live QQQ used for triggers + the ratio QQQ leg |
| `GET /api/market/tide` | Catalyst Factor 3 | market net-premium tide |
| `GET /api/market/top-net-impact` | Overview (TopNetImpact) | top movers by net premium |
| `GET /api/market/sector-etfs` | Overview (SectorETF) | sector flow |
| `GET /api/market/economic-calendar` | EconomicCalendar | events |
| `GET /api/news/headlines` | News tab | headlines |
| `GET /api/earnings/premarket` | PreSession (EarningsWarning) | earnings |

**Count:** ~17 distinct endpoints touched, but only ~3 do real analytic work (dark pool, flow-alerts,
options-volume → the score; greek-exposure/expiry → the pinning/expansion note). The rest are
display widgets. **No per-strike price-level gamma is surfaced anywhere; no explicit wall/flip data is fetched.**

---

## 2. What UW actually offers (the parts that matter)

Enumerated from UW's OpenAPI docs + live MCP field confirmation. Base `https://api.unusualwhales.com`.
Focus on gamma + intraday; the full list also includes screener/seasonality/shorts/insider/congress/
institutions/earnings/crypto/technicals — **none scalp-relevant**, so omitted here.

### 2a. GAMMA / GEX — the priority surface
| Endpoint | Returns | Granularity | Cadence | In our code? |
|---|---|---|---|---|
| **`/api/stock/{t}/gex-levels`** | **`call_wall`, `put_wall`, `gamma_flip`, `gamma_magnet`** **[DOC]** | the explicit magnet/flip price levels | `date` param → likely **daily/EOD** [INFERRED — verify cadence] | **NO** ← the single highest-value gap |
| **`/api/stock/{t}/spot-exposures`** | aggregate **intraday** γ/vanna/charm: `gamma_per_one_percent_move_{oi,vol,dir}` (+vanna/charm), `price`, `time` **[DOC]** | whole-ticker, **1-minute** | 1-min | **NO** |
| **`/api/stock/{t}/spot-exposures/strike`** | **intraday per-strike** γ/δ/vanna/charm, split bid/ask/oi/vol (`call_gamma_oi`, `put_gamma_oi`, …) **[DOC]** | per-strike, intraday | ~1-min | **NO** ← build live walls from this |
| `/api/stock/{t}/spot-exposures/expiry-strike` | same, by strike × expiry (isolate **0DTE** walls) **[DOC]** | strike×expiry | intraday | NO |
| `/api/stock/{t}/greek-exposure/strike` | **static/EOD** per-strike GEX **[LIVE]** | per-strike, daily | daily | **YES — but discarded (FLAG-4)** |
| `/api/stock/{t}/greek-exposure/expiry` | per-expiry GEX | per-expiry | daily | YES (GexByExpiry) |
| `/api/stock/{t}/greek-exposure` | aggregate daily greeks | ticker | daily | no |
| `/api/stock/{t}/greek-flow` | intraday delta/vega **flow** | ticker, 1-min | 1-min | YES (GreekFlow) |

### 2b. Dark pool
| Endpoint | Notes |
|---|---|
| `/api/darkpool/{t}` (ours) and `/api/darkpool/recent` | Prints carry **`executed_at`** (ISO) + `trf_executed_at`, `price`, `size`, `premium`, `volume`, `market_center`, `nbbo_bid/ask(+qty)`, `sale_cond_codes`, `ext_hour_sold_codes`, `canceled`, `tracking_id` **[LIVE, confirmed earlier]**. We already fetch this but **ignore the timestamps** (FLAG-2 recency). |

### 2c. Options flow / net premium / sweeps / 0DTE
| Endpoint | Returns | In code? |
|---|---|---|
| **`/api/stock/{t}/net-prem-ticks`** | **1-minute** `net_call_premium`/`net_put_premium`/`net_delta` + bid/ask-side volume splits — per-ticker directional-pressure tape **[DOC]** | **NO** |
| **`/api/stock/{t}/flow-per-strike-intraday`** | timestamped intraday flow **per strike** (premium/volume/trades, side-split) **[DOC]** | **NO** |
| `/api/option-trades/flow-alerts` (ours) | adds **`has_sweep`, `has_floor`, `has_multileg`, `volume_oi_ratio`, `open_interest`**; 0DTE via `min_dte=0&max_dte=0` **[DOC]** | YES (but we drop the sweep/0DTE flags) |
| `/api/option-trades/…` lit-flow recent | on-exchange option prints | no |

### 2d. Real-time / WebSocket
UW advertises **WebSocket channels incl. a GEX stream** (prices, flow alerts, news, GEX) **[DOC, channel
names unconfirmed]**. Practical REST "near-real-time" feeds for us: `spot-exposures` (1-min),
`net-prem-ticks` (1-min), `flow-per-strike-intraday`, `greek-flow`, `etf-tide`/`tide`.

### 2e. Plan tier — **must verify against your token**
API is a **separate purchase** from the web sub: **Basic ~$150/mo, Advanced ~$375/mo** (+ ~$250/mo for
historical full-market trades) **[DOC, May-2025 pricing — confirm current]**. UW does **not** print
per-endpoint tier gates in the docs; it's enforced at the token. **Action: call `/gex-levels`,
`/spot-exposures`, `/spot-exposures/strike`, `/net-prem-ticks` with your key and check for a 403/plan
error** — the gamma/spot endpoints are the most likely Advanced-tier items. [INFERRED]

---

## 3. Scalp-relevance ranking (for the gamma-magnet model)

**The model (restated):** PR levels (U2/U1/MID/L1/L2) are reaction zones; **gamma zones are magnets** —
price is pulled toward strong gamma; a PR level *between* price and a magnet tends to **break** (price
wants the magnet), a level *at/beyond* the magnet is where price **stalls/reverses**. Scalp horizon
(minutes), confirmed on TV volume+candles. Ranking is by: *does this sharpen "stall / fade-long /
fade-short / break-through at this level right now?"*

### TIER S — transformative; directly powers the magnet logic (not in our code)
1. **`/gex-levels` → `gamma_magnet`, `gamma_flip`, `call_wall`, `put_wall`.** This *is* your magnet model
   as first-class data. **`gamma_magnet`** = the pull target → a PR level between spot and the magnet is a
   break candidate; a PR level at the wall is a stall/reverse candidate. **`gamma_flip`** gives the
   *regime direction*: spot **above** flip = positive-gamma = dealers mean-revert = **pinning** (PR levels
   hold, fade extremes); spot **below** flip = negative-gamma = dealers amplify = **trending** (PR levels
   break, momentum). This single endpoint converts your manual read into a computable per-level
   stall-vs-break probability.
2. **`/spot-exposures/strike` (intraday per-strike γ).** Build **live** walls/magnet from `call_gamma_oi`/
   `put_gamma_oi` per strike, so the magnet tracks *now*, not yesterday's close — essential if `/gex-levels`
   proves EOD-only. Lets you measure **magnet strength** (how much GEX) to weight break probability.
3. **`/spot-exposures` (1-min aggregate γ/charm).** Net-gamma sign + magnitude **intraday** = the
   pin-vs-expansion regime in real time (replaces the dead, EOD, by-expiry `< -50000` heuristic). **Charm**
   (gamma decay into the close) is a genuine 0DTE-scalp edge — pin strength rises into the afternoon.

### TIER A — strong confirmation of direction/timing
4. **`/net-prem-ticks` (1-min net call/put premium).** The directional *push*: is flow pressing price
   toward or away from the magnet right now? Confirms fade-long vs fade-short at a level. Per-ticker analog
   of the market-tide we already use for the slow read.
5. **`/flow-per-strike-intraday`.** See flow *hitting the wall strikes* live — confirmation that a magnet
   is active/defended at the moment price tests the adjacent PR level.
6. **Dark pool recency (we already fetch `/api/darkpool/QQQ`; just use `executed_at`).** FLAG-2 fix: a
   recency-weighted DP read sharpens "are institutions defending this level *now*." Zero new endpoint cost.

### TIER B — useful, secondary
7. **Flow-alerts sweeps + 0DTE flags** (`has_sweep`, `min_dte=0`) — aggressive 0DTE sweeps near a PR level
   = short-term conviction; we fetch the endpoint and drop these flags.
8. `/greek-flow` (delta/vega flow) — directional, but not the gamma-magnet signal; modest.
9. `put-call-ratio` — coarse sentiment.

### TIER C — low value for minutes-horizon scalping
ETF-tide / market-tide (session-slow), options-volume (session-wide), sector-etfs, top-net-impact,
economic-calendar, news, earnings, seasonality/shorts/insider/congress/institutions/screener. Context, not
triggers.

### Does UW expose what the model needs? — point answers
- **Precise gamma levels beyond the heat zones we show?** **Yes, emphatically.** `gamma_flip` (zero-gamma),
  `call_wall`/`put_wall`, and `gamma_magnet` via `/gex-levels`; full per-strike net GEX via
  `greek-exposure/strike` (static) and `spot-exposures/strike` (intraday). We currently surface **none** of
  these as price levels.
- **Recent/real-time dark pool with timestamps for recency?** **Yes** — `executed_at` is already in the
  responses we fetch; we just don't use it.
- **Anything that detects the magnet pull directionally?** **Yes** — `gamma_flip` (regime: pin vs trend) +
  `gamma_magnet` (the target) + `/spot-exposures` sign (positive→pin, negative→accelerate) +
  `/net-prem-ticks` (the flow pushing toward/away). That quartet *is* a directional magnet detector.

---

## 4. The gamma data specifically

- **What feeds our displayed "gamma heat zones":** `GET /api/stock/QQQ/greek-exposure/**expiry**`
  (via `/api-data/gex-expiry` → `GexByExpiry` card), bucketed by **time-to-expiry** (today/week/later) and
  reduced to a net-GEX **regime** (`expansion`/`pinning`). **This is GEX by expiry, not by price-strike** —
  it is *not* a price-magnet map, despite reading like one. The Catalyst note uses the same source
  (`netGex < -50000 → expansion`). **[CODE]**
- **What granularity UW provides:** all of it — **walls + flip + magnet** (`/gex-levels`), **per-strike**
  (static `greek-exposure/strike`; intraday `spot-exposures/strike`), **aggregate intraday 1-min**
  (`spot-exposures`), **by expiry** (what we show), plus charm/vanna everywhere.
- **Gamma fields we fetch but DON'T use:** from `greek-exposure/strike` (already fetched in scoring) we
  compute per-level net GEX in `gexContext()` then **drop it from the payload (FLAG-4)** — so per-strike
  gamma, `call_delta`/`put_delta`, `call_charm`/`put_charm`, `call_vanna`/`put_vanna` are all fetched-then-
  discarded. **Gamma endpoints we don't fetch at all:** `/gex-levels`, `/spot-exposures`,
  `/spot-exposures/strike`, `/spot-exposures/expiry-strike`, `/greek-exposure` (aggregate).

---

## 5. Honest verdict — keep or cancel?

**There is materially useful UW data we are not using — and it is exactly the data this model needs.** The
user's two instincts are both correct: (a) "we use a fraction" — ~3 of 17+ endpoints do analytic work; and
(b) "gamma is display-only, not in scoring" — the per-strike GEX is computed then dropped (FLAG-4), and what
we display is a by-*expiry* regime, not the price-magnet levels. The magnet model the user trades by hand —
"price is pulled to strong gamma; a PR level between spot and the magnet breaks; a level at the wall
stalls" — maps **directly** onto `gamma_magnet` + `gamma_flip` + `call_wall`/`put_wall` from a single
endpoint (`/gex-levels`) we don't call, sharpened by `/spot-exposures` (intraday strength/regime) and
`/net-prem-ticks` (directional push). This is a real, buildable edge, not a reskin.

**So this is NOT "we already access the useful parts and display them poorly."** We *partly* are (DP
recency, the discarded per-strike GEX) — but the core magnet primitives (`/gex-levels`, `/spot-exposures*`)
we **don't fetch at all**. The useful gamma surface is largely untouched.

**Keep/cancel recommendation:**
- **KEEP — *conditional on building the gamma-levels integration.*** UW is one of the few retail sources of
  per-strike/intraday GEX and explicit wall/flip/magnet levels; for a gamma-magnet scalper that's the
  differentiated value, and it's on the plan. The justification is the *unbuilt* capability, not today's
  usage.
- **If you will NOT build it, lean CANCEL.** On what we render today — a dark-pool/flow score and a
  by-expiry pinning note — the subscription is hard to justify; most of that read is approximable elsewhere,
  and we already flagged large chunks as dead (expansion-GEX) or unused.

**Two checks before committing the spend:**
1. **Tier-gate test (do this first):** call `/api/stock/QQQ/gex-levels`, `/spot-exposures`,
   `/spot-exposures/strike`, `/net-prem-ticks` with your key. If any 403/plan-error, the magnet build needs
   the **Advanced** tier (~$375/mo) — price that into keep/cancel.
2. **`/gex-levels` cadence:** confirm whether it updates intraday or only daily. If daily-only, the live
   magnet must be built from `/spot-exposures/strike` (intraday) — more work, but fully supported.

**Frozen-constraints note (for the eventual build):** `fetchData.js`, the scorer, the ratio system, and
QQQ handling are untouchable — any adoption is **additive** (new fetchers + a new gamma-levels module +
display), never edits to those. The natural shape: a `/api-data/gex-levels` proxy + a gamma-magnet overlay
on the price ladder (walls/flip/magnet as horizontal lines), and — only if you choose to let it influence
the read — a *display-layer* verdict input (à la the recent decision layer), never a change to the scoring
engine itself.

---

*Compiled 2026-06 from repo code (verified), UW OpenAPI docs, and live UW MCP field confirmation. Endpoint
paths and gamma field names confirmed where tagged [LIVE]/[DOC]; cadence and tier gates tagged [INFERRED]
require verification against your specific UW token.*
