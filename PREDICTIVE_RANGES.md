# Predictive Ranges — Definitive Reference

The authoritative reference for the TradesAlgo Predictive Ranges (PR) system. Written so a
person or a future Claude session can **understand, verify, and safely modify** it without
re-deriving anything from code. Every constant, key name, formula, and threshold below was
checked against `server/index.js` as of commit `2bcfc95`. Line numbers drift as the file
changes — search by symbol name, not line.

> **Single most important concept:** the recurrence is **path-dependent**. The result on any
> bar depends on the *entire* history of closed bars. You can never recompute it from a
> sliding window, and you must never round the persisted state. The original intraday-drift
> bug existed precisely because a sliding window violated this. Read **§2** before changing
> anything.

---

## 1. What it is

**LuxAlgo Predictive Ranges** is a ratcheting-average level system. From a stream of bars it
produces five levels — **R2, R1, MID, S1, S2** — centered on a slow-moving average (`avg`)
that only moves ("ratchets") when price travels far enough from it, with band spacing
(`halfWidth`) derived from ATR.

**Why TradesAlgo uses it:** the levels are computed on **NQ futures** (native instrument,
deep tick resolution, true ETH session) and then fed — via the active NQ/QQQ ratio — into the
QQQ-side Unusual Whales scoring engine. NQ is the canonical source of truth for level prices;
QQQ values are always *derived* from NQ.

**Ground truth / parity target:** the **TradingView LuxAlgo Predictive Ranges indicator**, run
with the **same settings** (Length 200, Factor 6.0 by default), the **same contract**, and the
**ETH (24h Globex) session**. If the app and TradingView disagree at a bar close, the app is
wrong and the cause is almost always a state/feed problem in §2–§5 — not the math in §2.

---

## 2. The algorithm, exactly

### Pine (reference) vs our port

LuxAlgo Pine, per **closed** bar:

```
atr        = ta.atr(length) * mult         // RMA-smoothed ATR, scaled by factor
avg       := close - avg > atr ? avg + atr  // ratchet UP   (move BY atr, not TO close)
           : avg - close > atr ? avg - atr  // ratchet DOWN
           : avg                            // HOLD
hold_atr  := avg != avg[1] ? atr/2 : hold_atr   // halfWidth updates ONLY on ratchet bars
levels     = [avg + 2*hold_atr, avg + hold_atr, avg, avg - hold_atr, avg - 2*hold_atr]
```

Our port (`initRecurrence`, `advanceRecurrence` in `server/index.js`), per **closed** bar:

```js
const tr = trueRange(high, low, prevClose)          // max(h-l, |h-prevC|, |l-prevC|)
atrState = (atrState * (length - 1) + tr) / length  // Wilder/RMA — STATEFUL, advanced in place
const atr = atrState * mult
if      (close - avg > atr) { avg += atr; halfWidth = atr / 2 }   // ratchet up
else if (avg - close > atr) { avg -= atr; halfWidth = atr / 2 }   // ratchet down
// else: hold — avg and halfWidth both unchanged
```

Levels (`levelsFromState`):

```
R2 = avg + 2*halfWidth      R1 = avg + halfWidth      MID = avg
S1 = avg - halfWidth        S2 = avg - 2*halfWidth
```

**Verified invariants:**
- Ratchet **moves `avg` BY `atr`** (`avg += atr`), it does **not** snap `avg` to `close − halfWidth`.
- `halfWidth = atr/2` is written **only on ratchet bars**; on hold bars it keeps its previous
  value (frozen between ratchets). Level spacing is therefore uniform and equal to `halfWidth`.
- `atr = atrState * mult`, where `atrState` is the **unscaled** running RMA ATR.

### Seed semantics (cold start)

- `avg` is seeded to **the first bar's close** (`avg = closes[0]`) — matching Pine `var avg = close`.
- ATR is **zero during the first `length` warmup bars**: `initRecurrence` accumulates the first
  `length` true-range values into a buffer, sets `atrState` to their SMA once full (`seeded`
  flag), and computes `const atr = (seeded ? atrState : 0) * mult`. While `atr === 0` no ratchet
  fires — mirroring Pine `nz(ta.atr())` returning 0 before it has enough bars.
- If no ratchet ever fired across the whole warmup window, `halfWidth` falls back to
  `(atrState * mult) / 2` so the bands are never zero-width.

### Why path dependence matters (the core concept)

1. **`avg` is a ratchet** — its value on bar *t* depends on every prior ratchet, which depends
   on the exact sequence of closes. There is no closed-form; you must replay the bars in order.
