# UW Dashboard

Real-time intraday trading dashboard for QQQ/NQ futures. Scores price levels against live Unusual Whales options-flow data and surfaces trade setups with directional bias, confidence, and narrative context.

**Last updated:** 2026-06-12  
**Backend:** Railway (auto-deploy from `main`)  
**Frontend:** Vercel (auto-deploy from `main`)  
**Latest code commit:** `2bcfc95` · Predictive Ranges deep reference: [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md)

---

## Quick Start

```bash
npm install
npm run dev
# Frontend: http://localhost:3002
# Backend:  http://localhost:3001
```

---

## Architecture

```
uw-dashboard/
├── server/
│   ├── index.js          ← Express server — all endpoints, scheduler, SSE
│   ├── scorer/
│   │   ├── scoreLevel.js ← Level scoring logic  ⚠️ DO NOT MODIFY
│   │   └── fetchData.js  ← UW data fetcher      ⚠️ DO NOT MODIFY
│   ├── dataProvider/
│   ├── db.js             ← SQLite setup (better-sqlite3)
│   ├── data/sessions.db  ← SQLite database (Railway volume)
│   └── sessionLogger.js
├── src/
│   ├── components/
│   │   ├── settings/
│   │   │   ├── SystemPanel.jsx    ← Level source, ratio lock, Manual NQ mode
│   │   │   ├── LabsPanel.jsx      ← Labs controls + timeframe selector
│   │   │   └── SettingsTab.jsx
│   │   ├── labs/
│   │   │   ├── LevelComparison.jsx  ← NQ Native | QQQ Equiv | Manual | Δ
│   │   │   ├── HeatmapView.jsx
│   │   │   ├── LabsDashboard.jsx
│   │   │   └── TradeSetupCard.jsx
│   │   └── ...
│   └── hooks/useSSE.js   ← SSE subscription
├── package.json           ← Root; Railway runs `node server/index.js` from here
├── render.yaml            ← Railway config
└── vercel.json            ← Vercel SPA rewrite
```

**Stack:** React 19 + Vite + Tailwind CSS v3 (frontend) · Node.js/Express ESM (backend) · SQLite via better-sqlite3

**Deploy config (`render.yaml`):**
```yaml
buildCommand: npm install
startCommand: node server/index.js
```

---

## Environment Variables

**Railway (backend):**

| Variable | Purpose |
|---|---|
| `UW_API_KEY` | Unusual Whales API key |
| `UW_API_BASE` | UW base URL |
| `POLYGON_API_KEY` | Polygon.io — NQ futures OHLC + contract detection |
| `ANTHROPIC_API_KEY` | Claude API for narrative generation |
| `DASHBOARD_PIN` | PIN to unlock Settings tab |
| `ACTION_SECRET` | HMAC secret for TradingView webhook level pushes |
| `DRAW_RELAY_URL` | URL of local draw-relay server |
| `NARRATIVE_MODE` | `template` (default) or `claude` |
| `POLLING_ENABLED` | `true` / `false` |
| `PORT` | Set by Railway |
| `ALLOWED_ORIGINS` | CORS — set to `*` |

**Vercel (frontend):**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Points to Railway backend URL |

---

## Core Data Flow

1. **UW polling** — server polls Unusual Whales every ~15s for flow, dark pool, GEX, sectors, news
2. **Level scoring** — `scoreLevel.js` scores each level (R2/R1/MID/S1/S2) → `classification`, confidence, signals
3. **SSE stream** — server pushes scored results to frontend via `/stream`
4. **Auto levels** — Labs recalculates NQ Predictive Ranges every 5m during market hours; auto-applies when `levelSourceMode === 'auto_nq'`

---

## Key Server State

