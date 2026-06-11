# TradesAlgo Dashboard — Project Status

**Last updated:** 2026-06-10  
**Active branch:** `main`  
**Latest commit:** `dc3368b`  
**Deployed:** Railway (backend) + Vercel (frontend)

---

## What the App Does

A real-time intraday trading dashboard for QQQ/NQ futures. It pulls live options-flow and market data from Unusual Whales, scores price levels against that data, and surfaces trade setups with directional bias, confidence, and narrative context.

### Core loop
1. **Data ingestion** — Node.js server polls Unusual Whales API every ~15s for options flow, dark pool prints, GEX, sector ETFs, news, Greek flow
2. **Level scoring** — `server/scorer/scoreLevel.js` scores each level (R2/R1/MID/S1/S2) against the live UW data; produces `classification` (e.g. `r1_resistance`, `support_hold`, `no_edge`), confidence, and signals
3. **SSE stream** — server pushes scored results to frontend via `/stream` (Server-Sent Events); `useSSE.js` subscribes
4. **Frontend** — React/Vite/Tailwind dashboard renders scored levels, trade setups, narratives, and labs data

### Tabs / views
- **Overview** — session narrative, scored levels with signal badges, cascade alerts
- **Levels** — full level table with NQ+QQQ prices, classification, signals, delta-pressure
- **Intraday** — live trade setup cards, signal strength, GEX, dark pool bars
- **Labs** — Predictive Ranges (NQ-native ATR-based levels), heatmap, level comparison, trade setups
- **Settings → System** — level source mode, ratio lock, Manual NQ entry, system pause
- **Settings → Labs** — timeframe/length/factor/avg-mode controls, recalculate, reset avg
- **Controls** — force score, narrative mode toggle, symbol, etc.

---

## Architecture

```
uw-dashboard/
├── server/
│   ├── index.js          ← Express server, all endpoints, cron, SSE
│   ├── scorer/
│   │   ├── scoreLevel.js ← Level scoring logic (DO NOT MODIFY)
│   │   └── fetchData.js  ← UW data fetcher (DO NOT MODIFY)
│   ├── dataProvider/     ← Data provider helpers
│   ├── db.js             ← SQLite setup (better-sqlite3)
│   ├── data/sessions.db  ← SQLite database
│   └── sessionLogger.js
├── src/
│   ├── components/
│   │   ├── settings/
│   │   │   ├── SystemPanel.jsx   ← Level source, ratio lock, Manual NQ
│   │   │   ├── LabsPanel.jsx     ← Labs controls + timeframe
│   │   │   └── SettingsTab.jsx
│   │   ├── labs/
│   │   │   ├── LevelComparison.jsx  ← NQ Native | QQQ Equiv | Manual | Δ
│   │   │   ├── HeatmapView.jsx
│   │   │   ├── LabsDashboard.jsx
│   │   │   └── TradeSetupCard.jsx
│   │   ├── LevelCard.jsx, SmartLevelCard.jsx, etc.
│   │   └── ...
│   ├── hooks/useSSE.js
│   └── ...
├── package.json          ← Root; Railway runs `node server/index.js` from here
├── render.yaml           ← Railway config (buildCommand: npm install, start: node server/index.js)
└── vercel.json           ← Vercel SPA rewrite
```

### Deploy
- **Backend (Railway):** `npm install && node server/index.js` — auto-deploys on push to `main`
- **Frontend (Vercel):** `vite build` → static SPA — auto-deploys on push to `main`
- **Database:** SQLite file at `server/data/sessions.db` — persists on Railway volume

### Environment variables (Railway)
| Variable | Purpose |
|---|---|
| `UW_API_KEY` | Unusual Whales API key |
| `UW_API_BASE` | UW base URL |
| `POLYGON_API_KEY` | Polygon.io — NQ futures OHLC + contract detection |
| `ANTHROPIC_API_KEY` | Claude API for narrative generation |
| `DASHBOARD_PIN` | PIN for Settings unlock |
| `ACTION_SECRET` | Webhook secret for TradingView level pushes |
| `DRAW_RELAY_URL` | TradingView draw relay URL |
| `NARRATIVE_MODE` | `template` (default) or `claude` |
| `POLLING_ENABLED` | `true`/`false` |
| `PORT` | Set by Railway |
| `ALLOWED_ORIGINS` | CORS — set to `*` |

---

## Key Server State (in-memory, `server/index.js`)

```js
let systemPaused          = false
let levelSourceMode       = 'auto_nq'    // 'auto_nq' | 'manual_nq' | 'manual'
let sessionRatio          = null          // locked at 9:30 AM ET
let sessionRatioLockedAt  = null
let sessionRatioDate      = null
let autoScoreEnabled      = true
let activeNQContract      = 'NQM6'       // overwritten by detectActiveNQContract()
let activeNQContractExpiry = null
let nqContractDaysToExpiry = null
let labsAutoLevels        = { nq: null, lastCalculated: null }
let labsSettings          = { interval: '5m', activeInterval: '5m', length: 200, mult: 6.0, avgMode: 'daily' }
```

