import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import SmartDataProvider from './dataProvider/SmartDataProvider.js'
import pollingConfig from './dataProvider/pollingConfig.js'
import { runFullScore } from './scorer/index.js'

const app = express()
const PORT = process.env.PORT || 3001
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*'

app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// In-memory store
let latest = null
const history = []
const MAX_HISTORY = 20

// ── DataProvider ──────────────────────────────────────────────────────────────
const provider = new SmartDataProvider(
  process.env.UW_API_KEY,
  process.env.UW_API_BASE || 'https://api.unusualwhales.com',
  pollingConfig
)

// On rescore trigger — run full scoring, update store
provider.onRescore(async ({ price, reason }) => {
  console.log(`[server] Auto-rescore triggered: ${reason} at $${price}`)
  try {
    const result = await runFullScore({ trigger: 'auto' })
    result._received_at = new Date().toISOString()
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    // Update DataProvider with fresh level prices for adaptive polling
    provider.setLevels(result.levels)
    console.log(`[server] Auto-rescore complete — ${result.levels.length} levels scored`)
  } catch (err) {
    console.error('[server] Auto-rescore failed:', err.message)
  }
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

// ── Existing endpoints ────────────────────────────────────────────────────────
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
  res.json({
    status: 'ok',
    last_update: latest?._received_at || null,
    version: '4a',
  })
})

// ── New DataProvider endpoints ────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json(provider.getStatus())
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

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