```js
let systemPaused          = false
let levelSourceMode       = 'auto_nq'    // 'auto_nq' | 'manual_nq' | 'manual'
let sessionRatio          = null          // locked at 9:30 AM ET daily
let sessionRatioLockedAt  = null
let sessionRatioDate      = null
let autoScoreEnabled      = true
let activeNQContract      = 'NQM6'       // overwritten by detectActiveNQContract()
let activeNQContractExpiry = null
let nqContractDaysToExpiry = null
let labsAutoLevels        = { nq: null, lastCalculated: null }
let labsSettings          = { interval: '5m', activeInterval: '5m', length: 200, mult: 6.0, avgMode: 'daily' }
```

**Ratio resolution order (`getActiveRatio()`):**
```js
sessionRatio || nqOffsets.ratio || latest?.nq_ratio || getNqRatioFromDb(db) || 41.14
```

---

## Level Source Modes

| Mode | Behavior |
|---|---|
| `auto_nq` | Labs recalculates every 5m; auto-applies NQ levels; QQQ derived via ratio |
| `manual_nq` | User enters NQ prices; QQQ auto-calculated; saves + rescores + switches to `manual` |
| `manual` | Levels only change when user explicitly saves (NQ + QQQ both entered) |

---

## Level Rounding Policy

Applied/scored levels are rounded to **whole points** (e.g. 29,679.67 → 29,680) at **apply time only**, via a single definition in `server/index.js`:

```js
const LEVEL_ROUNDING = 'whole'
function roundLevel(x) { return Math.round(x) }   // the ONE change point
function roundAppliedLevels(nqRaw, ratio) { /* round NQ, derive QQQ from rounded NQ */ }
```

Rules:
- **Recurrence state is NEVER rounded.** The persisted `{avg, halfWidth, atrState}` stays full precision — rounding the path-dependent state would compound and diverge from TradingView. Only the *outputs* at apply time are rounded.
- **Rounded NQ is canonical.** Written to `daily_levels`, used for scoring; **QQQ derives from the rounded NQ** (`rounded NQ ÷ ratio`) so NQ and QQQ stay consistent.
- Both apply paths use it: auto-apply (`applyAutoLevelsIfEnabled`) and manual `/labs/apply-to-main`. The >20pt change guard compares rounded-vs-rounded; the ≤0.5 rounding (≤1pt NQ, ≤~0.02 QQQ) is far below the 20pt/0.50 thresholds, so it can't flap the guard.
- **Displays use the stored canonical value, never `QQQ × ratio`.** Server attaches `nq_price` (from `daily_levels`) to each scored level (`runScoreWithNq`); the frontend reads it via `levelNq(level, nqRatio)` (`src/utils/levelNq.js`), falling back to reconstruction only when absent. This eliminates the old one-tick Labs-vs-other-tabs discrepancy.
- **Labs PR table:** *NQ Native* keeps raw recurrence decimals (for TradingView comparison); *Active* shows the rounded applied value; *Δ* = raw vs rounded, so a resting ±0.5 is expected and correct.

To change granularity (e.g. quarter-tick `Math.round(x*4)/4`), change **only `roundLevel()`** — nothing else in the pipeline assumes whole points. Takes effect on the **next apply; no state reset needed.**

---

## Labs — Predictive Ranges

ATR-based support/resistance for NQ futures. Primary auto-level source in `auto_nq` mode.

> **📖 Full reference: [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md)** — the definitive doc for the
> recurrence math, path dependence, persisted state, anchored cold-starts, the Polygon feed,
> the apply→scoring pipeline, the ratio system, expected residuals/invariants, and
> troubleshooting. Read it before modifying anything in the PR system.

### Data sources
- **Primary:** Polygon.io futures — `/futures/v1/aggs/{ticker}` with `window_start.gte/.lte` (ns) + `sort=window_start.{asc|desc}` (see [PREDICTIVE_RANGES.md §5](PREDICTIVE_RANGES.md))
- **Fallback:** Yahoo Finance `NQ=F`
- **Active contract:** auto-detected via `detectActiveNQContract()`, default `NQM6`

### Key functions

Faithful LuxAlgo Predictive Ranges port with **persisted recurrence state** — the
recurrence is advanced one closed bar at a time, never re-run over a sliding window
(which previously caused uniform intraday band drift). Bars are ETH/Globex.

