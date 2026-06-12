# Evidence Pipeline — Definitive Reference

How live Unusual Whales (UW) data becomes the **evidence** the Intraday tab renders: every fetch, how
raw prints/flow/GEX become per-level signals, what happens on failure, how old the data can be, and how
it reaches the screen. Written to be **understood and verified before debugging** — every fact below was
checked against source. Line numbers drift; search by symbol name.

> **Sibling docs.** [SCORING.md](SCORING.md) is the scoring *algorithm* (weights, thresholds,
> classification, rescore triggers, polling/budget, narratives, Catalyst). [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md)
> is the *level engine* (LuxAlgo recurrence, cold-start, ratio, rounding). **This doc** is the *data/evidence
> layer between them* — the fetch → filter → aggregate → SSE → render path that turns UW responses into
> what you see. Where it overlaps SCORING.md (dark-pool strength, classification, cascade), the algorithm
> detail lives there; here we trace the *data flow and its failure/freshness behavior*.

> **Frozen source.** `server/scorer/fetchData.js` and `server/scorer/scoreLevel.js` are ⚠️ DO NOT MODIFY;
> `server/scorer/index.js` is treated as frozen. This doc describes what they *do* — it changes nothing.

---

## 0. The pipeline at a glance

```
RestDataProvider._poll()  (adaptive 2–10s near levels, 5m overnight)
  └─ getCurrentPrice()  →  GET /api/stock/QQQ/stock-state   ← live QQQ quote (timing only)
  └─ _shouldRescore(price)?  →  onRescore callback (server/index.js:896)
       └─ runScoreWithNq → runFullScore({levelsOverride})   (server/scorer/index.js:50)
            ├─ getDarkPool(QQQ)      GET /api/darkpool/QQQ
            ├─ getOptionsFlow(QQQ)   GET /api/option-trades/flow-alerts
            ├─ getOptionsVolume(QQQ) GET /api/stock/QQQ/options-volume
            ├─ getGEXStrikes(QQQ)    GET /api/stock/QQQ/greek-exposure/strike
            └─ getEtfTide(QQQ)       GET /api/market/QQQ/etf-tide
            → per-level scoreLevel() + classifyLevel() + gexContext()      (scoreLevel.js)
            → result { current_price, levels[], cascade, structure_break }
       └─ updateDpHistory · checkExpansionGex · trackLevelTouches · computeSentiment
       └─ emitStaleIfChanged  → SSE chart_stale
       └─ SSE rescore { result, dpHistory, expansionGex, sentiment }
            → useSSE.js → Intraday.jsx → PriceLadder / RightRail / FocusMode / DarkPoolChart / LevelDetailSheet
```

Two distinct prices flow through, and conflating them is the #1 source of confusion:

| "Current price" | Source | Used for |
|---|---|---|
| **Poll price** | `GET /api/stock/QQQ/stock-state` → `close‖last‖price` (`RestDataProvider.getCurrentPrice`, RestDataProvider.js:54) | *When* to rescore (triggers/intervals), price ticks, `priceData` SSE |
| **Scored `current_price`** | **newest dark-pool print** `dpPrints[0].price` (scorer/index.js:94–99) | structure-break math, frontend distance/proximity, ladder position |

The frontend prefers the live poll price (`priceData?.price ?? result?.current_price`, Intraday.jsx:69), but
structure-break and the scored result carry the **DP-print price**, which can lag the live quote.

---

## 1. Fetch layer — endpoints, fields, cadence, **failure behavior** (critical)

### 1.1 The transport

Both fetch layers are thin wrappers around `fetch` with the same headers and the same **throw-on-non-OK**
contract — there is no retry, no backoff, no timeout anywhere:

- `server/scorer/fetchData.js` `uwGet()` (line 13): `if (!res.ok) throw new Error('UW API … → status')`. Header `UW-CLIENT-API-ID: 100001` + bearer.
- `server/dataProvider/RestDataProvider.js` `_uwGet()` (line 46): identical throw contract, used only by `getCurrentPrice`.
- **No `AbortController` / timeout** — a hung UW socket hangs the poll/score until the OS/socket times out.