2. **Wilder/RMA ATR is itself stateful** — `atrState` on bar *t* folds in *all* prior true
   ranges with exponential weight. It is not a function of the last *N* bars alone.
3. **Therefore you can never recompute from a sliding window.** Re-running the recurrence over
   "the last 250 bars" starting from a fresh seed gives a *different* `avg`/`atrState` than
   continuing the true running state — and the difference shows up as **levels that drift every
   recompute even though price structure is unchanged**. That was the original production bug
   (`e18b1a9`). The fix: persist the running state and **advance** it one closed bar at a time.

---

## 3. State & persistence

### Shape and keys

Per-timeframe SQLite `settings` row, keyed by `prAvgKey(interval) = 'labs_pr_avg_' + (interval || '5m')`:

| Key | Value |
|---|---|
| `labs_pr_avg_5m` | `{ avg, halfWidth, atrState, lastBarTs, savedAt }` |
| `labs_pr_avg_1m` | `{ avg, halfWidth, atrState, lastBarTs, savedAt }` |

- `avg` — ratcheting center (full precision)
- `halfWidth` — band spacing; held between ratchets
- `atrState` — unscaled running Wilder/RMA ATR (no `mult`)
- `lastBarTs` — ms timestamp of the last **closed** bar consumed
- `savedAt` — audit only, not used in logic

**Legacy migration:** on startup, a single legacy `labs_pr_avg` key (from before per-timeframe
state) is copied to `labs_pr_avg_5m` if that doesn't exist yet, then the legacy key is deleted.

### Advance-only

`calculateLabsLevels` loads the state and calls `advanceRecurrence`, which finds the window
index at/just-before `lastBarTs` and replays **only bars newer than `lastBarTs`**, updating
`avg`/`halfWidth`/`atrState`/`lastBarTs` in place, then persists. No new closed bar →
`barsAdvanced=0` → no-op (levels unchanged). If the saved bar predates the fetched window it
returns `{ needsReinit: true }` → cold-start (`reason=gap-too-large`).

### State is NEVER rounded

The persisted `{avg, halfWidth, atrState}` stays full precision. Rounding is an **apply-time**
display/scoring concern only (§6). Rounding the path-dependent state would compound bar over
bar and diverge from TradingView. **This is an invariant — do not violate it.**

### Per-timeframe isolation

`labs_pr_avg_5m` and `labs_pr_avg_1m` are **independent indicators with different ATR bases**.
Their levels *will* differ — that is correct, exactly as switching a TradingView chart between
5m and 1m produces different PR levels. Never try to reconcile them.

### Load-side stale discard

On load, if the state's `lastBarTs` is missing/invalid **or** older than
`MAX_STATE_AGE_MS = 5 * 24 * 60 * 60 * 1000` (**5 calendar days**, ≈3 trading days of catch-up
headroom), the state is deleted and a cold-start runs instead of advancing across a huge gap:

```
[labs] [5m] DISCARDING stale state lastBar=2026-04-10T17:11:00.000Z (62.3d old) — cold-starting
```

---

## 4. Cold-start & determinism

Cold-start runs **only** on: first-ever run for a (contract, timeframe), `/labs/reset-avg`,
contract rollover, or the `gap-too-large` reinit. Every other recalc **advances**.

### Anchored warmup → reproducible resets

The warmup window is anchored at a **fixed, persisted** point so repeated cold-starts replay
the *same* bars and produce *byte-identical* levels. The anchor lives in one row per contract:

| Key | Value |
|---|---|
| `labs_pr_anchor_{contract}` | `{ "5m": <ms>, "1m": <ms> }` |

> **Note on shape:** it is **one JSON object per contract** holding both timeframe anchors — not
> separate keys per timeframe.

`getColdStartAnchor(contract, interval)`: returns the persisted anchor for that timeframe if
present; otherwise computes one **once** and persists it:

- **5m:** `now − 60 * 24*60*60*1000` → **60 calendar days** floor.
- **1m:** `now − 14 * 24*60*60*1000` → **14 calendar days** (≈10 trading days).

Because the anchor is fixed at first cold-start and reused forever after, two resets in a row
replay identical bars → identical `avg`/`halfWidth`/`atrState` → identical levels.

> **Within-same-bar-period caveat:** "byte-identical" holds when both resets see the same set of
> *closed* bars. If a new bar closes between the two resets, the second legitimately consumes one
> more bar and differs — correct, not a regression.

