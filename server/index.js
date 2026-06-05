import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import SmartDataProvider from './dataProvider/SmartDataProvider.js'
import pollingConfig from './dataProvider/pollingConfig.js'
// Scoring engine — always available (scorer lives in server/scorer/)
let runFullScore = null
try {
  const scorer = await import('./scorer/index.js')
  runFullScore = scorer.runFullScore
  console.log('[server] Scoring engine loaded ✓')
} catch (err) {
  console.warn('[server] Scoring engine failed to load:', err.message.split('\n')[0])
}

// Helper: load today's levels from SQLite for scoring
function getLevelsForScoring(dbInstance) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const row = dbInstance.prepare('SELECT * FROM daily_levels WHERE date = ?').get(today)
  if (!row) return null
  return [
    { level_id: 'R2',  price: row.r2_qqq,  type: 'resistance' },
    { level_id: 'R1',  price: row.r1_qqq,  type: 'resistance' },
    { level_id: 'MID', price: row.mid_qqq, type: 'mid'        },
    { level_id: 'S1',  price: row.s1_qqq,  type: 'support'    },
    { level_id: 'S2',  price: row.s2_qqq,  type: 'support'    },
  ]
}

// Helper: get today's nq_ratio from SQLite
function getNqRatioFromDb(dbInstance) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const row = dbInstance.prepare('SELECT nq_ratio FROM daily_levels WHERE date = ?').get(today)
  return row?.nq_ratio || null
}
import db from './db.js'
import { logger } from './sessionLogger.js'

const app = express()
const PORT = process.env.PORT || 3001
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*'
const SERVER_START = Date.now()

app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// In-memory store
let latest            = null
let previousResult    = null
let chartSynced       = true
let lastWebhookPayload = null
const history         = []
const MAX_HISTORY     = 20

// Expansion GEX tracking
let expansionGexHistory  = []
let allPinningSessions   = 0

// Narrative mode: 'template' | 'claude' | 'off'
let narrativeMode = process.env.NARRATIVE_MODE || 'template'