### 1.2 The five scoring fetches (`runFullScore`, scorer/index.js:73–78)

They run **sequentially with a 400 ms delay between each** (rate-limit courtesy), so a full score does ≥5
serial round-trips (~2 s+ of fetch latency minimum):

| # | Call | Endpoint | Fields consumed | Feeds |
|---|---|---|---|---|
| 1 | `getDarkPool` | `/api/darkpool/QQQ` | `price‖executed_price`, `premium‖notional‖size` | DP strength, `current_price` |
| 2 | `getOptionsFlow` | `/api/option-trades/flow-alerts?ticker_symbol=QQQ` | `strike‖strike_price`, `total_premium‖premium`, `type‖sentiment‖put_call` | flow bias (±0.30% window) |
| 3 | `getOptionsVolume` | `/api/stock/QQQ/options-volume` | `call_volume‖calls_volume`, `put_volume‖puts_volume` | options bias (session-wide) |
| 4 | `getGEXStrikes` | `/api/stock/QQQ/greek-exposure/strike` | `strike`, `call_gex`, `put_gex` | GEX context + extension level |
| 5 | `getEtfTide` | `/api/market/QQQ/etf-tide` | `net_call_premium`, `net_put_premium` | session ETF tide bias |

**Cadence** comes entirely from `RestDataProvider` (pollingConfig.js); the fetches fire only when a poll
decides to rescore:

- **Adaptive poll interval** by distance to nearest *classified* level (`_getInterval`, RestDataProvider.js:73): `>2.00→quiet 10s`, `>1.00→approaching 5s`, `>0.50→near 5s`, `>0.25→close 3s`, `>0.10→veryClose 2s`, else `atLevel 2s`. Outside 8:30–16:30 ET → `overnightInterval 5m`.
- **Rescore triggers** (`_shouldRescore`, line 93): within `±0.15` of any level, **or** price moved `≥$1.00` since last rescore, **or** `15-min` time fallback. Outside market hours rescores are **off** (`overnightRescores:false`).
- **Budget**: 15 000 calls/day; amber at 80% of 14 000; **auto-pause at 14 000** (`_incrementBudget`, line 114). Only `getCurrentPrice` increments the counter — **the 5 scoring fetches are not counted** (see FLAG-7).

### 1.3 Failure behavior — enumerated per layer

> **The single most important property of this pipeline: scoring is all-or-nothing.** The five fetches
> have **no individual try/catch** (scorer/index.js:73–78). The first one that throws rejects the whole
> `runFullScore` promise — there is no partial score, no per-feed fallback, no zero-fill at the fetch layer.

| Failure | Where caught | Behavior | Visible? |
|---|---|---|---|
| **Any of the 5 scoring fetches non-OK / throws** | `onRescore` catch (index.js:985) | `console.error('[server] Auto-rescore failed:', msg)`. **`latest` is NOT updated, no SSE emitted.** Frontend keeps showing the last good result — **stale, unmarked** (see FLAG-1). | ⚠️ log only |
| same, via `runAutoRescore` | index.js:2693 (catch) | `console.error('[rescore] failed …')`; `latest` unchanged | log only |
| same, via `applyAutoLevelsIfEnabled` inline rescore | index.js:2651 | `console.error('[levels] auto rescore failed:', msg)`; `latest` unchanged | log only |
| **`getCurrentPrice` (poll) throws** | `_poll` catch (RestDataProvider.js:148) | `console.warn('[DataProvider] Poll error:', msg)`; `lastPrice` **carries forward**; reschedules next poll | ⚠️ warn only |
| **Empty/empty-`data` response** (200 but no rows) | not an error | Each consumer no-ops to **neutral 0 / null** via `?.data ?? x ?? []` — see §2. DP-empty ⇒ `current_price = null`. **No throw, no flag.** | invisible |
| **Narrative / brief / assistant-read LLM failure** | `.catch` per call (index.js:959/968/976/984) | `console.warn`; that SSE simply never fires — field stays blank on the client | warn only |
| **Startup state restores** (settings/pause/symbol/trades) | bare `catch {}` (index.js:93/105/115/140/151/183) | silently fall back to defaults | invisible |