Cold-start log:

```
[labs] [5m] cold-start anchor=2026-04-12T13:30:00.000Z bars=3284 seed=18421.50 (first=… last=…)
```

### `next_url` pagination

The anchor→now span can exceed one Polygon page. `fetchFromPolygonFutures` follows `next_url`
(ascending) up to a **50-page cap**, accumulating all bars, then sorts ascending by timestamp.
Advance fetches take a **single newest page** (no pagination).

---

## 5. Data feed

### Polygon futures v1 aggs — the correct params

`/futures/v1/aggs/{ticker}` is **not** the stocks-v2 aggs API. It **silently ignores** the
stocks-style `from` / `to` / `sort=desc` params (this caused months of stale-bar incidents:
ascending+limit returned oldest-from-inception bars, leaving 1m levels stuck ~25,000). The
futures endpoint honors:

```
?resolution={1min|5min|15min|1hour|1session}
&window_start.gte={ns}        // nanoseconds, as a STRING (= `${ms}000000`)
&window_start.lte={ns}        // ns exceeds Number.MAX_SAFE_INTEGER — never do ms*1e6 numerically
&sort=window_start.{asc|desc} // dotted field.direction (NOT order=, NOT bare desc)
&limit=50000
```

- **Cold-start:** `window_start.gte = anchorMs`, `sort=window_start.asc`, paginate to present.
- **Advance:** `window_start.gte = lastBarTs − 1h`, `sort=window_start.desc`, single page.
- Resolution map: `1m→1min`, `5m→5min`, `15m→15min`, `1h→1hour`, `1d→1session`.

### Recency guard (never consume stale bars)

After fetch and **dropping the forming bar** (`dropForming` = `arr.slice(0, -1)` — closed bars
only), `barsAreFresh(lastBarTs, interval)` checks: if the futures market is open and the newest
closed bar is **> 30 minutes old**, it **aborts and does not write state**:

```
[labs] [1m] STALE BARS: last=2025-12-29T07:30:00.000Z (164min old) — aborting, state NOT written
```

`isFuturesMarketOpen()` (ET): Saturday closed; Sunday opens 18:00; Friday closes 17:00; Mon–Thu
open except the 17:00–18:00 maintenance break. (When closed, old last-bars are legitimate, so
the guard is skipped.)

### Yahoo fallback

`fetchOHLC('NQ=F', …)` tries Polygon futures first; on throw/null it falls back to
`fetchFromYahoo('NQ=F', …)`. Yahoo is a **secondary** source for NQ only.

### Contract detection & rollover

`detectActiveNQContract()` resolves the active front-month (default `NQM6`). On a **rollover**
the handler clears, for the new contract to converge cleanly:

```sql
DELETE FROM settings WHERE key IN ('labs_pr_avg', 'labs_pr_avg_5m', 'labs_pr_avg_1m');
DELETE FROM settings WHERE key LIKE 'labs_pr_anchor_%';
```

i.e. **both timeframes' state AND all anchors**. The next cold-start computes fresh anchors.

---

## 6. From recurrence to scoring (the full pipeline)

```
recurrence state (full precision)
  → levelsFromState  → raw NQ levels (decimals)
  → APPLY TIME: roundAppliedLevels(rawNQ, ratio)
        nq  = roundLevel(rawNQ)            // Math.round → whole points
        qqq = parseFloat((nq / ratio).toFixed(2))   // QQQ from ROUNDED NQ
  → daily_levels (canonical store: r2_nq..s2_nq, r2_qqq..s2_qqq, nq_ratio)
  → scoring reads daily_levels QQQ (getLevelsForScoring)
  → runScoreWithNq attaches nq_price (canonical NQ) to each scored level by id
  → every tab displays the STORED value via levelNq(level, nqRatio)
```

### Rounding policy (single change point)

```js
const LEVEL_ROUNDING = 'whole'
function roundLevel(x) { return Math.round(x) }   // ← change ONLY this for granularity
function roundAppliedLevels(nqRaw, ratio) { /* round NQ, derive QQQ = nq/ratio toFixed(2) */ }
```

- Whole-point, **apply-time only**; state stays full precision (§3).
- QQQ is always **derived from the rounded NQ** — NQ is the source of truth.
- To change granularity (e.g. quarter-tick `Math.round(x*4)/4`), edit `roundLevel()` only;
  takes effect on the **next apply, no state reset**.

### Auto-apply & the change guard