async function generateNarrativeForMode(result, dpHist) {
  if (narrativeMode === 'off') return []
  if (narrativeMode === 'template') return generateNarrative(result, dpHist)
  // claude mode — forward to relay
  const relayUrl = process.env.DRAW_RELAY_URL
  if (!relayUrl) {
    console.warn('[narrative] No relay URL — falling back to template')
    return generateNarrative(result, dpHist)
  }
  try {
    const { timestamp, signature } = signRelayRequest('narrative')
    const r = await fetch(`${relayUrl}/narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'narrative', pin: process.env.DASHBOARD_PIN,
        timestamp, signature, result,
      }),
      signal: AbortSignal.timeout(50000),
    })
    const data = await r.json()
    if (data.success && data.narrative) {
      return data.narrative.split(/(?<=\.) /).filter(Boolean)
        .map(s => s.trim()).filter(s => s.length > 0)
    }
  } catch (err) {
    console.warn('[narrative] Claude relay failed — falling back to template:', err.message)
  }
  return generateNarrative(result, dpHist)
}

// DP history — last 3 readings per level
const dpHistory = { R2: [], R1: [], MID: [], S1: [], S2: [] }

function generateNarrative(result, dpHist) {
  if (!result?.levels) return null
  const lines  = []
  const price  = result.current_price
  const levels = result.levels || []
  const cascade = result.cascade
  const mid    = levels.find(l => l.id === 'MID')
  const r1     = levels.find(l => l.id === 'R1')
  const s1     = levels.find(l => l.id === 'S1')
  const s2     = levels.find(l => l.id === 'S2')

  // 1. Price location relative to nearest level
  if (price != null && levels.length) {
    const nearest = levels.reduce((best, l) => {
      return Math.abs(price - l.price) < Math.abs(price - best.price) ? l : best
    })
    const dist = (price - nearest.price).toFixed(2)
    lines.push(
      `Price $${price.toFixed(2)} is ` +
      `${Math.abs(parseFloat(dist)) < 0.10
        ? 'at'
        : parseFloat(dist) > 0
        ? '$' + dist + ' above'
        : '$' + Math.abs(parseFloat(dist)).toFixed(2) + ' below'} ` +
      `${nearest.id} $${nearest.price.toFixed(2)}.`
    )
  }

  // 2. Strongest signal
  const sellLevels = levels.filter(l => l.classification === 'sell_resistance')
  const buyLevels  = levels.filter(l => l.classification === 'buy_support')
  const fullStack  = levels.find(l => l.full_stack)
  if (fullStack) {
    lines.push(
      `${fullStack.id} shows FULL STACK ★ — all institutional signals aligned at $${fullStack.price?.toFixed(2)}.`
    )
  } else if (sellLevels.length > 0) {
    const s = sellLevels[0]
    lines.push(
      `Institutional supply confirmed at ${s.id} $${s.price?.toFixed(2)} (score ${s.score}, DP ${s.dark_pool?.toFixed(3)}).`
    )
  } else if (buyLevels.length > 0) {
    const b = buyLevels[0]
    lines.push(
      `Institutional support at ${b.id} $${b.price?.toFixed(2)} (score ${b.score}, DP ${b.dark_pool?.toFixed(3)}).`
    )
  }

  // 3. Cascade status
  if (cascade?.active) {
    lines.push(`⚠ CASCADE ACTIVE — no institutional floor below MID.`)
  } else if (mid && mid.dark_pool != null && mid.dark_pool <= -0.500) {
    const gap = -0.700 - mid.dark_pool
    if (mid.dark_pool > -0.700) {
      lines.push(
        `MID dark pool at ${mid.dark_pool.toFixed(3)} — ${Math.abs(gap).toFixed(3)} from cascade trigger at -0.700.`
      )
    } else {
      lines.push(
        `MID dark pool at ${mid.dark_pool.toFixed(3)} — past cascade threshold, monitoring S1/S2 conditions.`
      )
    }
  }

  // 4. Structure break or clear
  const sb = result.structure_break
  if (sb?.active) {
    const dir = sb.direction === 'upside' ? 'UPSIDE' : 'DOWNSIDE'
    lines.push(`⚠ STRUCTURE BREAK ${dir} — GEX extension scanning for next level.`)
  } else if (lines.length < 3) {
    lines.push(`Structure intact — monitor for development.`)
  }

  return lines.length > 0 ? lines : null
}

function computeSentiment(result) {
  if (!result?.levels) return null

  const signals  = []
  const cascade  = result.cascade
  const levels   = result.levels

  // Signal 1: ETF tide direction (from level etf_direction field)
  const etfDir = levels[0]?.etf_direction
  if (etfDir === 'bullish')      signals.push({ name: 'ETF', bull: true })
  else if (etfDir === 'bearish') signals.push({ name: 'ETF', bull: false })

  // Signal 2: MID dark pool direction
  const mid = levels.find(l => l.id === 'MID')
  if (mid?.dark_pool != null)    signals.push({ name: 'MID dp', bull: mid.dark_pool > 0 })

  // Signal 3: Dominant level classification
  const classified = levels.filter(l => l.classification !== 'no_edge')
  const buyCount   = classified.filter(l => l.classification === 'buy_support').length
  const sellCount  = classified.filter(l => l.classification === 'sell_resistance').length
  if (buyCount > sellCount)      signals.push({ name: 'Levels', bull: true })
  else if (sellCount > buyCount) signals.push({ name: 'Levels', bull: false })

  // Signal 4: FULL STACK presence
  const fssBull = levels.some(l => l.full_stack && l.classification === 'buy_support')
  const fssBear = levels.some(l => l.full_stack && l.classification === 'sell_resistance')
  if (fssBull)      signals.push({ name: 'FULL STACK', bull: true })
  else if (fssBear) signals.push({ name: 'FULL STACK', bull: false })

  const bullCount = signals.filter(s => s.bull).length
  const bearCount = signals.filter(s => !s.bull).length
  const total     = signals.length || 1

  const cascadeActive = cascade?.active || false
  const cascadeArmed  = cascade?.conditions?.[0] || false
  const hasFullStack  = levels.some(l => l.full_stack)

  let state, label, color, description
  if (cascadeActive) {
    state = 'HIGH_RISK'; label = 'HIGH RISK'; color = 'red'
    description = 'Cascade active — no institutional floor below MID'
  } else if (cascadeArmed && bearCount > bullCount) {
    state = 'CAUTION'; label = 'CAUTION'; color = 'amber'
    description = 'Cascade armed + bearish signals — elevated risk'
  } else if (bullCount >= Math.ceil(total * 0.67)) {
    state = 'BULLISH'; label = 'BULLISH'; color = 'green'
    description = `${bullCount}/${total} signals bullish — setups confirmed`
  } else if (bearCount >= Math.ceil(total * 0.67)) {
    state = 'BEARISH'; label = 'BEARISH'; color = 'red'
    description = `${bearCount}/${total} signals bearish — avoid long setups`
  } else {
    state = 'MIXED'; label = 'MIXED'; color = 'amber'
    description = 'Signals conflicting — trade with reduced size'
  }

  return { state, label, color, description, bullCount, bearCount, total, signals, cascadeActive, cascadeArmed, hasFullStack }
}

function updateDpHistory(result) {
  if (!result?.levels) return
  for (const level of result.levels) {
    if (!dpHistory[level.id]) dpHistory[level.id] = []
    dpHistory[level.id].push({ value: level.dark_pool, time: new Date().toISOString() })
    if (dpHistory[level.id].length > 3) dpHistory[level.id].shift()
  }
}

function detectExpansionGex(result) {
  if (!result?.levels) return []
  return result.levels
    .filter(l => (l.net_gex ?? l.gex?.net_gex) < 0)
    .map(l => ({
      level:          l.id,
      net_gex:        l.net_gex ?? l.gex?.net_gex,
      price:          l.price,
      classification: l.classification,
      gex_bias:       l.gex_bias ?? l.gex?.gex_bias ?? 'expansion',
    }))
}

function checkExpansionGex(result) {
  const expansionLevels = detectExpansionGex(result)
  if (expansionLevels.length === 0) {
    allPinningSessions++
    expansionGexHistory = []
  } else {
    const sessionCount = allPinningSessions
    allPinningSessions   = 0
    expansionGexHistory  = expansionLevels
    const message = expansionLevels.map(l =>
      `${l.level} GEX ${l.net_gex.toLocaleString()} — EXPANSION`
    ).join(' · ')
    console.log(`[server] Expansion GEX: ${message} (after ${sessionCount} pinning sessions)`)
    sseEmitter.emit('event', {
      type:                     'expansion_gex',
      levels:                   expansionLevels,
      consecutivePinningSessions: sessionCount,
      message,
      timestamp:                new Date().toISOString(),
    })
  }
}

function detectChanges(prev, next) {
  if (!prev || !next) return []
  const changes = []

  for (const newLevel of next.levels || []) {
    const prevLevel = prev.levels?.find(l => l.id === newLevel.id)
    if (!prevLevel) continue

    if (prevLevel.classification !== newLevel.classification) {
      changes.push({ type: 'classification', level: newLevel.id, from: prevLevel.classification, to: newLevel.classification })
    }
    if (prevLevel.full_stack !== newLevel.full_stack) {
      changes.push({ type: 'full_stack', level: newLevel.id, active: newLevel.full_stack })
    }
  }

  if (prev.cascade?.active !== next.cascade?.active) {
    changes.push({ type: 'cascade', active: next.cascade.active })
  }

  return changes
}

function emitStaleIfChanged(result) {
  const changes = detectChanges(previousResult, result)
  if (changes.length > 0) {
    chartSynced = false
    const message = changes.map(c => {
      if (c.type === 'classification')
        return `${c.level} → ${c.to === 'buy_support' ? 'BUY SUP' : c.to === 'sell_resistance' ? 'SELL RES' : 'NO EDGE'}`
      if (c.type === 'full_stack')
        return `${c.level} FULL STACK ${c.active ? '★ appeared' : 'gone'}`
      if (c.type === 'cascade')
        return `CASCADE ${c.active ? 'ACTIVATED ⚠' : 'resolved'}`
    }).join(' · ')
    console.log(`[server] Chart stale: ${message}`)
    sseEmitter.emit('event', { type: 'chart_stale', changes, message, timestamp: new Date().toISOString() })
  }
  previousResult = result
}

// SSE event bus
const sseEmitter = new EventEmitter()
sseEmitter.setMaxListeners(100)

// ── DataProvider ──────────────────────────────────────────────────────────────
const provider = new SmartDataProvider(
  process.env.UW_API_KEY,
  process.env.UW_API_BASE || 'https://api.unusualwhales.com',
  pollingConfig
)

// On rescore trigger — run full scoring, update store, broadcast SSE
provider.onRescore(async ({ price, reason }) => {
  if (!runFullScore) {
    // Scorer unavailable (Railway hosted) — emit price tick only, never touch latest
    console.log(`[server] Scorer unavailable — emitting price only (${reason} at $${price})`)
    const s = provider.getStatus()
    sseEmitter.emit('event', {
      type:          'price',
      price,
      interval:      s.currentInterval,
      isMarketHours: s.isMarketHours,
      cascade:       latest?.cascade || null,
      timestamp:     new Date().toISOString(),
    })
    return
  }
  const levelsForScoring = getLevelsForScoring(db)
  if (!levelsForScoring) {
    console.log('[server] Auto-rescore skipped — no levels in DB (enter levels in Tab 4)')
    return
  }
  console.log(`[server] Auto-rescore triggered: ${reason} at $${price}`)
  try {
    const result = await runFullScore({ trigger: 'auto', levelsOverride: levelsForScoring })
    result._received_at = new Date().toISOString()
    const _autoRatio = getNqRatioFromDb(db)
    if (_autoRatio) { result.nq_ratio = _autoRatio; console.log('[server] nq_ratio injected:', _autoRatio) }
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    provider.setLevels(result.levels)
    console.log(`[server] Auto-rescore complete — ${result.levels.length} levels scored`)
    emitStaleIfChanged(result)
    checkExpansionGex(result)
    updateDpHistory(result)
    const sentiment = computeSentiment(result)
    result._sentiment = sentiment
    // Emit rescore immediately — no narrative wait
    sseEmitter.emit('event', {
      type:        'rescore',
      result,
      trigger:     reason,
      price,
      expansionGex: detectExpansionGex(result),
      dpHistory:   { ...dpHistory },
      sentiment,
      timestamp:   new Date().toISOString(),
    })
    // Narrative fire-and-forget — pushes separate SSE when ready
    generateNarrativeForMode(result, dpHistory)
      .then(narrative => {
        console.log('[narrative] generated:', narrative?.length, 'lines')
        console.log('[narrative] line 1:', narrative?.[0])
        if (narrative?.length > 0) {
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          console.log('[narrative] SSE emitted (auto-rescore)')
        }
      })
      .catch(err => console.warn('[narrative] async failed:', err.message))
  } catch (err) {
    console.error('[server] Auto-rescore failed:', err.message)
  }
})

// Session open price tracking
let sessionOpenPrice  = null
let sessionDate       = null
let alertFired        = false
let lastEmittedPrice  = null  // throttle: only emit when price moves ≥ $0.05

provider.onPriceUpdate((price) => {
  const s     = provider.getStatus()
  const today = new Date().toISOString().split('T')[0]

  // Reset on new calendar day
  if (sessionDate !== today) {
    sessionDate      = today
    sessionOpenPrice = null
    alertFired       = false
  }

  // Capture first price of market session
  if (!sessionOpenPrice && s.isMarketHours) {
    sessionOpenPrice = price
    console.log(`[server] Session open price captured: $${price}`)
  }

  // $2.50 move alert — fire once per threshold crossing
  if (sessionOpenPrice && !alertFired) {
    const move = Math.abs(price - sessionOpenPrice)
    if (move >= 2.50) {
      alertFired = true
      const signed = (price - sessionOpenPrice).toFixed(2)
      console.log(`[server] Level update alert: move $${signed} from open $${sessionOpenPrice}`)
      sseEmitter.emit('event', {
        type:             'level_update_alert',
        price,
        sessionOpenPrice,
        move:             signed,
        message:          `Price moved $${move.toFixed(2)} from session open $${sessionOpenPrice.toFixed(2)} — consider updating levels`,
        timestamp:        new Date().toISOString(),
      })
    }
  }

  // Throttle: skip if price hasn't moved ≥ $0.05 since last emit
  const priceMoved = !lastEmittedPrice || Math.abs(price - lastEmittedPrice) >= 0.05
  if (!priceMoved) return
  lastEmittedPrice = price

  sseEmitter.emit('event', {
    type:         'price',
    price,
    interval:     s.currentInterval,
    isMarketHours: s.isMarketHours,
    cascade: {
      active:         latest?.cascade?.active        || false,
      mid_dp:         latest?.cascade?.mid_dp        ?? null,
      gap_to_trigger: latest?.cascade?.gap_to_trigger ?? null,
      conditions:     latest?.cascade?.conditions    || [false, false, false],
    },
    timestamp:    new Date().toISOString(),
  })
})

// Start adaptive polling if enabled
if (process.env.POLLING_ENABLED === 'true') {
  if (!process.env.UW_API_KEY) {
    console.warn('[server] POLLING_ENABLED=true but UW_API_KEY not set — polling skipped')
  } else {
    provider.start()
    console.log('[server] DataProvider polling started')
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  // Send current data immediately on connect
  if (latest) {
    res.write(`data: ${JSON.stringify({
      type: 'rescore',
      result: latest,
      trigger: 'initial',
      timestamp: new Date().toISOString(),
    })}\n\n`)
  }

  // Heartbeat every 30s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`)
  }, 30000)

  const onEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  sseEmitter.on('event', onEvent)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseEmitter.off('event', onEvent)
  })
})

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.post("/update", async (req, res) => {
  const result = req.body
  if (!result || typeof result !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  result._received_at = new Date().toISOString()
  const _updateRatio = getNqRatioFromDb(db)
  if (_updateRatio && !result.nq_ratio) { result.nq_ratio = _updateRatio; console.log('[server] nq_ratio injected (update):', _updateRatio) }
  latest = result
  history.unshift(result)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  if (result.levels) provider.setLevels(result.levels)
  if (result.current_price) provider.rest.lastPrice = Number(result.current_price)
  console.log(`[update] session=${result.session} run_type=${result.run_type}`)
  emitStaleIfChanged(result)
  checkExpansionGex(result)
  updateDpHistory(result)
  const _sentiment = computeSentiment(result)
  result._sentiment = _sentiment
  sseEmitter.emit('event', {
    type:        'rescore',
    result,
    trigger:     result.run_type || 'update',
    price:       result.current_price,
    expansionGex: detectExpansionGex(result),
    dpHistory:    { ...dpHistory },
    sentiment:    _sentiment,
    timestamp:    new Date().toISOString(),
  })
  res.json({ ok: true })
  // Narrative fire-and-forget after responding
  generateNarrativeForMode(result, dpHistory)
    .then(narrative => {
      console.log('[narrative] generated:', narrative?.length, 'lines')
      console.log('[narrative] line 1:', narrative?.[0])
      if (narrative?.length > 0) {
        sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
        console.log('[narrative] SSE emitted (/update)')
      }
    })
    .catch(err => console.warn('[narrative] async failed:', err.message))
})

app.get('/latest', (req, res) => {
  if (!latest) return res.status(404).json({ error: 'No data yet' })
  res.json(latest)
})

app.get('/history', (req, res) => {
  res.json(history)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', last_update: latest?._received_at || null, version: '4b' })
})

app.get('/uptime', (req, res) => {
  res.json({
    uptime_seconds: Math.floor((Date.now() - SERVER_START) / 1000),
    started_at:     new Date(SERVER_START).toISOString(),
    has_data:       !!latest,
    levels_loaded:  latest?.levels?.length || 0,
  })
})

app.get('/status', (req, res) => {
  const s = provider.getStatus()
  res.json({
    ...s,
    sessionOpenPrice,
    moveFromOpen: sessionOpenPrice && s.lastPrice
      ? (s.lastPrice - sessionOpenPrice).toFixed(2)
      : null,
    expansionGexActive: expansionGexHistory.length > 0,
    expansionGexLevels: expansionGexHistory,
    allPinningSessions,
    dpHistory: { ...dpHistory },
    narrativeMode,
  })
})

app.post('/mode', (req, res) => {
  const { useWebSocket, pin } = req.body
  if (typeof useWebSocket !== 'boolean') {
    return res.status(400).json({ error: 'useWebSocket must be boolean' })
  }
  const validPin = process.env.DASHBOARD_PIN
  if (validPin) {
    if (!pin) return res.status(401).json({ error: 'PIN required' })
    try {
      if (!crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(validPin))) {
        return res.status(401).json({ error: 'Invalid PIN' })
      }
    } catch { return res.status(401).json({ error: 'Invalid PIN' }) }
  }
  provider.switchMode(useWebSocket)
  res.json({ mode: useWebSocket ? 'WebSocket' : 'REST' })
})