### Ratio resolution order (`getActiveRatio()`)
```js
sessionRatio || nqOffsets.ratio || latest?.nq_ratio || getNqRatioFromDb(db) || 41.14
```

---

## Labs — Predictive Ranges

### What it does
Computes ATR-based support/resistance levels for NQ futures. Used as the primary auto-level source when `levelSourceMode === 'auto_nq'`.

### Data source
- **Primary:** Polygon.io futures API — `/futures/v1/aggs/{ticker}?resolution=5min&...`
- **Fallback:** Yahoo Finance `NQ=F`
- **Active contract:** auto-detected via `detectActiveNQContract()`, default `NQM6`

### Key functions (`server/index.js`)

```js
// ATR calculation — Wilder smoothing
function calcATR(highs, lows, closes, length)

// Band = rawATR × mult; ratcheting avg for MID
function predictiveRanges(closes, highs, lows, length, mult, startAvg)
// Returns: { R2, R1, MID, S1, S2, atr (=bandWidth), rawAtr, bandWidth, holdAtr, avg }

// Gap bar smoothing — replaces overnight gap spikes with flat bar at prev close
// Threshold: 3× median TR (~195 pts for NQ 5m)
function filterOutlierBars(bars)

// Fetch NQ OHLC from Polygon futures, apply filterOutlierBars
async function fetchFromPolygonFutures(bars, interval)

// Main calc — daily or weekly avg mode
async function calculateLabsLevels(interval)

// Persist result to labsAutoLevels + SQLite
function saveNQLevels(nqResult, interval)

// Apply NQ auto-levels to daily_levels table + SSE emit + rescore
async function applyAutoLevelsIfEnabled()
```

### Constants
- `LEVEL_BARS = 250` — bars used for level calc
- `INIT_BARS = 1000` — bars used for avg initialization (first run only)

### Avg modes
- **Daily** — persistent ratcheting avg stored in `labs_pr_avg` SQLite key; carries forward across restarts; reset via `/labs/reset-avg`
- **Weekly** — anchors MID to last week's close avg (Yahoo `1wk` bars), uses 5m ATR for band spacing

### Scheduler (no external packages — pure `setInterval`)
```
Every 60s checks ET time:
  6:00 AM  → detectActiveNQContract()
  9:30 AM  → lock sessionRatio
  9:00–16:00 → calculateLabsLevels() at 1m/5m/15m based on activeInterval
  4:35 PM  → EOD recalculate
```

### Contract detection
1. `fetchContractDetails(ticker)` — direct fetch `/futures/v1/contracts/{ticker}` then `/futures/v1/contracts?ticker={ticker}`; calculates days manually from `last_trade_date`
2. `detectActiveNQContract()` — calls `fetchContractDetails` first for expiry; then product_code query filtered to 0-120 days out for rollover detection only

---

## Level Source Modes

| Mode | Behavior |
|---|---|
| `auto_nq` | Labs recalculates every 5m; auto-applies NQ levels; QQQ derived via ratio |
| `manual_nq` | User enters NQ prices; QQQ auto-calculated via ratio; saves + rescores + switches to `manual` |
| `manual` | Levels only change when user explicitly saves (NQ + QQQ both entered) |

**Level source mode comment in code:** line ~98: `// Level source mode: 'auto_nq' | 'manual_nq' | 'manual'`

### Ratio lock
- Locked daily at 9:30 AM ET from live `latest.nq_ratio`
- Persisted to SQLite `settings` key `session_ratio`
- Override available in Auto NQ panel (ratio preview table shows level impact before accepting)
- Manual NQ panel also has ratio override input

---

## SQLite Schema (key tables/keys)

### `daily_levels` table
Columns: `date`, `R2_qqq`, `R1_qqq`, `MID_qqq`, `S1_qqq`, `S2_qqq`, `R2_nq`, `R1_nq`, `MID_nq`, `S1_nq`, `S2_nq`, `nq_ratio`, `source`, `updated_at`

### `settings` table (key-value store)
| Key | Value |
|---|---|
| `labs_auto_levels` | `{ nq: {...}, lastCalculated, interval, settings }` |
| `labs_pr_avg` | `{ avg, savedAt }` — ratcheting avg for daily mode |
| `labs_settings` | `{ interval, activeInterval, length, mult, avgMode }` |
| `nq_contract` | `{ ticker, expiry, daysLeft, detectedAt }` |
| `session_ratio` | `{ ratio, lockedAt, date }` |
| `level_source_mode` | string |

---

## Important Constraints (do not violate)

1. **Do not change scoring logic** — `server/scorer/scoreLevel.js` is off-limits
2. **Do not change UW data fetching** — `server/scorer/fetchData.js` is off-limits
3. **Do not change ratio lock logic** — the 9:30 AM lock, `getActiveRatio()`, and DB persistence are stable
4. **`atr` field in predictiveRanges return** — kept as `bandWidth` value for back-compatibility with frontend consumers; `rawAtr` is the new unscaled field