`applyAutoLevelsIfEnabled()` runs each advance (in `auto_nq` mode, not paused). It builds rounded
`levelData`, then **skips the write+rescore unless something moved meaningfully**:

```js
const nqChanged  = !existing || Math.abs((existing.mid_nq  || 0) - levelData.mid_nq)  > 20    // >20 NQ pts
const qqqChanged = !existing || Math.abs((existing.mid_qqq || 0) - levelData.mid_qqq) > 0.50  // >$0.50 QQQ
if (!(nqChanged || qqqChanged)) return
```

So `daily_levels` (Active) lags the live recurrence (NQ Native) by up to the guard band; the Δ
column (§8) shows that drift. It also **does not overwrite `labsAutoLevels.nq`** — the Labs "NQ
Native" column keeps the raw recurrence decimals for TradingView comparison.

### Atomic manual apply

`POST /labs/apply-to-main` writes `daily_levels` → syncs `labsAutoLevels` (+`labs_levels_update`
SSE) → awaits `scoreNow('labs_apply')` → responds `{ success, appliedAt, scoredAt, levelData }`.

`scoreNow(trigger)` is the canonical full rescore (also used by `/rescore` "Score Now"): runs
the scorer via `runScoreWithNq`, updates `latest`, emits the `rescore` SSE, and regenerates
**narrative, level-narratives, session-brief, assistant-read** in the background. Returns
`{ result, scoredAt }`.

---

## 7. The ratio system

`getActiveRatio()` fallback chain (exact order):

```
sessionRatio || nqOffsets.ratio || latest?.nq_ratio || getNqRatioFromDb(db) || 41.14
```

### Daily lock — date-aware, self-healing

Evaluated **every scheduler tick** within `9:30 ≤ ET < 16:00`:

```js
if (sessionRatioDate !== date) {            // no lock yet for today (ET) — the guard is the DATE
  const liveRatio = getFreshLiveRatio()     // latest.nq_ratio, only if _received_at ≤ 30 min old
  if (liveRatio) {
    const mode = currentMinute <= 9*60+35 ? 'scheduled' : 'catch-up'
    // set sessionRatio/LockedAt/Date, persist session_ratio row, then:
    onRatioLocked(mode)
  } else { /* [ratio] lock deferred: prices unavailable — will retry on later ticks */ }
}
```

- **Guard is the persisted ET `date`**, never an in-memory "done" flag → a missed 9:30 tick,
  a restart after 9:30, or a price hiccup self-heals on a later tick (`catch-up`).
- **Freshness gate:** `getFreshLiveRatio()` returns `latest.nq_ratio` only if `latest._received_at`
  is within **30 minutes**; otherwise the lock defers (logs once/day) and retries.
- ET dates throughout (no UTC flip at 8pm ET).

### `onRatioLocked(trigger)` — one sequence, three callers

