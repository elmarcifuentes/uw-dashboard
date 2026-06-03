import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*'

app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

let latest = null
const history = []
const MAX_HISTORY = 20

app.post('/update', (req, res) => {
  const result = req.body
  if (!result || typeof result !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  result._received_at = new Date().toISOString()
  latest = result
  history.unshift(result)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
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
    version: '4a'
  })
})

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