```js
calcATR(highs, lows, closes, length)
// Wilder-smoothed ATR (used by weekly mode only)

trueRange(high, low, prevClose)            // max(h-l, |h-prevC|, |l-prevC|)

initRecurrence(closes, highs, lows, times, length, mult)
// COLD START over a long window (INIT_BARS). RMA-ATR warmup + ratchet convergence.
// Per closed bar: atr = RMA-ATR(length) × mult;
//   close-avg > atr → avg += atr ; avg-close > atr → avg -= atr ; else hold
//   halfWidth = atr/2 updates ONLY on ratchet bars, held otherwise
// Returns state { avg, halfWidth, atrState, lastBarTs, ratchets, barsProcessed }

advanceRecurrence(state, closes, highs, lows, times, length, mult)
// Advances saved state over ONLY bars newer than state.lastBarTs.
// Returns { avg, halfWidth, atrState, lastBarTs, ratchets, ratchetBars, barsAdvanced }
// or { needsReinit:true } if the saved bar predates the window (gap too large).

levelsFromState(state, mult)
// Levels = avg ± halfWidth, avg ± 2*halfWidth (spacing = halfWidth, frozen between ratchets)

calculateLabsLevels(interval)
// Daily mode: load labs_pr_avg_{tf} state → advance over newly closed bars (drop forming bar) → save state.
// Cold-start only on first run / reset / contract rollover / gap-too-large. LEVEL_BARS = 250, INIT_BARS = 1000.

getColdStartAnchor(contract, interval)
// Fixed per-(contract,tf) warmup anchor (labs_pr_anchor_{contract}); 5m = 60d floor, 1m = 14d.
// Reused on every cold-start → reproducible resets.

fetchFromPolygonFutures(bars, interval, opts)
// window_start.gte/.lte (ns) + sort=window_start.{asc(cold-start)|desc(advance)}; next_url paginated (50-page cap).

barsAreFresh(lastBarTs, interval)
// Recency guard: >30 min stale during market hours → abort, state NOT written.

saveNQLevels / applyAutoLevelsIfEnabled  — persist + SSE + rescore (apply-time rounding, >20pt/$0.50 guard)
```

**filterOutlierBars** is no longer in the PR path — TradingView ratchets on overnight
gap bars, so flattening them desynced the recurrence. Function is kept (unused) for
potential non-PR use only.

### Avg modes
- **Daily** — ratcheting recurrence state persisted per timeframe in `labs_pr_avg_{tf}`; advanced one closed bar at a time, never recomputed from a window (see [PREDICTIVE_RANGES.md §2–§3](PREDICTIVE_RANGES.md))
- **Weekly** — anchors MID to last week's close (Yahoo `1wk`); uses 5m ATR for band spacing

### Scheduler (pure `setInterval`, no external packages)
```
Every 60s, checks ET time:
  6:00 AM  weekdays → detectActiveNQContract()
  ≥9:30 ET weekdays → lock sessionRatio from fresh live nq_ratio, once per ET day
                      (date-aware + catch-up; self-heals after a missed tick / restart)
  9:00–16:00        → calculateLabsLevels() at 1m/5m/15m per activeInterval
  4:35 PM  weekdays → EOD recalculate
```

### Contract detection
- `fetchContractDetails(ticker)` — tries `/futures/v1/contracts/{ticker}` then `/futures/v1/contracts?ticker={ticker}`; days calculated manually from `last_trade_date`
- `detectActiveNQContract()` — calls `fetchContractDetails` first for expiry; product_code list query filtered to 0–120 days for rollover detection only

---

## SQLite Schema

### `daily_levels` table
`date`, `r2_nq`/`r2_qqq` … `s2_nq`/`s2_qqq` (lowercase columns; SQLite identifiers are case-insensitive), `nq_ratio`, `source`, `updated_at`. **NQ columns are canonical (whole-point); QQQ = rounded NQ ÷ active ratio.**