Called identically by **scheduled, catch-up, and manual** locks (so they can't drift apart).
After the caller has set + persisted `sessionRatio`/`LockedAt`/`Date`:

```
1) rewriteQqqFromRatio(sessionRatio)   // rewrite ONLY daily_levels QQQ from stored NQ ÷ ratio
2) emit 'ratio_locked' + 'labs_levels_update' SSE
3) scoreNow(`ratio_lock:${trigger}`)   // rescore so scored levels + narratives reflect new QQQ
```

`rewriteQqqFromRatio(ratio)` reads the stored canonical NQ (`r2_nq..s2_nq`) and writes
`qqq = parseFloat((nq / ratio).toFixed(2))` back into the QQQ columns + `nq_ratio`. It is a
**pure derivation rewrite — independent of level source mode, `systemPaused`, and market
hours** (so an after-hours manual lock refreshes QQQ immediately). **NQ is never touched.**

```
[ratio] LOCKED 41.117 at 09:30:05 (scheduled)
[ratio] daily_levels QQQ rewritten from NQ ÷ 41.117 (MID_nq=29299 → MID_qqq=712.58)
[ratio] post-lock refresh (scheduled) — qqq rewritten=true
```

### Manual lock semantics

`POST /ratio/lock` sets `sessionRatioDate = today (ET)` so the scheduler catch-up treats it as
today's lock and won't overwrite it, then calls `onRatioLocked('manual')`.

> **Documented clobber in manual mode:** `rewriteQqqFromRatio` unconditionally re-derives QQQ
> from stored NQ. If you are in pure `manual` mode having typed *independent* NQ and QQQ values,
> a ratio lock re-derives QQQ to `NQ ÷ ratio` (overwriting a hand-entered QQQ that didn't follow
> the ratio). That is the correct semantics of "locking a ratio," but be aware of it.

### Where the ratio surfaces

`/status` returns `activeRatio: getActiveRatio()` (the exact ratio used for derivation) plus
`sessionRatio` and `sessionRatioLockedAt`. The Labs panel reads `activeRatio` and also updates
instantly on the `ratio_locked` SSE (§8).

---

## 8. Settings & operations

### What each control does

| Action | Effect |
|---|---|
| **Length / Factor change** (`/labs/settings`) | Recurrence depends on these → **wipes all `labs_pr_avg%` state** and **cold-starts** the active timeframe with new params. Logs `[labs] params changed length=… mult=… → state reset, cold-start`. |
| **Interval change** (5m ↔ 1m, `/labs/active-interval`) | **No reset.** Loads that timeframe's own persisted state (cold-starts it only if none). The other timeframe is untouched. Selection persists *before* the calc, so it sticks even if the calc aborts on stale bars (`no_fresh_data` → "No fresh data / Retry"). |
| **Recalculate** (`/labs/recalculate`) | **Advance only — never cold-starts.** No new closed bar → no-op. |
| **Reset Avg** (`/labs/reset-avg`) | Deletes the **active timeframe's** state only (anchor preserved → reproducible), then cold-starts it. The other timeframe is untouched. |
| **Apply NQ** (`/labs/apply-to-main`) | Atomic apply + full rescore (§6). Button shows `✓ Applied & scored HH:MM:SS ET`. |

### Expected log lines (examples)

```
[labs] [5m] loaded PR state: avg=18432.1 halfWidth=210.4 rawATR=70.1 lastBar=…
[labs] [5m] avg 18432.1 → 18432.1, ratcheted=false, halfWidth=210.4, mode=advance barsAdvanced=1
[labs] [1m] cold-start anchor=2026-04-12T13:30:00.000Z bars=19042 seed=18290.25 (first=… last=…)
[labs] [1m] STALE BARS: last=… (164min old) — aborting, state NOT written
[labs] [5m] DISCARDING stale state lastBar=… (62.3d old) — cold-starting
[ratio] LOCKED 41.117 at 09:30:05 (scheduled)
```

### The Labs comparison table (`LevelComparison.jsx`), column by column

Six columns: **Level · NQ Native · QQQ Equiv · Active NQ · Active QQQ · Δ**

| Column | Source | Notes |
|---|---|---|
| **Level** | `id` (R2…S2) | colored by type |
| **NQ Native** | `autoLevels[id]` | **raw** recurrence value (full decimals) — the TradingView-parity column |
| **QQQ Equiv** | `nqAuto / ratio` | live **active** ratio (`status.activeRatio`); `$` 2dp |
| **Active NQ** | `currentLevels.nq_price` | canonical rounded NQ from `daily_levels` (what scoring uses) |
| **Active QQQ** | `currentLevels.qqq_price` | **stored** `daily_levels` QQQ — read, **not** recomputed; equals what Intraday/Overview show |
| **Δ** | `nqAuto − activeNq` | dead-zone: shown only if `Math.abs(Δ) > 0.5`, else "—"; green = Labs higher |

**Ratio chip** (LabsPanel header): `ratio {activeRatio.toFixed(3)} 🔒 {lockedAt}` (or `· live`
when unlocked). `nqRatio` comes from `status.activeRatio` (20s poll) and is updated **immediately**
on the `ratio_locked` SSE via the `sessionRatio` prop (`useEffect([sessionRatio])`).

**`refreshLive()`** polls every 20s: `/status` (price, `activeRatio`, contract), `/levels`
(builds `currentLevels` as `[{id, nq_price, qqq_price}]`), `/labs/auto-levels` (Labs NQ + `fresh`
flag), `/labs/scoring-latest` (Trade Setups).

### Canonical-display helper

`src/utils/levelNq.js`:

```js
export function levelNq(level, nqRatio) {
  if (level?.nq_price != null) return level.nq_price                       // canonical (whole-point)
  if (level?.price != null && nqRatio) return Math.round(level.price * nqRatio * 4) / 4  // fallback: QQQ→NQ, quarter-tick
  return null
}
```

Imported by every level-displaying component: `LevelCard`, `SmartLevelCard`, intraday
`RightRail` / `FocusMode` / `PriceLadder` / `LevelDetailSheet`, scout `LevelMap` /
`LevelPlanCard`, pre `ScenarioCards` / `ThesisBar` (and `utils/tradeSetup.js` uses the same
canonical-first pattern inline for entry/target). The **canonical** branch is whole-point; the
**fallback** (only when `nq_price` is absent) reconstructs at quarter-tick.

---

## 9. Expected residuals & invariants

### Differences that are CORRECT (do not "fix" these)

| Observation | Why it's correct |
|---|---|
| **Δ rests at ±0.5** | NQ Native is raw, Active NQ is `Math.round`-ed → ≤0.5 difference at rest. |
| **QQQ Equiv vs Active QQQ differ ~$0.01–0.02** | QQQ Equiv = raw NQ ÷ ratio; Active QQQ = **rounded** NQ ÷ ratio. The ≤0.5 NQ rounding ≈ $0.01–0.02 QQQ. Both use the active ratio. |
| **Labs (NQ Native) vs Active drift ≤ ~20pt intraday** | The >20pt / >$0.50 change guard intentionally holds `daily_levels` until a meaningful move. |
| **1m and 5m levels differ** | Different ATR bases → genuinely different indicators (like switching TV timeframes). |

### Invariants that must NEVER break

1. **State is never rounded** — persisted `{avg, halfWidth, atrState}` stays full precision.
2. **State is never recomputed from a window** — always advance the running state one closed bar
   at a time; cold-start only from the fixed anchor.
3. **Stale bars are never consumed** — `barsAreFresh` aborts (>30 min during market hours) and
   does not write state.
4. **NQ is the canonical source of truth** — QQQ is always `rounded NQ ÷ active ratio`; displays
   read the stored value, never reconstruct unless `nq_price` is absent.
5. **Cold-start is deterministic** — fixed per-(contract, timeframe) anchor; resets reproduce.

---

## 10. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Levels **drift intraday** vs TradingView even though structure is unchanged | State not continued — something recomputed from a window instead of advancing | Logs should show `mode=advance barsAdvanced=N`, not repeated `cold-start`. If you see cold-starts every cycle, state isn't persisting/loading. |
| Levels in the **wrong price neighborhood** (e.g. ~25,000 when NQ is ~28,000) | Stale bars fed to the recurrence | `[labs] STALE BARS …` (good — it refused) or a `cold-start … last=<months ago>`; verify Polygon `window_start.*` params are honored and the `last=` bar is within minutes of now. |
| **Reset not reproducible** (different levels each reset) | Anchor not persisted / not reused (sliding anchor) | Two resets must log the **same** `cold-start anchor=…` and `seed=…`. If the anchor changes, check `labs_pr_anchor_{contract}`. |
| **QQQ stale** after a ratio change (NQ correct, QQQ old) | `rewriteQqqFromRatio` didn't run, or ran before the lock persisted | `[ratio] daily_levels QQQ rewritten from NQ ÷ <ratio>` and `post-lock refresh (… ) — qqq rewritten=true` must appear after the lock. |
| Labs **QQQ Equiv** column wrong while other tabs are right | Panel divided by a stale/hardcoded ratio | Header chip should show the active ratio; it reads `status.activeRatio` and updates on `ratio_locked`. (Historical bug: read a nonexistent `status.nq_ratio` → fell back to 41.14.) |
| **Length/Factor change has no effect** | State built under old params wasn't invalidated | `[labs] params changed … → state reset, cold-start` must appear; if absent, the change didn't reach `/labs/settings`. |
| **Ratio didn't lock** today (yesterday's value) | Lock deferred or guard stuck | `[ratio] LOCKED … (scheduled|catch-up)` should appear ≥9:30 ET; `lock deferred: prices unavailable` means `latest` wasn't fresh (≤30 min). Guard is the persisted ET `date`. |

---

## See also

- **README.md** → high-level architecture, endpoints, SQLite schema, Recent Changes.
- **Level Rounding Policy** (README) → the one-line summary of §6.
- `server/index.js` → `initRecurrence`, `advanceRecurrence`, `levelsFromState`,
  `calculateLabsLevels`, `getColdStartAnchor`, `fetchFromPolygonFutures`, `barsAreFresh`,
  `roundAppliedLevels`, `scoreNow`, `getActiveRatio`, `getFreshLiveRatio`, `rewriteQqqFromRatio`,
  `onRatioLocked`.
- `src/components/labs/LevelComparison.jsx`, `src/components/settings/LabsPanel.jsx`,
  `src/utils/levelNq.js`.
- **`server/scorer/scoreLevel.js` and `server/scorer/fetchData.js` are frozen** — never modify.
