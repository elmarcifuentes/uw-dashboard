import 'dotenv/config'
import express from 'express'
import cors from 'cors'
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
let latest = null
const history = []
const MAX_HISTORY = 20

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
    sseEmitter.emit('event', {
      type: 'rescore',
      result,
      trigger: reason,
      price,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[server] Auto-rescore failed:', err.message)
  }
})

// Session open price tracking
let sessionOpenPrice = null
let sessionDate      = null
let alertFired       = false  // fire once per session crossing

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

  sseEmitter.emit('event', {
    type:         'price',
    price,
    interval:     s.currentInterval,
    isMarketHours: s.isMarketHours,
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
  sseEmitter.emit('event', {
    type: 'rescore',
    result,
    trigger: result.run_type || 'update',
    price: result.current_price,
    timestamp: new Date().toISOString(),
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
  })
})

app.post('/mode', (req, res) => {
  const { useWebSocket } = req.body
  if (typeof useWebSocket !== 'boolean') {
    return res.status(400).json({ error: 'useWebSocket must be boolean' })
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
    sseEmitter.emit('event', {
      type: 'rescore',
      result,
      trigger: 'manual — dashboard button',
      price: result.current_price,
      timestamp: new Date().toISOString(),
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[server] Manual rescore failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