### `settings` key-value store
| Key | Value |
|---|---|
| `labs_auto_levels` | `{ nq: {...}, lastCalculated, interval, settings }` |
| `labs_pr_avg_5m` / `labs_pr_avg_1m` | `{ avg, halfWidth, atrState, lastBarTs, savedAt }` — full PR recurrence state, **per timeframe** (legacy `labs_pr_avg` auto-migrates to `_5m`) |
| `labs_pr_anchor_{contract}` | `{ "5m": <ms>, "1m": <ms> }` — fixed per-(contract,tf) cold-start warmup anchor; reused on every reset for reproducible levels. Cleared on rollover. |
| `labs_settings` | `{ interval, activeInterval, length, mult, avgMode }` |
| `nq_contract` | `{ ticker, expiry, daysLeft, detectedAt }` |
| `session_ratio` | `{ ratio, lockedAt, date }` |
| `level_source_mode` | string |

---

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/stream` | SSE — live scored data |
| GET | `/status` | System state snapshot |
| GET | `/levels` | Current daily levels |
| POST | `/levels` | Save manual levels (NQ + QQQ) |
| POST | `/levels/manual-nq` | Save levels from NQ-only input |
| POST | `/levels/source-mode` | Set `auto_nq` / `manual_nq` / `manual` |
| POST | `/rescore` | Force immediate rescore |
| GET | `/labs/auto-levels` | Current Labs NQ levels |
| POST | `/labs/recalculate` | Trigger Labs recalculation |
| POST | `/labs/settings` | Update length / mult / avgMode (preview interval) |
| POST | `/labs/active-interval` | Set active PR timeframe (`5m` / `1m`) — loads that tf's state |
| POST | `/labs/reset-avg` | Clear ratcheting avg |
| POST | `/ratio/lock` | Manually lock a ratio value |
| POST | `/webhook/accept` | Accept pending TradingView level push |
| POST | `/system/pause` | Pause UW polling + auto-rescore |
| POST | `/system/resume` | Resume |

---

## Hard Constraints

- `server/scorer/scoreLevel.js` — scoring logic is frozen, never modify
- `server/scorer/fetchData.js` — UW data fetching is frozen, never modify
- `getActiveRatio()` fallback chain — stable, never modify
- `sessionRatio` daily lock: guard is the persisted ET `date` (one lock per ET day, with catch-up) — keep it date-aware; do NOT revert to an in-memory once-at-9:30 flag

---

## Recent Changes

| Commit | What changed |
|---|---|
| _next_ | **Docs:** added [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md) (definitive PR reference); refreshed README Labs/Known-Issues sections and cross-linked. |
| `2bcfc95` | **Labs PR table → six columns** — `Level · NQ Native · QQQ Equiv · Active NQ · Active QQQ · Δ`. New **Active QQQ** reads the STORED canonical `daily_levels` QQQ (`/levels` poll now carries `qqq_price`), not recomputed — doubles as a cross-tab consistency check vs Intraday/Overview. "Active" renamed "Active NQ"; Δ unchanged (rightmost). Expected QQQ Equiv vs Active QQQ residual ~$0.01–0.02 (raw vs rounded NQ basis). |
| `03affee` | **Labs QQQ Equiv column ratio fix** — column divided by a hardcoded `41.14` (LabsPanel read `status.nq_ratio`, which `/status` never returned). Now `/status` exposes `activeRatio` (= `getActiveRatio()`); LabsPanel uses it and recomputes immediately on the `ratio_locked` SSE (via the `sessionRatio` prop), not just the 20s poll. In-use ratio shown in the header (`ratio 41.117 🔒 09:30`). Display-only; residual vs Active QQQ (~$0.01–0.02 from rounded-NQ derivation) is expected and unchanged. |
| `77b4cba` | **Shared post-lock refresh `onRatioLocked(trigger)`** — manual `/ratio/lock` previously didn't recompute stored QQQ, so tabs showed old-ratio QQQ while NQ was correct. Now scheduled, catch-up, AND manual locks all call one function: `rewriteQqqFromRatio()` rewrites ONLY the `daily_levels` QQQ columns from canonical NQ ÷ ratio (NQ untouched; mode/pause/market-hours agnostic) → emit `ratio_locked`/`labs_levels_update` SSE → `scoreNow()` rescore so scored levels + narratives reflect new QQQ. Works after-hours. |
| `c19cc53` | **Daily ratio lock made date-aware with catch-up** — was an exact-9:30 in-memory boolean that a restart-after-9:30, missed tick, or price hiccup (flag set before the price check) burned for the day. Now evaluated every tick during the session: locks once per ET day when `session_ratio.date !== today (ET)` and a FRESH (`≤30min`) live ratio exists; defers + retries on stale prices (`[ratio] lock deferred`); logs `LOCKED {ratio} at {time} (scheduled|catch-up)`. Manual `/ratio/lock` counts as today's lock. |
| `3a90632` | **Whole-point level rounding at apply time** — single `roundLevel()`/`LEVEL_ROUNDING` policy; recurrence state stays full precision; QQQ derives from rounded NQ. Every tab now displays the stored canonical NQ (`runScoreWithNq` attaches `nq_price`; frontend `levelNq()` helper) instead of `QQQ × ratio`, killing the one-tick discrepancy. Labs Native keeps raw decimals, Active rounded, Δ = raw vs rounded. See **Level Rounding Policy**. |
| `5111048` | **Atomic Apply NQ** — `/labs/apply-to-main` now writes `daily_levels` → syncs `labsAutoLevels` (+SSE) → runs the **same** full rescore as Score Now (via shared `scoreNow()`, incl. narratives) → responds `{appliedAt, scoredAt}`. Button shows "✓ Applied & scored HH:MM:SS"; no separate Score Now needed. `/rescore` refactored onto `scoreNow()`. Labs comparison **Active + Δ restored to live** (reads `/levels` daily_levels, 20s poll) — was reading a nonexistent `/status.levels`. Score Now tooltip documents its standalone-rescore role. |
| `8883910` | **Deterministic anchored cold-start** — warmup window anchored at a FIXED per-(contract,tf) point (`labs_pr_anchor_{contract}`, persisted, reused on every reset) instead of sliding `now−8d`, which reseeded the path each run. 5m floor 60d, 1m ~10 trading days; spans anchor→now with `next_url` pagination if it exceeds one page. Reset/cold-start reproduce byte-identical levels. Logs `[labs] [tf] cold-start anchor={ts} bars={n} seed={firstClose}`. Rollover clears anchors. |
| `954ae4e` | **Futures fetch uses correct params** (`window_start.gte/.lte` + `sort=window_start.desc`) — `from`/`to`/`sort` were stocks-v2 params the futures endpoint ignored, returning oldest-from-inception (1m stuck ~25k). **Load-side stale-state discard** (>5d anchor → cold-start, not advance). **Toggle/calc desync fixed** — `activeInterval` is the single source of truth; selection persists before calc and sticks on abort; abort surfaces `no_fresh_data` and the UI shows "No fresh data / Retry" instead of stale levels. |
| `9811564` | **Length/Factor changes now take effect** — `/labs/settings` detects a length/mult change, wipes all `labs_pr_avg%` state, and cold-starts the active timeframe with new params (`[labs] params changed … → state reset, cold-start`). Interval-only change resets nothing. Also added the **recency guard** (`[labs] STALE BARS` → state NOT written) and cold-start first/last-bar logging. (The interim `sort=desc` fetch from this commit was superseded by `window_start.*` params in `954ae4e`.) |
| `6aa3599` | Advance fetches request `from = lastBarTs − 1h` (cold-start keeps 10-day window) to cap Polygon transfer; log `[labs] fetch mode={advance\|cold-start} bars={n}`. |
| `7af233c` | Predictive Ranges timeframe toggle (5m default / 1m). Recurrence state persisted per timeframe (`labs_pr_avg_5m` / `labs_pr_avg_1m`, legacy key migrated to `_5m`); the two never mix. Scheduler advances the active timeframe on its own bar close (every minute for 1m). `/labs/active-interval` is the authoritative toggle (loads/cold-starts target tf, restores prior tf untouched); `/labs/reset-avg` resets only the active tf; contract rollover clears both. Logs tagged `[labs] [5m]`/`[1m]`. |
| `fddf6da` | `/labs/recalculate` made identical to the scheduled 5m cycle — advances persisted state over newly-closed bars only, never cold-starts (no new bar → no-op). Cold-start gated to no-state / reset / rollover / gap-too-large, each logged `recalc mode=cold-start reason=…`; advance logs `recalc mode=advance barsAdvanced=N`. |
| `e18b1a9` | Faithful LuxAlgo PR port: persisted recurrence state `{avg, halfWidth, atrState, lastBarTs}`, advance over closed bars only (no sliding-window re-run), drop forming bar, ETH bars, removed `filterOutlierBars` from PR path. Fixes intraday band drift. |
| `b4d08a2` | Startup rescore + `runAutoRescore` helper + Score Now button (Auto NQ) |
| `dc3368b` | Add Manual NQ mode (3rd mode card); fix ratio preview (`data.qqq` → `data.nq`) |
| `7ded55f` | `predictiveRanges` returns `rawAtr`; contract detection split into expiry + rollover |
| `dd5397e` | ATR log fixed (was printing band width as ATR); contract days calculated manually |
| `305bccc` | ATR threshold 4× → 3× median; remove invalid Polygon sort param |
| `47a3602` | Contract detection logging + `fetchContractDetails` with URL fallback |
| `220316d` | `filterOutlierBars` changed to replace-with-flat-bar; threshold 8× → 4× |
| `da0215c` | Replace `node-cron` with `setInterval` — Railway caching issues |
| `1dd0026` | Simplify Labs to NQ-only; remove all QQQ calculation |

---

## Resolved (kept for context)

- **Polygon futures date-range / stale-bar bug — SOLVED** (`954ae4e`). Root cause: `/futures/v1/aggs/` is a different API family from stocks-v2 and **silently ignores** the stocks-style `from`/`to`/`sort=desc` params, so ascending+limit returned oldest-from-inception bars (1m levels stuck ~25k). Fixed by using the honored **`window_start.gte`/`window_start.lte`** (ns) + **`sort=window_start.{asc|desc}`** (dotted) params, plus the `barsAreFresh` recency guard and load-side stale-state discard. See [PREDICTIVE_RANGES.md §5](PREDICTIVE_RANGES.md).
- **Labs-vs-scoring "discrepancy" — by design, now visible.** The gap between Labs (raw recurrence) and active scoring levels is the **>20pt / >$0.50 change guard** holding `daily_levels` until a meaningful move; the **Δ column** and the **Active NQ/QQQ columns** surface it directly. Resting Δ ±0.5 and QQQ-Equiv-vs-Active-QQQ ~$0.01–0.02 are expected ([PREDICTIVE_RANGES.md §9](PREDICTIVE_RANGES.md)).

## Known Issues

- **Polygon contract list** — `/futures/v1/contracts?product_code=NQ` returns stale 2018 contracts despite `active=true`; workaround is direct ticker fetch for expiry, product_code query only for rollover.
- **`filterOutlierBars`** — removed from the PR recurrence path (TradingView ratchets on overnight gap bars, so flattening them desynced the recurrence). The function is kept but unused; the `[labs] raw ATR too large` warning is legacy.

---

## Resuming in a New Chat

1. Backend on Railway, frontend on Vercel — both auto-deploy from `main`
2. Root `package.json` — ESM (`"type": "module"`), Railway runs `node server/index.js` from root
3. Never modify `server/scorer/scoreLevel.js` or `server/scorer/fetchData.js`
4. Always commit and push after changes
5. **For anything in the Predictive Ranges system** (recurrence, state, cold-start, feed, apply,
   ratio lock, Labs table), read **[PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md)** first — it is the
   definitive reference and documents the invariants you must not break.
6. This README is the high-level source of truth; PREDICTIVE_RANGES.md is the deep PR reference.