**Bottom line:** every fetch failure is either a *full-score abort that carries the previous result
forward unmarked*, or a *silent neutral-fill*. Nothing in the evidence path zero-fills a partial score,
and nothing surfaces "this number is stale" to the user. The only freshness contract that exists is on the
**ratio lock** and the **PR (Labs) engine** — not on evidence. (See §3.)

---

## 2. Filtering & aggregation — raw UW → per-level evidence

All per-level math is in the frozen `server/scorer/scoreLevel.js`; the cross-level/cascade/structure logic
is in `server/scorer/index.js`. Every magic number with its location:

### 2.1 Dark-pool strength — `computeDarkPoolStrength` (scoreLevel.js:34)

- Window: `±0.30%` of the level price (`WINDOW_PCT = 0.0030`, line 8). `below = [L·0.997, L]`, `above = (L, L·1.003]`.
- For every print: `notional = premium ‖ notional ‖ size` (line 47); accumulate into `belowNotional` / `aboveNotional`.
- Output: `(below − above) / total` ∈ [−1, 1] (positive = bullish/at-or-below). `total === 0 → 0`.
- **No recency filter. No size/notional minimum. No de-duplication.** Every print UW returns in the window
  is summed regardless of age (see FLAG-2). Contrast the PR engine, which aborts on bars >30 min old.

### 2.2 Flow bias — `computeFlowBias` (scoreLevel.js:60)

- Strike window: `±0.30%` (`L·0.997 … L·1.003`). Side from `type ‖ sentiment ‖ put_call` (line 75).
- Premium = `total_premium ‖ premium`; sum bullish vs bearish; bias `(bull − bear)/total` ∈ [−1,1].
- **Sparse-match guard:** `MIN_FLOW_MATCHES = 4` (line 96). If fewer than 4 alerts matched the window,
  `flowBiasEffective = 0` and `flow_zeroed = true` (lines 97–98). Raw bias is still reported for display
  (`raw.flow_bias`) but `flow_bias_used` is the zeroed value.

### 2.3 Options bias — `computeOptionsBias` (scoreLevel.js:20)

- Session-wide, **identical across all five levels**: `(callVol − putVol)/total` ∈ [−1,1]. `total 0 → 0`.

### 2.4 Distance weighting — **inert** (scoreLevel.js:104)

- `distance100 = 50` is a **hardcoded neutral constant** ("no live price available"). With `W4 = 0.10`
  it contributes a fixed +5 to every composite. The 10% distance term does nothing (see FLAG-3; also noted in SCORING.md).

### 2.5 Composite, classification, confidence

- `composite = round(0.35·options + 0.35·darkpool + 0.20·flow + 0.10·distance)` (each scaled 0–100 via `to100`).
- `buy = composite`, `sell = 100 − composite`, `continuation = round(|mean(raws)|·100)`.
- `classifyLevel` (line 140): `buy≥65 ∧ buy−sell≥15 → buy_support`; `sell≥65 ∧ sell−buy≥15 → sell_resistance`;
  `cont≥60 ∧ min(buy,sell)<45 → continuation`; else `no_edge`. Structural conflict if classification fights `type`.
- `getConfidenceTier` (line 207): `none` if `no_edge` or `flow_match_count<4` or `score<65`; `high` if `score≥70 ∧ flow≥8`; else `medium`. Then **ETF-tide modifier** `applyEtfTierModifier` (index.js:21) bumps tier ±1 when the session tide agrees/disagrees with the classification.

### 2.6 ETF tide bias — `runFullScore` (scorer/index.js:80–92)

- Bars filtered to `net_call_premium !== null`; compare newest bar vs **31 bars ago** (`at(-31)`, ~30-bar lookback).
- `sessionFlowBias` = `bullish/bearish` only if `|call−put| / max > 0.10`; else `neutral`; `no data` if zero bars.

### 2.7 Cross-level signals (scorer/index.js)