app.post('/narrative-mode', async (req, res) => {
  const { mode } = req.body
  if (!['template', 'claude', 'off'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode — use template|claude|off' })
  }
  narrativeMode = mode
  console.log(`[server] Narrative mode: ${mode}`)
  sseEmitter.emit('event', { type: 'narrative_mode', mode, timestamp: new Date().toISOString() })
  res.json({ success: true, mode })
  // Immediately generate narrative with current data using new mode
  if (latest && mode !== 'off') {
    generateNarrativeForMode(latest, dpHistory)
      .then(narrative => {
        if (narrative?.length > 0) {
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
        }
      })
      .catch(err => console.warn('[narrative] immediate generation failed:', err.message))
  }
})

app.get('/budget', (req, res) => {
  const s = provider.getStatus()
  const pct = s.callsToday / pollingConfig.budget.workingBudget
  res.json({
    callsToday:    s.callsToday,
    workingBudget: pollingConfig.budget.workingBudget,
    reserve:       pollingConfig.budget.reserve,
    percentUsed:   (pct * 100).toFixed(1),
    status:        pct >= 0.80 ? 'red' : pct >= 0.50 ? 'amber' : 'green',
  })
})

// ── Session logger — tap SSE bus ──────────────────────────────────────────────
sseEmitter.on('event', (data) => {
  try {
    if (data.type === 'rescore') logger.logRescore(data)
    if (data.type === 'price')   logger.logPrice(data.price, data.timestamp)
  } catch (err) {
    console.warn('[logger] Error:', err.message)
  }
})

// ── Chart sync endpoint ───────────────────────────────────────────────────────
app.post('/chart-synced', (req, res) => {
  chartSynced = true
  sseEmitter.emit('event', { type: 'chart_synced', timestamp: new Date().toISOString() })
  console.log('[server] Chart marked as synced')
  res.json({ success: true })
})

// ── Daily levels endpoints ────────────────────────────────────────────────────
function getTodayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function getTodayLevels() {
  const row = db.prepare('SELECT * FROM daily_levels WHERE date = ?').get(getTodayET())
  if (!row) return null
  return [
    { id: 'R2',  price: row.r2_qqq,  nq: row.r2_nq  },
    { id: 'R1',  price: row.r1_qqq,  nq: row.r1_nq  },
    { id: 'MID', price: row.mid_qqq, nq: row.mid_nq },
    { id: 'S1',  price: row.s1_qqq,  nq: row.s1_nq  },
    { id: 'S2',  price: row.s2_qqq,  nq: row.s2_nq  },
  ]
}

app.get('/levels', (req, res) => {
  try {
    const today = getTodayET()
    const row = db.prepare('SELECT * FROM daily_levels WHERE date = ?').get(today)
    const fallback = row || db.prepare('SELECT * FROM daily_levels ORDER BY date DESC LIMIT 1').get()
    res.json({ levels: fallback || null, is_today: !!row })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/levels', (req, res) => {
  try {
    const { r2_nq, r2_qqq, r1_nq, r1_qqq, mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq } = req.body
    const pairs = [[r2_nq, r2_qqq],[r1_nq, r1_qqq],[mid_nq, mid_qqq],[s1_nq, s1_qqq],[s2_nq, s2_qqq]]
    const validPair = pairs.find(([nq, qqq]) => nq && qqq)
    const nq_ratio = validPair ? parseFloat(validPair[0]) / parseFloat(validPair[1]) : null
    const today = getTodayET()

    db.prepare(`
      INSERT INTO daily_levels
        (date, r2_nq, r2_qqq, r1_nq, r1_qqq, mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq, nq_ratio, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        r2_nq=excluded.r2_nq, r2_qqq=excluded.r2_qqq,
        r1_nq=excluded.r1_nq, r1_qqq=excluded.r1_qqq,
        mid_nq=excluded.mid_nq, mid_qqq=excluded.mid_qqq,
        s1_nq=excluded.s1_nq, s1_qqq=excluded.s1_qqq,
        s2_nq=excluded.s2_nq, s2_qqq=excluded.s2_qqq,
        nq_ratio=excluded.nq_ratio, updated_at=datetime('now')
    `).run(today, r2_nq, r2_qqq, r1_nq, r1_qqq, mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq, nq_ratio)

    if (latest && nq_ratio) latest.nq_ratio = nq_ratio
    sseEmitter.emit('event', { type: 'levels_updated', date: today, nq_ratio, timestamp: new Date().toISOString() })
    console.log(`[server] Levels saved for ${today} | ratio: ${nq_ratio?.toFixed(3)}`)
    res.json({ success: true, date: today, nq_ratio })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/levels/history', (req, res) => {
  try {
    res.json({ levels: db.prepare('SELECT * FROM daily_levels ORDER BY date DESC LIMIT 5').all() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/levels/json', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM daily_levels WHERE date = ?').get(getTodayET())
    if (!row) return res.status(404).json({ error: 'No levels for today' })
    res.json({
      date: row.date, ratio: row.nq_ratio?.toFixed(3),
      levels: {
        R2:  { nq: row.r2_nq,  qqq: row.r2_qqq  },
        R1:  { nq: row.r1_nq,  qqq: row.r1_qqq  },
        MID: { nq: row.mid_nq, qqq: row.mid_qqq },
        S1:  { nq: row.s1_nq,  qqq: row.s1_qqq  },
        S2:  { nq: row.s2_nq,  qqq: row.s2_qqq  },
      }
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Session story endpoints ───────────────────────────────────────────────────
app.get('/sessions', (req, res) => {
  res.json(logger.getAllSessions())
})

app.get('/story/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const story = logger.getSessionStory(today)
  if (!story) return res.status(404).json({ error: 'No session today yet' })
  res.json(story)
})

app.get('/story/:date', (req, res) => {
  const story = logger.getSessionStory(req.params.date)
  if (!story) return res.status(404).json({ error: 'Session not found' })
  res.json(story)
})

app.post('/outcome', (req, res) => {
  const { date, level_id, outcome, notes } = req.body
  if (!date || !level_id || !outcome) {
    return res.status(400).json({ error: 'date, level_id, outcome required' })
  }
  db.prepare(`
    UPDATE level_outcomes SET outcome = ?, outcome_auto = 0, notes = ?, updated_at = datetime('now')
    WHERE session_date = ? AND level_id = ?
  `).run(outcome, notes || null, date, level_id)
  res.json({ success: true })
})

app.post('/rescore', async (req, res) => {
  if (!runFullScore) {
    return res.status(503).json({
      error: 'Scoring engine not available on hosted server',
      hint: 'Run npm start locally — it will POST fresh data automatically',
    })
  }
  console.log('[server] Manual rescore triggered from dashboard')
  try {
    const result = await runFullScore({ trigger: 'manual', levelsOverride: getLevelsForScoring(db) })
    result._received_at = new Date().toISOString()
    const _manualRatio = getNqRatioFromDb(db)
    if (_manualRatio) { result.nq_ratio = _manualRatio; console.log('[server] nq_ratio injected:', _manualRatio) }
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    provider.setLevels(result.levels)
    checkExpansionGex(result)
    updateDpHistory(result)
    const manualSentiment = computeSentiment(result)
    result._sentiment = manualSentiment
    sseEmitter.emit('event', {
      type:        'rescore',
      result,
      trigger:     'manual — dashboard button',
      price:       result.current_price,
      expansionGex: detectExpansionGex(result),
      dpHistory:   { ...dpHistory },
      sentiment:   manualSentiment,
      timestamp:   new Date().toISOString(),
    })
    // Respond immediately — narrative generates in background
    res.json({ success: true })
    generateNarrativeForMode(result, dpHistory)
      .then(narrative => {
        console.log('[narrative] generated:', narrative?.length, 'lines')
        console.log('[narrative] line 1:', narrative?.[0])
        if (narrative?.length > 0) {
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          console.log('[narrative] SSE emitted (/rescore)')
        }
      })
      .catch(err => console.warn('[narrative] async failed:', err.message))
  } catch (err) {
    console.error('[server] Manual rescore failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Draw relay forwarding ─────────────────────────────────────────────────────
function signRelayRequest(action) {
  const timestamp = Date.now().toString()
  const signature = crypto
    .createHmac('sha256', process.env.ACTION_SECRET || '')
    .update(`${action}:${timestamp}`)
    .digest('hex')
  return { timestamp, signature }
}

async function forwardToRelay(action, pin, res) {
  const relayUrl = process.env.DRAW_RELAY_URL
  if (!relayUrl) return res.status(503).json({ error: 'Draw relay not configured (DRAW_RELAY_URL missing)' })
  const { timestamp, signature } = signRelayRequest(action)
  try {
    const r = await fetch(`${relayUrl}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, pin, timestamp, signature }),
      signal: AbortSignal.timeout(10000),  // relay returns immediately (async)
    })
    res.status(r.status).json(await r.json())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

app.post('/draw-qqq', async (req, res) => {
  await forwardToRelay('draw-qqq', req.body?.pin, res)
})

app.post('/draw', async (req, res) => {
  await forwardToRelay('draw', req.body?.pin, res)
})

// ── UW API proxy endpoints (avoids exposing key to frontend) ─────────────────
const UW_HEADERS = () => ({
  Authorization: `Bearer ${process.env.UW_API_KEY}`,
  'Content-Type': 'application/json',
})

app.get('/api-data/economic-calendar', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/market/economic-calendar`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/earnings-premarket', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/earnings/premarket`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/sector-etfs', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/market/sector-etfs`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/top-net-impact', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/market/top-net-impact`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/news', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/news/headlines`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/greek-flow', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/stock/QQQ/greek-flow`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/gex-expiry', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/stock/QQQ/greek-exposure/expiry`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api-data/flow-expiry', async (req, res) => {
  try {
    const r = await fetch(
      `${process.env.UW_API_BASE || 'https://api.unusualwhales.com'}/api/stock/QQQ/flow-per-expiry`,
      { headers: UW_HEADERS() }
    )
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Parse TradingView pipe-delimited payload:
// "date=2026-06-05 | ratio=41.193 | R2_nq=29512.25 | ..."
function parseTradingViewPayload(raw) {
  const result = {}
  for (const pair of raw.split('|').map(s => s.trim())) {
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    const key = pair.slice(0, eq).trim().toLowerCase()
    const val = pair.slice(eq + 1).trim()
    if (key && val) result[key] = val
  }
  const required = ['r2_nq','r2_qqq','r1_nq','r1_qqq','mid_nq','mid_qqq','s1_nq','s1_qqq','s2_nq','s2_qqq']
  const missing = required.filter(k => !result[k])
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`)
  return {
    date:     result.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    r2_nq:    parseFloat(result.r2_nq),
    r2_qqq:   parseFloat(result.r2_qqq),
    r1_nq:    parseFloat(result.r1_nq),
    r1_qqq:   parseFloat(result.r1_qqq),
    mid_nq:   parseFloat(result.mid_nq),
    mid_qqq:  parseFloat(result.mid_qqq),
    s1_nq:    parseFloat(result.s1_nq),
    s1_qqq:   parseFloat(result.s1_qqq),
    s2_nq:    parseFloat(result.s2_nq),
    s2_qqq:   parseFloat(result.s2_qqq),
    nq_ratio: result.ratio ? parseFloat(result.ratio) : null,
  }
}

// POST /webhook/levels — TradingView webhook receiver
app.post('/webhook/levels', express.text({ type: '*/*' }), (req, res) => {
  const timestamp = new Date().toISOString()
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  console.log('[webhook] Raw payload:', raw)
  try {
    const parsed = parseTradingViewPayload(raw)
    console.log('[webhook] Parsed:', JSON.stringify(parsed))
    db.prepare(`
      INSERT INTO pending_levels (
        date, r2_nq, r2_qqq, r1_nq, r1_qqq,
        mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq,
        nq_ratio, source, status, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'webhook', 'pending', datetime('now'))
    `).run(
      parsed.date,
      parsed.r2_nq,  parsed.r2_qqq,
      parsed.r1_nq,  parsed.r1_qqq,
      parsed.mid_nq, parsed.mid_qqq,
      parsed.s1_nq,  parsed.s1_qqq,
      parsed.s2_nq,  parsed.s2_qqq,
      parsed.nq_ratio
    )
    lastWebhookPayload = { raw, parsed, timestamp, status: 'pending — awaiting confirmation' }
    sseEmitter.emit('event', { type: 'levels_pending', levels: parsed, source: 'tradingview', timestamp })
    console.log('[webhook] Levels saved as pending for', parsed.date)
    res.status(200).json({ received: true, status: 'pending', date: parsed.date, timestamp })
  } catch (err) {
    console.error('[webhook] Parse error:', err.message)
    res.status(400).json({ error: err.message, raw })
  }
})

// GET /webhook/last — inspect last received payload
app.get('/webhook/last', (req, res) => {
  res.json(lastWebhookPayload || { message: 'No webhook received yet' })
})

// GET /webhook/pending — latest pending levels
app.get('/webhook/pending', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT * FROM pending_levels WHERE status = 'pending' ORDER BY received_at DESC LIMIT 1`
    ).get()
    res.json({ pending: row || null })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /webhook/accept — promote pending → daily_levels + rescore
app.post('/webhook/accept', async (req, res) => {
  try {
    const pending = db.prepare(
      `SELECT * FROM pending_levels WHERE status = 'pending' ORDER BY received_at DESC LIMIT 1`
    ).get()
    if (!pending) return res.status(404).json({ error: 'No pending levels' })

    db.prepare(`
      INSERT INTO daily_levels (
        date, r2_nq, r2_qqq, r1_nq, r1_qqq,
        mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq,
        nq_ratio, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        r2_nq=excluded.r2_nq, r2_qqq=excluded.r2_qqq,
        r1_nq=excluded.r1_nq, r1_qqq=excluded.r1_qqq,
        mid_nq=excluded.mid_nq, mid_qqq=excluded.mid_qqq,
        s1_nq=excluded.s1_nq, s1_qqq=excluded.s1_qqq,
        s2_nq=excluded.s2_nq, s2_qqq=excluded.s2_qqq,
        nq_ratio=excluded.nq_ratio, updated_at=datetime('now')
    `).run(
      pending.date,
      pending.r2_nq,  pending.r2_qqq,
      pending.r1_nq,  pending.r1_qqq,
      pending.mid_nq, pending.mid_qqq,
      pending.s1_nq,  pending.s1_qqq,
      pending.s2_nq,  pending.s2_qqq,
      pending.nq_ratio
    )
    db.prepare(`UPDATE pending_levels SET status = 'accepted' WHERE id = ?`).run(pending.id)

    sseEmitter.emit('event', {
      type: 'levels_updated', date: pending.date,
      nq_ratio: pending.nq_ratio, source: 'webhook_accepted',
      timestamp: new Date().toISOString(),
    })

    res.json({ success: true, date: pending.date })

    // Auto-rescore with new levels
    if (runFullScore) {
      try {
        const levelsOverride = getLevelsForScoring(db)
        const result = await runFullScore({ trigger: 'webhook_accept', levelsOverride })
        result._received_at = new Date().toISOString()
        latest = result
        history.unshift(result)
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
        provider.setLevels(result.levels)
        checkExpansionGex(result)
        updateDpHistory(result)
        const sent = computeSentiment(result)
        result._sentiment = sent
        sseEmitter.emit('event', {
          type: 'rescore', result, trigger: 'webhook levels accepted',
          price: result.current_price, expansionGex: detectExpansionGex(result),
          dpHistory: { ...dpHistory }, sentiment: sent,
          timestamp: new Date().toISOString(),
        })
        generateNarrativeForMode(result, dpHistory)
          .then(narrative => {
            if (narrative?.length > 0)
              sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          })
          .catch(err => console.warn('[webhook accept] narrative failed:', err.message))
      } catch (err) {
        console.error('[webhook accept] rescore failed:', err.message)
      }
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /webhook/dismiss — discard pending levels
app.post('/webhook/dismiss', (req, res) => {
  try {
    db.prepare(`UPDATE pending_levels SET status = 'dismissed' WHERE status = 'pending'`).run()
    sseEmitter.emit('event', { type: 'levels_dismissed', timestamp: new Date().toISOString() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
