# UW Dashboard

Real-time intraday trading dashboard for QQQ/NQ futures. Scores price levels against live Unusual Whales options-flow data and surfaces trade setups with directional bias, confidence, and narrative context.

**Last updated:** 2026-06-10  
**Backend:** Railway (auto-deploy from `main`)  
**Frontend:** Vercel (auto-deploy from `main`)  
**Latest commit:** `3596725`

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

## Labs — Predictive Ranges

ATR-based support/resistance for NQ futures. Primary auto-level source in `auto_nq` mode.

### Data sources
- **Primary:** Polygon.io futures — `/futures/v1/aggs/{ticker}?resolution=5min`
- **Fallback:** Yahoo Finance `NQ=F`
- **Active contract:** auto-detected via `detectActiveNQContract()`, default `NQM6`

### Key functions

```js
calcATR(highs, lows, closes, length)
// Wilder-smoothed ATR

predictiveRanges(closes, highs, lows, length, mult, startAvg)
// Returns: { R2, R1, MID, S1, S2,
//            atr (= bandWidth, kept for back-compat),
//            rawAtr (unscaled),
//            bandWidth (rawAtr × mult),
//            holdAtr, avg }

filterOutlierBars(bars)
// Replaces overnight gap spikes with flat bar at prev close
// Threshold: 3× median TR (~195 pts for NQ 5m)
// Preserves series length; close price kept for ratcheting avg

calculateLabsLevels(interval)
// Full calc — daily or weekly avg mode
// LEVEL_BARS = 250, INIT_BARS = 1000

saveNQLevels(nqResult, interval)
// Persists to labsAutoLevels + SQLite 'labs_auto_levels' key

applyAutoLevelsIfEnabled()
// Writes to daily_levels + SSE emit + triggers rescore
```

### Avg modes
- **Daily** — ratcheting avg persisted in `labs_pr_avg` SQLite key; stable across restarts
- **Weekly** — anchors MID to last week's close (Yahoo `1wk`); uses 5m ATR for band spacing

### Scheduler (pure `setInterval`, no external packages)
```
Every 60s, checks ET time:
  6:00 AM  weekdays → detectActiveNQContract()
  9:30 AM  weekdays → lock sessionRatio from live nq_ratio
  9:00–16:00        → calculateLabsLevels() at 1m/5m/15m per activeInterval
  4:35 PM  weekdays → EOD recalculate
```

### Contract detection
- `fetchContractDetails(ticker)` — tries `/futures/v1/contracts/{ticker}` then `/futures/v1/contracts?ticker={ticker}`; days calculated manually from `last_trade_date`
- `detectActiveNQContract()` — calls `fetchContractDetails` first for expiry; product_code list query filtered to 0–120 days for rollover detection only

---

## SQLite Schema

### `daily_levels` table
`date`, `R2_qqq`, `R1_qqq`, `MID_qqq`, `S1_qqq`, `S2_qqq`, `R2_nq`, `R1_nq`, `MID_nq`, `S1_nq`, `S2_nq`, `nq_ratio`, `source`, `updated_at`

### `settings` key-value store
| Key | Value |
|---|---|
| `labs_auto_levels` | `{ nq: {...}, lastCalculated, interval, settings }` |
| `labs_pr_avg` | `{ avg, savedAt }` — daily ratcheting avg |
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
| POST | `/labs/settings` | Update length / mult / avgMode |
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
- `sessionRatio` 9:30 AM lock flow — stable, never modify

---

## Recent Changes

| Commit | What changed |
|---|---|
| `dc3368b` | Add Manual NQ mode (3rd mode card); fix ratio preview (`data.qqq` → `data.nq`) |
| `7ded55f` | `predictiveRanges` returns `rawAtr`; contract detection split into expiry + rollover |
| `dd5397e` | ATR log fixed (was printing band width as ATR); contract days calculated manually |
| `305bccc` | ATR threshold 4× → 3× median; remove invalid Polygon sort param |
| `47a3602` | Contract detection logging + `fetchContractDetails` with URL fallback |
| `220316d` | `filterOutlierBars` changed to replace-with-flat-bar; threshold 8× → 4× |
| `da0215c` | Replace `node-cron` with `setInterval` — Railway caching issues |
| `1dd0026` | Simplify Labs to NQ-only; remove all QQQ calculation |

---

## Known Issues

- **Polygon contract list** — `/futures/v1/contracts?product_code=NQ` returns stale 2018 contracts despite `active=true`; workaround is direct ticker fetch for expiry, product_code query only for rollover
- **ATR** — `rawAtr` should be 40–100 pts for NQ 5m; if `[labs] raw ATR too large` appears in Railway logs, check `filterOutlierBars` threshold

---

## Resuming in a New Chat

1. Backend on Railway, frontend on Vercel — both auto-deploy from `main`
2. Root `package.json` — ESM (`"type": "module"`), Railway runs `node server/index.js` from root
3. Never modify `server/scorer/scoreLevel.js` or `server/scorer/fetchData.js`
4. Always commit and push after changes
5. `atr` in `predictiveRanges` return = `bandWidth` (back-compat); `rawAtr` = unscaled ATR
6. This README is the source of truth for current state