- **`current_price`** = newest DP print price, or `null` if no prints (lines 94–99).
- **Cascade** (lines 119–121, 172): `active = cond1 ∧ cond2 ∧ cond3` where `cond1 = MID.dp ≤ −0.700`,
  `cond2 = S1.dp ∈ {0,−1}`, `cond3 = S2.flow_zeroed ∧ S2.dp === 0`. Emitted as `{active, mid_dp}` **only** —
  there is **no `conditions` array** (see FLAG-5).
- **Structure break** (lines 124–130): `breakUp = price > R2`, `breakDown = price < S2`; `r3` extension =
  highest-|netGEX| strike in `[R2, R2·1.02]` (up) or `[S2·0.98, S2]` (down) via `findExtensionLevel`.
- **Per-level payload** (`levelPayloads`, lines 134–165): `id, price, type, classification, score,
  confidence, dark_pool, etf_direction, full_stack, conflict, boundary, lower_high, passive_target,
  passive_target_from`. **Note what is *absent*: `net_gex` / `gex` are not copied onto the payload** even
  though `gexContext` computed them — see FLAG-4.

### 2.8 GEX context — `gexContext` (scoreLevel.js:173, **display-only, not in score**)

- Window `±1.0%` (`GEX_WINDOW_PCT = 0.010`). `gex_bias = pinning` if `net>0`, `expansion` if `net<0`, within a
  5%-of-absolute neutral band. Computed per level into `results[i].gex` — then dropped from the payload (FLAG-4).

---

## 3. Staleness & freshness — how old can what you see be?

| Data type | Freshness guard? | Max age before render | Marked stale on screen? |
|---|---|---|---|
| **Ratio lock** | ✅ `getFreshLiveRatio` 30-min (index.js:2481) — defers lock if `_received_at` >30 min | n/a (defers) | n/a |
| **PR / Labs bars** | ✅ `barsAreFresh` 30-min during market hours (index.js:2291) — aborts, state not written | 30 min | `labs_no_fresh_data` SSE |
| **Score result `_received_at`** | stamped on every result (index.js:923, 1110, 2703…) | — | **never checked on consumption** |
| **Dark-pool prints** | ❌ none (scoreLevel.js:34) | unbounded — whatever UW returns | no |
| **`current_price` (DP print)** | ❌ none | as old as the newest print | no |
| **Cascade / classification** | ❌ none (derived from the score) | as old as `latest` | only via `chart_stale` diff |
| **`dpHistory`** | timestamped per entry, **capped at 8, no TTL** (index.js:770) | 8 readings, any age | no age shown |
| **Level touches** | ❌ none | today's DB rows | no |

**The evidence layer now has a recency signal (Batch A).** `dataStale`/`dataAgeSec` are computed from
`latest._received_at` by a consecutive-failure counter + a market-hours age threshold, surfaced on the
`price` SSE and `/status`, and rendered as a muted stale chip — closing the gap below. *(Historical context
before Batch A:)* `_received_at` was stamped but never read before serving or rendering. When a score fails to refresh (any fetch error, or paused/overnight),
`latest` simply persists and every consumer — narratives, sentiment, Catalyst, the Intraday cards — renders
the old numbers identically to fresh ones. The only "something changed" signal is `chart_stale`, and it
only fires when *classification / full_stack / cascade* differ between two results (index.js:843
`detectChanges`); a stale-but-unchanged result produces no badge at all. (See FLAG-1.)

---

## 4. Symbol handling — NQ/QQQ and the ratio

- **Scoring is always QQQ.** `getLevelsForScoring` (index.js:19) pulls `r2_qqq…s2_qqq` from `daily_levels`;
  NQ is canonical storage/display only (per CLAUDE.md). `runScoreWithNq` then re-attaches `lv.nq_price`
  from the `*_nq` columns for display (index.js:2556).
- **Evidence render uses the live ratio.** Intraday.jsx:65 reads `nqRatio = result.nq_ratio` (the ratio the
  score was built with) and derives `nqPrice = round(price·ratio·4)/4`. All Intraday children
  (PriceLadder/RightRail/FocusMode/LevelDetailSheet) display NQ via `levelNq(level, nqRatio)` — which
  **prefers the stored `level.nq_price`** and only falls back to `price·ratio` rounding. So the tab itself
  is **live**, not frozen.
