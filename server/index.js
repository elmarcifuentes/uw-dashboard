import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import SmartDataProvider from './dataProvider/SmartDataProvider.js'
import pollingConfig from './dataProvider/pollingConfig.js'
import { runFullScore } from './scorer/index.js'
import db from './db.js'
import { logger } from './sessionLogger.js'

const app = express()
const PORT = process.env.PORT || 3001
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*'

app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// In-memory store
let latest            = null
let previousResult    = null
let chartSynced       = true
const history         = []
const MAX_HISTORY     = 20

// Expansion GEX tracking
let expansionGexHistory  = []
let allPinningSessions   = 0

// DP history — last 3 readings per level
const dpHistory = { R2: [], R1: [], MID: [], S1: [], S2: [] }

function generateNarrative(result, dpHist) {
  if (!result?.levels) return null
  const lines  = []
  const price  = result.current_price
  const cascade = result.cascade
  const sb     = result.structure_break
  const levels = result.levels
  const getLevel = id => levels.find(l => l.id === id)

  // 1. Price location between nearest levels
  if (price != null && levels.length) {
    const sorted = [...levels].sort((a, b) => b.price - a.price)
    const above  = sorted.filter(l => l.price > price)
    const below  = sorted.filter(l => l.price < price)
    const nearAbove = above[above.length - 1]
    const nearBelow = below[0]
    if (nearAbove && nearBelow) {
      lines.push(
        `Price $${price.toFixed(2)} is $${(nearAbove.price - price).toFixed(2)} below ` +
        `${nearAbove.id} $${nearAbove.price.toFixed(2)} and ` +
        `$${(price - nearBelow.price).toFixed(2)} above ${nearBelow.id} $${nearBelow.price.toFixed(2)}.`
      )
    } else if (!above.length) {
      lines.push(`Price $${price.toFixed(2)} is above R2 — structure break upside.`)
    } else if (!below.length) {
      lines.push(`Price $${price.toFixed(2)} is below S2 — structure break downside.`)
    }
  }

  // 2. Cascade status
  if (cascade?.active) {
    lines.push(
      `⚠ CASCADE ACTIVE — all three conditions met. No institutional floor at S1 or S2. ` +
      `MID confirmed resistance at ${cascade.mid_dp?.toFixed(3)}.`
    )
  } else if (cascade?.conditions?.[0]) {
    lines.push(
      `Cascade condition 1 met (MID dp ${cascade.mid_dp?.toFixed(3)}). ` +
      `${Math.abs(cascade.gap_to_trigger ?? 0).toFixed(3)} past threshold. ` +
      `S1 and S2 blocking full cascade.`
    )
  } else if (cascade?.mid_dp != null && cascade.mid_dp <= -0.500) {
    lines.push(
      `MID dark pool ${cascade.mid_dp.toFixed(3)} — approaching cascade threshold (-0.700). Watch S1 dark pool.`
    )
  }

  // 3. Full stack / strongest signal
  const classified  = levels.filter(l => l.classification !== 'no_edge' && l.confidence !== 'none')
  const fullStacks  = classified.filter(l => l.full_stack)
  if (fullStacks.length > 0) {
    const names = fullStacks.map(l => `${l.id} $${l.price.toFixed(2)}`).join(' and ')
    lines.push(`★ FULL STACK active on ${names} — maximum conviction setup.`)
  } else if (classified.length > 0) {
    const strongest = [...classified].sort((a, b) => b.score - a.score)[0]
    const cls = strongest.classification === 'buy_support' ? 'buy support' : 'sell resistance'
    lines.push(
      `Strongest signal: ${strongest.id} $${strongest.price.toFixed(2)} — ` +
      `${cls} score ${strongest.score}, ${strongest.confidence} confidence.`
    )
  } else {
    lines.push(`No classified levels — all no_edge. Low-signal environment.`)
  }

  // 4. Expansion GEX
  levels.filter(l => (l.net_gex ?? 0) < 0).forEach(l => {
    lines.push(
      `⚠ Expansion GEX at ${l.id} (${(l.net_gex ?? 0).toLocaleString()}) — ` +
      `no mechanical friction, price accelerates through this level.`
    )
  })

  // 5. MID DP trajectory
  const midHist = dpHist?.MID
  if (midHist && midHist.length >= 2) {
    const last = midHist[midHist.length - 1].value
    const prev = midHist[midHist.length - 2].value
    if (last < prev && last <= -0.300) {
      lines.push(
        `MID dark pool declining: ${midHist.map(h => h.value.toFixed(3)).join(' → ')} ↓ — watch for cascade conditions building.`
      )
    }
  }

  // 6. Structure break
  if (sb?.active) {
    const dir = sb.direction === 'upside' ? 'UPSIDE' : 'DOWNSIDE'
    const ext = sb.r3 ? ` R3/S3 at $${sb.r3}.` : ''
    lines.push(`⚠ STRUCTURE BREAK ${dir}.${ext} Trail stop from broken level.`)
  } else if (sb?.distance_to_r2 != null && sb.distance_to_r2 <= 0.50) {
    lines.push(`Structure break imminent — R2 $${sb.distance_to_r2.toFixed(2)} away.`)
  } else if (sb?.distance_to_s2 != null && sb.distance_to_s2 <= 0.50) {
    lines.push(`Structure break imminent — S2 $${sb.distance_to_s2.toFixed(2)} away.`)
  }

  // 7. Passive targets
  levels.filter(l => l.passive_target && l.passive_target_from).forEach(l => {
    const target = getLevel(l.passive_target_from)
    if (!target) return
    const dist = Math.abs(target.price - l.price).toFixed(2)
    const dir  = l.classification === 'buy_support' ? 'UP' : 'DOWN'
    const sign = dir === 'UP' ? '+' : '-'
    lines.push(`Passive target ${dir}: ${l.id} → ${target.id} ${sign}$${dist}.`)
  })

  return lines.length > 0 ? lines : null
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
  console.log(`[server] Auto-rescore triggered: ${reason} at $${price}`)
  try {
    const result = await runFullScore({ trigger: 'auto' })
    result._received_at = new Date().toISOString()
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    provider.setLevels(result.levels)
    console.log(`[server] Auto-rescore complete — ${result.levels.length} levels scored`)
    emitStaleIfChanged(result)
    checkExpansionGex(result)
    updateDpHistory(result)
    sseEmitter.emit('event', {
      type:        'rescore',
      result,
      trigger:     reason,
      price,
      expansionGex: detectExpansionGex(result),
      dpHistory:   { ...dpHistory },
      narrative:   generateNarrative(result, dpHistory),
      timestamp:   new Date().toISOString(),
    })
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
app.post('/update', (req, res) => {
  const result = req.body
  if (!result || typeof result !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  result._received_at = new Date().toISOString()
  latest = result
  history.unshift(result)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  if (result.levels) provider.setLevels(result.levels)
  if (result.current_price) provider.rest.lastPrice = Number(result.current_price)
  console.log(`[update] session=${result.session} run_type=${result.run_type}`)
  emitStaleIfChanged(result)
  checkExpansionGex(result)
  updateDpHistory(result)
  sseEmitter.emit('event', {
    type:        'rescore',
    result,
    trigger:     result.run_type || 'update',
    price:       result.current_price,
    expansionGex: detectExpansionGex(result),
    dpHistory:    { ...dpHistory },
    narrative:    generateNarrative(result, dpHistory),
    timestamp:    new Date().toISOString(),
  })
  res.json({ ok: true })
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
  console.log('[server] Manual rescore triggered from dashboard')
  try {
    const result = await runFullScore({ trigger: 'manual' })
    result._received_at = new Date().toISOString()
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    provider.setLevels(result.levels)
    checkExpansionGex(result)
    updateDpHistory(result)
    sseEmitter.emit('event', {
      type:        'rescore',
      result,
      trigger:     'manual — dashboard button',
      price:       result.current_price,
      expansionGex: detectExpansionGex(result),
      dpHistory:   { ...dpHistory },
      narrative:   generateNarrative(result, dpHistory),
      timestamp: new Date().toISOString(),
    })
    res.json({ success: true })
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

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