---

## Recent Work (this session — commits `1dd0026` → `dc3368b`)

### `1dd0026` — Simplify Labs to NQ-only
- Removed all QQQ Labs calculation (`deriveNQfromQQQ`, `buildLevelsResult`, `saveLevels`, `labsDataSources`)
- Removed `auto_qqq` and `auto` level source modes
- Rewrote `LevelComparison.jsx` — columns: Level | NQ Native | QQQ Equiv | Manual | Δ
- `LabsPanel.jsx` — removed source toggles, static `Source: Polygon (NQM6) · Yahoo fallback`
- `SystemPanel.jsx` — 2-column mode grid: Auto NQ | Manual
- `applyAutoLevelsIfEnabled()` — simplified to NQ-only, derives QQQ via ratio

### `ef4f34d` — Fix NQ ATR inflation + double-recalc
- Added `filterOutlierBars()` — 8× median threshold (later lowered)
- Added TR diagnostic logging
- Confirmed `/labs/reset-avg` has no `calculateLabsLevels` call

### `3240cdf` / `51e9e55` — node-cron dependency
- Added then immediately removed `node-cron` — Railway caching issues
- Replaced all `cron.schedule()` with `setInterval`-based minute-tick scheduler

### `220316d` — ATR threshold fix
- Changed `filterOutlierBars` from remove-bars to replace-with-flat-bar approach
- Changed threshold from 8× to 4× median

### `47a3602` — Contract detection logging + direct fetch
- Added URL logging (key redacted) and raw response logging
- Added `fetchContractDetails(ticker)` with two URL format fallbacks
- On startup: if expiry null after restore, call `fetchContractDetails`

### `305bccc` — Three fixes
- Threshold: 4× → 3× median (catches 208pt gap bars, median ~65)
- Removed invalid `sort=days_to_maturity.asc` from Polygon query
- `fetchContractDetails`: try `/contracts/:ticker` then `/contracts?ticker=` form

### `dd5397e` — Cleanup
- ATR log now shows `rawATR` and `spacing` separately (was printing band width as ATR)
- Contract days calculated manually from `last_trade_date` (Polygon API field was wrong)

### `7ded55f` — rawATR fix + contract separation
- `predictiveRanges` now returns `rawAtr` (unscaled) alongside `atr`/`bandWidth`
- `detectActiveNQContract` split: `fetchContractDetails` for expiry, product_code query for rollover only (filtered 0-120 days)
- Warning threshold corrected to `rawAtr > 150`

### `dc3368b` — Manual NQ mode + ratio preview fix
- Fixed `previewLevels` fetch: `data?.qqq` → `data?.nq` (QQQ was removed from Labs)
- Added `manual_nq` mode: 3rd mode card, NQ inputs with live QQQ equivalent, ratio override
- Server: `/levels/manual-nq` endpoint, `manual_nq` accepted as valid source mode
- Mode grid: 2-col → 3-col (Auto NQ | Manual NQ | Manual)

---

## Known Issues / Active Investigation

### Contract detection
- Polygon `/futures/v1/contracts?product_code=NQ` returns stale 2018-era contracts despite `active=true`
- Workaround: `fetchContractDetails` fetches current ticker directly; product_code query only used for rollover with 0-120 day filter
- Logs to check: `[contract] direct fetch: ...` and `[contract] list response: ...`

### ATR
- `rawAtr` should be 40-100 pts for NQ 5m bars under normal conditions
- If `rawATR > 150` log appears, gap bars are still slipping through — check `filterOutlierBars` threshold
- `[labs] smoothed N gap bars (threshold=Xpts)` confirms filtering is working

---

## Frontend Notes

- `src/components/settings/SystemPanel.jsx` — `calcRatioPreview()` uses `previewLevels?.nq` (auto-levels NQ object)
- `src/components/labs/LevelComparison.jsx` — receives `autoLevels` (the `nq` object directly, not the wrapper)
- `src/components/labs/LabsPanel.jsx` — `const levels = autoLevels?.nq`
- All QQQ references in Labs are derived: `nq_price / ratio`
- `VITE_API_URL` env var points frontend to Railway backend URL

---

## How to Continue in a New Chat

Give the assistant this file and say: "Continue from STATUS.md — [describe the specific task]."

Key things to tell the assistant:
1. Backend is on Railway, frontend on Vercel, both auto-deploy from `main` branch
2. Root `package.json` — Railway runs `node server/index.js` from root
3. ESM throughout (`"type": "module"` in package.json)
4. **Never modify** `server/scorer/scoreLevel.js` or `server/scorer/fetchData.js`
5. Always commit and push after changes
6. The `atr` field in predictiveRanges output = `bandWidth` (kept for back-compat); `rawAtr` = unscaled ATR