- **`getActiveRatio` chain** (index.js:2476): `sessionRatio ‖ nqOffsets.ratio ‖ latest.nq_ratio ‖ db ‖ 41.14`.
- **Three hardcoded `41.14` fallbacks** (index.js:2477, 2967, 3360). The two at 2967 (`/labs/apply-to-main`)
  and 3360 (Catalyst cache) **bypass `getActiveRatio`**, so they ignore a locked `sessionRatio`/`nqOffsets`
  — see FLAG-6. (Frontend `41.14` literals exist only in the **config UIs** — LevelsTab/SystemPanel — not in
  the Intraday evidence render.)

---

## 5. Server → frontend — SSE events & endpoints

### 5.1 SSE client

`src/hooks/useSSE.js` opens `EventSource(`${API}/stream`)`, debounces rescores (~2 s), keeps a rolling
`history` buffer (50 events), and exposes `rescoreData / priceData / dpHistory / expansionGex / sentiment /
cascade / levelNarratives / assistantRead / chartStale …`. `Intraday.jsx` derives `result`, `currentPrice`,
`nqRatio`, `nqPrice`, `cascade` and fans them to the evidence components.

### 5.2 Evidence-carrying SSE events

| Event | Emitted at | Carries | Consumed by |
|---|---|---|---|
| `rescore` | index.js:938 / 1124 / 2718 | `result {levels, cascade, current_price, nq_ratio, structure_break, scored_at}`, `dpHistory`, `expansionGex`, `sentiment` | all Intraday components |
| `price` | index.js:905 / 1037 | `price, interval, isMarketHours, cascade` | live header / ladder position |
| `chart_stale` | index.js:879 (via `emitStaleIfChanged`) | `changes[], message` | "LEVELS CHANGED" banner |
| `expansion_gex` | index.js:833 | `levels[], consecutivePinningSessions, message` | ladder GEX toggle — **always empty, FLAG-4** |
| `narrative_update` / `level_narratives_update` / `session_brief_update` / `assistant_read_update` | index.js:955/964/972/981 (+manual/scoreNow) | LLM text | narrative blocks |

Control/meta events (not evidence): `labs_levels_update`, `labs_levels_changed`, `labs_no_fresh_data`,
`levels_auto_updated`, `levels_pending/dismissed`, `ratio_locked`, `contract_rollover/ready`,
`system_paused/resumed`, `symbol_changed`, `chart_synced`, `heartbeat`, `trade_entered/exited`,
`auto_score_changed`, `level_source_mode_changed`, `level_update_alert`. (No event of `type:'sentiment'`
is ever emitted — sentiment rides inside `rescore`.)

### 5.3 REST evidence endpoints

`/latest`, `/history`, `/status`, `/dp-history`, `/price-history`, `/level-touches`, `/labs/auto-levels`,
`/labs/scoring-latest`, `/catalyst/data`, plus the LLM-text endpoints. `/latest`, `/history`, `/health`
expose `_received_at`; `/levels*` return raw DB rows **without any timestamp** (see FLAG-1 — a client has no
way to tell how old `/levels` is).

### 5.4 Frontend-side transforms (applied on top of server data)

- **DP bar fill:** `((dp + 1) / 2) · 100` — repeated inline in RightRail / FocusMode / PriceLadder /
  LevelDetailSheet / EvidenceMeter / `DpBar.jsx` / `DpSparkline.jsx` (no shared helper).
- **NQ conversion / distance:** `round(price·nqRatio·4)/4` (¼-point), via `levelNq()` (prefers stored `nq_price`).
- **Proximity zones** (`src/utils/proximity.js`): `critical ≤0.15`, `near ≤0.50`, `watching ≤1.00`. Pulse only on `critical`.
- **Velocity** (useSSE): `Δprice/Δt` over recent ticks; FocusMode arrows at `0.05 / 0.02 / 0.005`.
- **Sparkline trend color:** `±0.05`. **DP-condition labels** (`src/utils/dpLabels.js`): bands at `±0.300 / ±0.700`.
- **Cascade threshold `-0.700` (and warn `-0.500`)** is **hardcoded into ~18 frontend files + 4 utils** (FLAG-8).
- **EvidenceMeter ETF tide** is rendered from **hardcoded 62/38/50** percentages, not from data (FLAG-9).

---

## 6. Expected behaviors & invariants

1. A `rescore` SSE is **complete or absent** — never partial. If any feed fails the whole score aborts and
   the previous `latest` persists. Consumers must assume "no update" ≠ "no signal."
2. Scoring operates on **QQQ**; NQ shown in the UI is `level.nq_price` (stored) first, ratio-derived second.
   Displays must never reconstruct NQ from QQQ when `nq_price` exists.
3. `current_price` in a `result` is the **newest dark-pool print**, not a live quote; the live quote is the
   `price` SSE. Distance/structure math is print-relative.
4. `dpHistory` is a **rolling last-8 per level**, in emission order; it is *not* a time series with gaps —
   absence of a tick means "no rescore happened," not "DP was zero."
5. Dark-pool strength and flow bias are **window-bounded** (±0.30% of the level) and **un-aged** — they
   reflect whatever UW returned this fetch, however old.
6. Cascade is **binary** (`active`) from three DP/flow conditions; any "armed/condition-1" UI text is
   reading a field that does not exist (FLAG-5).
7. Freshness is guaranteed only for the **ratio lock** and **PR bars** (both 30-min). Everything in the
   evidence path can be arbitrarily stale and renders identically to fresh.

---

## 7. Troubleshooting — symptom → cause → log line

| Symptom | Likely cause | Log line / gap |
|---|---|---|
| Evidence frozen, no banner, prices not moving | A scoring fetch is failing → whole score aborts, `latest` carried forward | `[server] Auto-rescore failed: …` (index.js:986) — **the only signal; no SSE, no UI flag** |
| Price ticks but levels never re-score | `getCurrentPrice` failing, or budget paused, or outside hours | `[DataProvider] Poll error:` / `Budget exhausted (…/14000) — pausing` / `outside market hours` |
| DP bar looks stale vs the tape | No recency filter — window sums old prints; or score hasn't refreshed | **no log** (FLAG-2 — invisible) |
| Classification flip felt late | Rescore gated by triggers (±0.15 / $1 / 15-min) — between triggers nothing re-scores | `[DataProvider] Rescore triggered: …` shows the cadence; absence = gated |
| "LEVELS CHANGED" badge never fired on an obvious move | `detectChanges` only diffs classification/full_stack/cascade; a score that didn't cross a boundary emits nothing | `[server] Chart stale: …` present only on a real diff |
| EXPANSION GEX never appears | `net_gex` is dropped from the level payload → all readers see `undefined` | **no log** (FLAG-4 — silently dead) |
| "CAUTION / cascade armed" never shows | `cascade.conditions` is never populated | **no log** (FLAG-5 — silently dead) |
| NQ levels right on Intraday but wrong after "apply to main" | `/labs/apply-to-main` uses `|| 41.14`, bypassing the locked ratio | `[labs] applied to main …` (no ratio-source warning) (FLAG-6) |
| Touch counts missing | `level_touches` insert threw and was swallowed | **no log** (FLAG-3 — `catch {}` at index.js:801) |
| `/levels` consumer can't tell data age | endpoint returns raw row, no timestamp | **no field** (FLAG-1) |

---

## 8. FLAGGED — documented, not fixed

> Per the audit rule: each item below was re-read in source before flagging. **No code was changed.**

- **FLAG-1 — Stale renders as fresh (systemic).** ✅ *Resolved in Batch A.* `dataStale`/`dataAgeSec` now
  ride the `price` SSE (every poll) + `/status`, driven by a consecutive-failure counter (N=2) and a
  market-hours age threshold (~1.5× the 15-min rescore guarantee); a muted stale chip renders on Intraday and
  `[scorer] DATA STALE …` logs once per episode. The five fetches degrade per-source (FLAG below), with dark
  pool a named hard-abort. *(`/levels*` still carry no timestamp — minor, unaddressed.)*
- **FLAG-2 — No recency/size filter on dark-pool prints.** `computeDarkPoolStrength` (scoreLevel.js:34) sums
  every print in the ±0.30% window regardless of timestamp or size. (Frozen file — flag only.)
- **FLAG-3 — Distance weighting is inert.** `distance100 = 50` constant (scoreLevel.js:104); the 10% term is
  a fixed +5. (Also noted in SCORING.md; frozen file.)
- **FLAG-4 — Expansion-GEX signal is dead.** `gexContext` computes `{net_gex, gex_bias}` into `results[i].gex`
  (scorer/index.js:105) but `levelPayloads` (134–165) never copies it onto `result.levels`. Every downstream
  read — `detectExpansionGex`/`checkExpansionGex` (index.js:810,830), `expansion_gex_levels` (213), narrative
  branches (240, 328, 399), and the frontend ladder GEX toggle — sees `undefined`/`0`, so `(net_gex) < 0` is
  never true. The `expansion_gex` SSE always carries an empty list. *Impact: an advertised evidence signal
  never fires.*
- **FLAG-5 — `cascade.conditions` never exists → "armed/CAUTION" path dead.** `runFullScore` emits
  `cascade = {active, mid_dp}` only (scorer/index.js:172). Six readers of `cascade?.conditions?.[0]`
  (index.js:207, 247, 406, 538, 746, 1046) therefore always see `undefined`: `computeSentiment`'s `cascadeArmed`
  is permanently `false` so the `CAUTION` state is unreachable, the narrative "ARMED (condition 1 met)" branch
  never prints, and `/status` falls back to `[false,false,false]`. *Impact: a whole sentiment/narrative tier
  is unreachable.*
- **FLAG-6 — Two `41.14` fallbacks bypass the ratio lock.** ✅ *Resolved in Batch A.* Both `/labs/apply-to-main`
  and the Catalyst cache now call `getActiveRatio()`, so `sessionRatio`/`nqOffsets` always win and `41.14` is
  reachable only as the genuine final fallback. The live risk was the new-day pre-first-score window (db +
  latest both null), where a manual morning apply-to-main could persist 41.14-derived QQQ despite a restored lock.
- **FLAG-7 — Scoring fetches aren't budgeted.** Only `getCurrentPrice` increments the 15 000/day counter
  (RestDataProvider.js:55); the five `runFullScore` fetches don't, so real UW usage exceeds the tracked count
  and the auto-pause guard understates consumption.
- **FLAG-8 — Cascade thresholds hardcoded & duplicated.** `-0.700`/`-0.500` are inlined across ~18 frontend
  components + `proximity.js`/`dpLabels.js`/`tradeSetup.js`/`holdExit.js`, matching the server's `cond1`
  (`≤ -0.700`) with no shared constant. *Impact: maintainability — a threshold change must touch ~20 files.*
- **FLAG-9 — EvidenceMeter ETF tide is faked.** `etfPct` is a hardcoded 62/38/50 by direction
  (`EvidenceMeter.jsx`), not derived from tide data — the bar height is decorative.
- **FLAG-10 — Silent neutral-fill on empty responses.** Every consumer collapses an empty/200-no-data UW
  response to neutral `0`/`null` via `?.data ?? x ?? []`; an empty dark-pool response yields
  `current_price = null` with no warning. Indistinguishable from genuinely neutral data.

---

## 9. Live-session observations

*No timestamped observations were supplied with this audit request (the template placeholder was left
unfilled).* The general audit above stands on its own; when a session flags a specific symptom, map it via
the §7 table — and note that several plausible "looked stale / fired late" symptoms (FLAG-1, 2, 4, 5) are
**currently invisible in logs**, so reproducing them needs the source paths above, not a log grep.

---

*Verified against source on 2026-06-12. Frozen files (`fetchData.js`, `scoreLevel.js`, `scorer/index.js`)
described, not modified. Cross-refs: [SCORING.md](SCORING.md) · [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md) · [CLAUDE.md](../CLAUDE.md).*
