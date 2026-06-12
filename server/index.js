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
let lastNarrative           = []
let priceHistory            = []   // max 50 points for mini chart
let lastTrackedPrice        = null
const touchedLevels         = {}   // level_id → last touch timestamp
let lastNarrativeHash       = null
let lastNarrativeMode       = null
let lastLevelNarratives      = {}
let lastLevelNarrativeHashes = {}
let lastSessionBrief         = null
let lastSessionBriefHash     = null
let lastTacticalBrief        = null
let lastAssistantRead        = null
let lastAssistantReadHash    = null
const history         = []
const MAX_HISTORY     = 20

// Pause state
let systemPaused = false

// Active trades — per symbol
let activeTrades = { NQ: null, QQQ: null, ES: null, SPY: null }

// Expansion GEX tracking
let expansionGexHistory  = []
let allPinningSessions   = 0

// Narrative mode: 'template' | 'claude' | 'off'
let narrativeMode       = process.env.NARRATIVE_MODE || 'template'
let narrativeModeSource = process.env.NARRATIVE_MODE ? 'env' : 'default'

// Restore persisted mode from SQLite (overrides env default, not explicit env var)
if (!process.env.NARRATIVE_MODE) {
  try {
    const saved = db.prepare(`SELECT value FROM settings WHERE key = 'narrative_mode'`).get()
    if (saved?.value) {
      narrativeMode       = saved.value
      narrativeModeSource = 'db'
      console.log('[server] Narrative mode restored from DB:', narrativeMode)
    }
  } catch { /* settings table may not exist on first boot — db.exec creates it */ }
}
console.log('[server] Narrative mode initialized:', narrativeMode, `(${narrativeModeSource})`)

// Level source mode: 'auto_nq' | 'manual'
let levelSourceMode = 'auto_nq'
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'level_source_mode'`).get()
  if (saved?.value) {
    levelSourceMode = saved.value
    console.log('[levels] source mode restored:', levelSourceMode)
  }
} catch { console.log('[levels] defaulting to auto mode') }

// NQ offset settings for auto_qqq mode
let nqOffsets = { ratio: null, R2: 0, R1: 0, MID: 0, S1: 0, S2: 0 }
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'nq_offsets'`).get()
  if (saved?.value) {
    nqOffsets = JSON.parse(saved.value)
    console.log('[levels] NQ offsets restored:', nqOffsets)
  }
} catch {}

// Session ratio lock — locked at 9:30 AM ET, persists all session
let sessionRatio         = null
let sessionRatioLockedAt = null
let sessionRatioDate     = null

// Auto-score toggle — default ON
let autoScoreEnabled = true
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'auto_score_enabled'`).get()
  if (saved?.value !== undefined) {
    autoScoreEnabled = saved.value === 'true'
    console.log('[scoring] auto-score restored:', autoScoreEnabled)
  }
} catch {}

// Restore pause state from SQLite
{
  try {
    const saved = db.prepare(`SELECT value FROM settings WHERE key = 'system_paused'`).get()
    if (saved?.value === 'true') {
      systemPaused = true
      console.log('[server] System pause state restored from DB — polling disabled')
    }
  } catch { /* settings table may not exist on first boot */ }
}

// Active symbol preference — synced from frontend
let activeSymbolPref = 'NQ'
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'active_symbol'`).get()
  if (saved?.value) {
    activeSymbolPref = saved.value
    console.log('[settings] active symbol restored:', activeSymbolPref)
  }
} catch {}

// Trade log table
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT, symbol TEXT, instrument TEXT, contracts INTEGER DEFAULT 1,
    direction TEXT, entry_price REAL, target_price REAL, stop_price REAL,
    exit_price REAL, exit_reason TEXT, pnl_points REAL, pnl_dollars REAL,
    duration_minutes INTEGER, entry_level TEXT, target_level TEXT,
    cascade_active INTEGER DEFAULT 0, setup_rr REAL, actual_rr REAL,
    notes TEXT, entered_at TEXT DEFAULT (datetime('now')), exited_at TEXT
  )
`)

// Restore active trades (per-symbol)
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'active_trades'`).get()
  if (saved?.value) {
    activeTrades = { ...activeTrades, ...JSON.parse(saved.value) }
    const active = Object.entries(activeTrades).filter(([, t]) => t).map(([s]) => s)
    if (active.length) console.log('[trade] restored:', active.join(', '))
  } else {
    // Migrate from legacy single-trade key
    const legacy = db.prepare(`SELECT value FROM settings WHERE key = 'active_trade'`).get()
    if (legacy?.value) {
      const t = JSON.parse(legacy.value)
      const sym = t?.symbol || t?.priceUnit || 'NQ'
      activeTrades[sym] = t
      console.log('[trade] migrated legacy trade:', sym, t?.direction, t?.entry)
    }
  }
} catch (e) {}

function saveActiveTrades() {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('active_trades', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(activeTrades))
}

// Instrument config
const INSTRUMENTS = {
  NQ:  { type: 'futures', pointValue: 20,  tickSize: 0.25 },
  MNQ: { type: 'futures', pointValue: 2,   tickSize: 0.25 },
  ES:  { type: 'futures', pointValue: 50,  tickSize: 0.25 },
  MES: { type: 'futures', pointValue: 5,   tickSize: 0.25 },
  QQQ: { type: 'equity',  pointValue: 1,   tickSize: 0.01 },
  SPY: { type: 'equity',  pointValue: 1,   tickSize: 0.01 },
}

function hashSessionState(result) {
  if (!result) return null
  const key = {
    cascade_active:         result.cascade?.active,
    cascade_armed:          result.cascade?.conditions?.[0],
    structure_break:        result.structure_break?.active,
    structure_break_dir:    result.structure_break?.direction,
    etf_direction:          result.etf_tide?.direction,
    dominant_classification: result.levels?.map(l => l.classification).join(','),
    full_stack_levels:       result.levels?.filter(l => l.full_stack).map(l => l.id).join(','),
    expansion_gex_levels:    result.levels?.filter(l => (l.net_gex || 0) < 0).map(l => l.id).join(','),
    mid_dp:                  result.levels?.find(l => l.id === 'MID')?.dark_pool?.toFixed(2),
  }
  return crypto.createHash('md5').update(JSON.stringify(key)).digest('hex')
}

async function generateSessionBrief(result) {
  if (narrativeMode !== 'claude') return null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const hash = hashSessionState(result)
  if (hash && hash === lastSessionBriefHash && lastSessionBrief) {
    console.log('[session-brief] cache hit')
    return { session: lastSessionBrief, tactical: lastTacticalBrief }
  }

  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio
  const currentPrice = result?.current_price
  const cascade      = result?.cascade
  const mid          = levels.find(l => l.id === 'MID')

  const levelSummary = levels.map(l =>
    `${l.id}: ${fmtForSymbol(l.price, nqRatio)} — ` +
    `${l.classification} | DP ${l.dark_pool?.toFixed(3)} | score ${l.score} | conf ${l.confidence}` +
    `${l.full_stack ? ' | FULL STACK ★' : ''}` +
    `${(l.net_gex || 0) < 0 ? ' | EXPANSION GEX ⚠' : ''}`
  ).join('\n')

  const currentStr = fmtForSymbol(currentPrice, nqRatio)

  const cascadeStr = cascade?.active
    ? 'CASCADE ACTIVE ⚠ — no institutional floor below MID'
    : cascade?.conditions?.[0]
    ? `Cascade armed — MID DP ${mid?.dark_pool?.toFixed(3)}, ${Math.abs(-0.700 - (mid?.dark_pool || 0)).toFixed(3)} from trigger`
    : 'Cascade inactive'

  const sessionPrompt = `You are a professional ${activeSymbolPref} trading analyst preparing a pre-session brief.

CURRENT MARKET STATE:
Price: ${currentStr}
Date: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}

LEVEL STRUCTURE:
${levelSummary}

CASCADE: ${cascadeStr}
STRUCTURE BREAK: ${result?.structure_break?.active ? 'ACTIVE — ' + result.structure_break.direction : 'intact'}
ETF TIDE: ${result?.etf_tide?.direction || 'unknown'}

Write EXACTLY 3 sentences. No more than 3 sentences total. Each sentence max 25 words.
Sentence 1: Overall structure — dominant level and why (include DP value).
Sentence 2: Primary risk — cascade threshold or key level with exact gap.
Sentence 3: Key thresholds — specific prices to watch.

Use ONLY ${activeSymbolPref} prices. Do NOT include QQQ/NQ cross-references in parentheses.
Cascade fires when MID dark pool crosses -0.700 only. No bullets, no headers.
CRITICAL: Return ONLY 3 sentences. Stop after the third sentence.`

  const tacticalPrompt = `You are analyzing live ${activeSymbolPref} futures flow.

CURRENT STATE: Price ${currentStr}
LEVELS:\n${levelSummary}
CASCADE: ${cascadeStr}

Write exactly 2 sentences:
1. Where price is right now relative to the most important level
2. The single most important thing to watch next

Use ${activeSymbolPref} prices only — no cross-reference prices in parentheses. Be specific with DP values. Max 2 sentences.
Return ONLY the 2 sentences.`

  try {
    console.log('[session-brief] generating...')
    const [sessionRes, tacticalRes] = await Promise.all([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: sessionPrompt }] }),
        signal: AbortSignal.timeout(15000),
      }),
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: tacticalPrompt }] }),
        signal: AbortSignal.timeout(15000),
      }),
    ])
    const sessionText  = (await sessionRes.json()).content?.[0]?.text
    const tacticalText = (await tacticalRes.json()).content?.[0]?.text
    if (sessionText) {
      lastSessionBrief     = sessionText
      lastTacticalBrief    = tacticalText
      lastSessionBriefHash = hash
      console.log('[session-brief] generated')
      console.log('[session-brief] preview:', sessionText.slice(0, 80) + '...')
    }
    return { session: sessionText, tactical: tacticalText }
  } catch (err) {
    console.warn('[session-brief] failed:', err.message)
    return null
  }
}

function hashLevel(level) {
  if (!level) return null
  const key = {
    id:             level.id,
    classification: level.classification,
    dp:             level.dark_pool?.toFixed(2),
    score:          Math.round((level.score || 0) / 5) * 5,
    full_stack:     level.full_stack,
    confidence:     level.confidence,
    etf_direction:  level.etf_direction,
    expansion_gex:  (level.net_gex || 0) < 0,
    dp_condition:   level.dp_condition,
  }
  return crypto.createHash('md5').update(JSON.stringify(key)).digest('hex')
}

function nqPrice(qqqPrice, nqRatio) {
  if (!qqqPrice || !nqRatio) return null
  return Math.round(qqqPrice * nqRatio)
}

function formatPrice(qqq, nqRatio) {
  const nq = nqPrice(qqq, nqRatio)
  return nq ? `$${qqq?.toFixed(2)} (NQ ${nq.toLocaleString()})` : `$${qqq?.toFixed(2)}`
}

// Format a QQQ price in the active symbol's native units
function fmtForSymbol(qqqPrice, nqRatio) {
  if (qqqPrice == null) return '—'
  if (activeSymbolPref === 'NQ' && nqRatio) {
    const nq = Math.round(qqqPrice * nqRatio * 4) / 4
    return '$' + nq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return '$' + qqqPrice.toFixed(2)
}

async function generateLevelNarratives(result) {
  if (narrativeMode !== 'claude') return {}
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return {}

  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio
  const currentPrice = result?.current_price
  const cascade      = result?.cascade

  const narratives = { ...lastLevelNarratives }
  let anyUpdated = false

  for (const level of levels) {
    const hash = hashLevel(level)
    if (hash && hash === lastLevelNarrativeHashes[level.id]) {
      console.log(`[level-narrative] ${level.id} cache hit`)
      continue
    }
    console.log(`[level-narrative] generating for ${level.id}`)
    const nq       = nqPrice(level.price, nqRatio)
    const distQqq  = currentPrice != null ? (currentPrice - level.price).toFixed(2) : null
    const distNq   = distQqq && nqRatio ? Math.round(Math.abs(distQqq) * nqRatio) : null
    const above    = distQqq != null ? parseFloat(distQqq) > 0 : null

    const otherLevels = levels.filter(l => l.id !== level.id).map(l =>
      `${l.id}: ${fmtForSymbol(l.price, nqRatio)} — ${l.classification} (DP ${l.dark_pool?.toFixed(3)}, score ${l.score})`
    ).join('\n')

    const distStr = distQqq != null
      ? `${above ? '+' : '-'}${fmtForSymbol(Math.abs(distQqq), nqRatio ? 1 / nqRatio * nqRatio : null)} ${above ? 'above' : 'below'} this level`
      : ''

    const prompt = `You are a professional ${activeSymbolPref} trading analyst.

Analyze this specific level and provide actionable trading guidance.

CURRENT LEVEL — ${level.id}:
  Price: ${fmtForSymbol(level.price, nqRatio)}
  Classification: ${level.classification}
  Confidence: ${level.confidence}
  Score: ${level.score}
  Dark Pool: ${level.dark_pool?.toFixed(4)}
  Full Stack: ${level.full_stack ? 'YES ★' : 'no'}
  ETF Direction: ${level.etf_direction || 'none'}
  ${(level.net_gex || 0) < 0 ? '⚠ EXPANSION GEX — no mechanical friction' : 'GEX pinning active'}

CURRENT PRICE: ${fmtForSymbol(currentPrice, nqRatio)} ${distStr}

OTHER LEVELS:
${otherLevels}

CASCADE: ${cascade?.active ? 'ACTIVE ⚠' : cascade?.conditions?.[0] ? 'ARMED (condition 1 met)' : 'inactive'}
STRUCTURE BREAK: ${result?.structure_break?.active ? 'ACTIVE — ' + result.structure_break.direction : 'intact'}

Write 3-4 sentences: what the classification/DP means, what to watch for, retest scenario, target on confirmation.
Use ONLY ${activeSymbolPref} prices — no QQQ/NQ cross-references in parentheses.
Plain English, no bullets. Return ONLY the analysis text.`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text
      if (text) {
        narratives[level.id] = text
        lastLevelNarrativeHashes[level.id] = hash
        anyUpdated = true
        console.log(`[level-narrative] ${level.id} generated`)
      }
    } catch (err) {
      console.warn(`[level-narrative] ${level.id} failed:`, err.message)
    }
  }

  if (anyUpdated) lastLevelNarratives = narratives
  return narratives
}

function generateTemplateAssistantRead(result) {
  const levels  = result?.levels || []
  const price   = result?.current_price
  const cascade = result?.cascade
  const mid     = levels.find(l => l.id === 'MID')
  const nqRatio = result?.nq_ratio
  const nq      = p => nqRatio ? ` (NQ ${Math.round(p * nqRatio).toLocaleString()})` : ''
  if (!levels.length || price == null) return null

  const nearest  = levels.reduce((n, l) => Math.abs(price - l.price) < Math.abs(price - n.price) ? l : n)
  const sellLvls = levels.filter(l => l.classification === 'sell_resistance')
  const buyLvls  = levels.filter(l => l.classification === 'buy_support')
  const gap      = mid?.dark_pool != null ? Math.abs(-0.700 - mid.dark_pool).toFixed(3) : null

  return {
    now: `Price $${price.toFixed(2)}${nq(price)} ${price > nearest.price ? 'above' : 'below'} ${nearest.id} $${nearest.price.toFixed(2)}${nq(nearest.price)}.`,
    next: sellLvls.length > 0
      ? `Watch ${sellLvls[0].id} $${sellLvls[0].price.toFixed(2)}${nq(sellLvls[0].price)} for rejection.`
      : buyLvls.length > 0
      ? `Watch ${buyLvls[0].id} $${buyLvls[0].price.toFixed(2)}${nq(buyLvls[0].price)} for support.`
      : 'No classified levels — monitor for development.',
    risk: cascade?.active
      ? 'CASCADE ACTIVE — no institutional floor below MID.'
      : gap && mid?.dark_pool <= -0.500
      ? `MID dark pool ${mid.dark_pool.toFixed(3)} — ${gap} from cascade trigger.`
      : result?.structure_break?.active
      ? `Structure break ${result.structure_break.direction} — GEX extension active.`
      : 'No immediate risk signal.',
    invalidation: sellLvls.length > 0
      ? `Sustained close above $${sellLvls[0].price.toFixed(2)}${nq(sellLvls[0].price)} weakens bearish read.`
      : buyLvls.length > 0
      ? `Break below $${buyLvls[0].price.toFixed(2)}${nq(buyLvls[0].price)} invalidates support.`
      : 'Watch for classification change on any level.',
  }
}

async function generateAssistantRead(result) {
  const fallback = generateTemplateAssistantRead(result)
  if (!fallback) return null
  if (narrativeMode !== 'claude') return fallback

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback

  const hash = hashScoringResult(result)
  if (hash && hash === lastAssistantReadHash && lastAssistantRead) {
    console.log('[assistant] cache hit')
    return lastAssistantRead
  }

  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio
  const currentPrice = result?.current_price
  const cascade      = result?.cascade
  const mid          = levels.find(l => l.id === 'MID')

  const levelSummary = levels.map(l =>
    `${l.id} ${fmtForSymbol(l.price, nqRatio)} — ${l.classification} DP ${l.dark_pool?.toFixed(3)}${l.full_stack ? ' FULL STACK ★' : ''}`
  ).join('\n')

  const cascadeStr = cascade?.active ? 'ACTIVE' : mid?.dark_pool <= -0.700 ? 'threshold met' : `${Math.abs(-0.700 - (mid?.dark_pool || 0)).toFixed(3)} from trigger`

  const prompt = `Analyze this ${activeSymbolPref} scoring result.

Price: ${fmtForSymbol(currentPrice, nqRatio)}
Levels: ${levelSummary}
Cascade: ${cascadeStr}

Use ONLY ${activeSymbolPref} prices. No QQQ/NQ cross-reference prices.
Return ONLY this JSON. Each value MAX 10 words.
No markdown. No explanation.

{"now":"10 words max describing current state","next":"10 words max on next likely move","risk":"10 words max on primary risk","invalidation":"10 words max on what changes thesis"}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    const text = data.content?.[0]?.text?.trim()
    if (!text) throw new Error('No response')
    const clean  = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    if (!parsed.now || !parsed.next || !parsed.risk || !parsed.invalidation) throw new Error('Missing fields')
    lastAssistantRead     = parsed
    lastAssistantReadHash = hash
    console.log('[assistant] read generated:', parsed.now.slice(0, 60) + '...')
    return parsed
  } catch (err) {
    console.warn('[assistant] Claude failed:', err.message)
    return fallback
  }
}

function hashScoringResult(result) {
  if (!result) return null
  const key = {
    cascade:             result.cascade?.active,
    cascade_armed:       result.cascade?.conditions?.[0],
    structure_break:     result.structure_break?.active,
    structure_break_dir: result.structure_break?.direction,
    levels:              result.levels?.map(l => ({
      id:             l.id,
      classification: l.classification,
      dp:             l.dark_pool?.toFixed(2),
      full_stack:     l.full_stack,
      score:          Math.round((l.score ?? 0) / 5) * 5,
    })),
  }
  return crypto.createHash('md5').update(JSON.stringify(key)).digest('hex')
}

async function generateNarrativeForMode(result, dpHist) {
  console.log('[narrative] mode:', narrativeMode)

  if (narrativeMode === 'off') return []

  if (narrativeMode === 'template') {
    const lines = generateNarrative(result, dpHist)
    console.log('[narrative] template generated:', lines?.length)
    return lines
  }

  // claude mode — direct Anthropic API call with hash-based cache
  const currentHash = hashScoringResult(result)
  if (currentHash && currentHash === lastNarrativeHash && lastNarrativeMode === 'claude' && lastNarrative.length > 0) {
    console.log('[narrative] cache hit — conditions unchanged, skipping API call')
    return lastNarrative
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[narrative] ANTHROPIC_API_KEY not set — falling back to template')
    return generateNarrative(result, dpHist)
  }

  const prompt = `You are analyzing live ${activeSymbolPref} institutional flow data.

Current scoring result:
${JSON.stringify(result, null, 2)}

Write a 3-4 sentence trading narrative that covers:
- Where price sits relative to key levels (R2, R1, MID, S1, S2)
- The most important signal right now
- Primary risk to watch
- One actionable observation

Rules:
- Be specific with prices and level IDs
- Use ONLY ${activeSymbolPref} prices — no QQQ/NQ cross-references in parentheses
- Mention dark pool values when significant (±0.500+)
- Flag cascade if MID dark pool approaching -0.700
- Flag FULL STACK ★ if any level shows it
- Flag expansion GEX if net_gex negative on any level
- Plain English — no bullet points — flowing prose only
- Maximum 4 sentences

Return ONLY the narrative text. No labels, no headers.`

  try {
    console.log('[narrative] calling Anthropic API — hash changed')
    console.log('[narrative] old hash:', lastNarrativeHash)
    console.log('[narrative] new hash:', currentHash)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    const narrativeText = data.content?.[0]?.text
    if (!narrativeText) throw new Error(`No narrative in API response: ${JSON.stringify(data).slice(0, 200)}`)
    const lines = narrativeText.split('. ').filter(Boolean).map(s => s.endsWith('.') ? s : s + '.')
    lastNarrativeHash = currentHash
    lastNarrativeMode = 'claude'
    console.log('[narrative] claude generated:', lines.length, 'lines')
    console.log('[narrative] line 1:', lines[0])
    return lines
  } catch (err) {
    console.warn('[narrative] Anthropic API error:', err.message)
    console.log('[narrative] falling back to template')
    return generateNarrative(result, dpHist)
  }
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
    if (dpHistory[level.id].length > 8) dpHistory[level.id].shift()
  }
}

function trackLevelTouches(currentPrice, levels, dbInstance) {
  if (!currentPrice || !levels?.length) return
  const today   = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const prev    = lastTrackedPrice
  const cooldown = 60000
  levels.forEach(level => {
    const dist      = Math.abs(currentPrice - level.price)
    const lastTouch = touchedLevels[level.id] || 0
    if (dist <= 0.15 && Date.now() - lastTouch > cooldown) {
      touchedLevels[level.id] = Date.now()
      let touchType = 'touch'
      if (prev) {
        const crossed = (prev < level.price && currentPrice >= level.price) ||
                        (prev >= level.price && currentPrice < level.price)
        if (crossed) touchType = 'cross'
      }
      try {
        dbInstance.prepare(
          `INSERT INTO level_touches (session_date, level_id, touch_type, price, dp, classification)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(today, level.id, touchType, currentPrice, level.dark_pool, level.classification)
        console.log(`[touch] ${level.id} ${touchType} at $${currentPrice?.toFixed(2)}`)
      } catch { /* table may not exist on first boot */ }
    }
  })
  lastTrackedPrice = currentPrice
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
  if (systemPaused) {
    console.log(`[rescore] Skipped — system paused (${reason} at $${price})`)
    return
  }
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
    const result = await runScoreWithNq({ trigger: 'auto', levelsOverride: levelsForScoring })
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
    if (result.current_price) trackLevelTouches(result.current_price, result.levels, db)
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
          lastNarrative = narrative
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          console.log('[narrative] SSE emitted (auto-rescore)')
        }
      })
      .catch(err => console.warn('[narrative] async failed:', err.message))
    generateLevelNarratives(result)
      .then(levelNarratives => {
        if (Object.keys(levelNarratives).length > 0) {
          lastLevelNarratives = levelNarratives
          sseEmitter.emit('event', { type: 'level_narratives_update', narratives: levelNarratives, timestamp: new Date().toISOString() })
          console.log('[level-narrative] SSE emitted')
        }
      })
      .catch(err => console.warn('[level-narrative] failed:', err.message))
    generateSessionBrief(result)
      .then(briefs => {
        if (briefs?.session) {
          sseEmitter.emit('event', { type: 'session_brief_update', session: briefs.session, tactical: briefs.tactical, timestamp: new Date().toISOString() })
          console.log('[session-brief] SSE emitted')
        }
      })
      .catch(err => console.warn('[session-brief] failed:', err.message))
    generateAssistantRead(result)
      .then(read => {
        if (read) {
          lastAssistantRead = read
          sseEmitter.emit('event', { type: 'assistant_read_update', assistantRead: read, timestamp: new Date().toISOString() })
        }
      })
      .catch(err => console.warn('[assistant] failed:', err.message))
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
  if (systemPaused) return
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

  lastEmittedPrice = price
  priceHistory.push({ price, ts: Date.now() })
  if (priceHistory.length > 50) priceHistory.shift()
  if (latest?.levels) trackLevelTouches(price, latest.levels, db)

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

  // Send live price immediately so reconnecting clients don't wait for next poll
  const livePrice = provider.getStatus().lastPrice
  if (livePrice) {
    res.write(`data: ${JSON.stringify({
      type: 'price',
      price: livePrice,
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
        lastNarrative = narrative
        sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
        console.log('[narrative] SSE emitted (/update)')
      }
    })
    .catch(err => console.warn('[narrative] async failed:', err.message))
  generateLevelNarratives(result)
    .then(levelNarratives => {
      if (Object.keys(levelNarratives).length > 0) {
        lastLevelNarratives = levelNarratives
        sseEmitter.emit('event', { type: 'level_narratives_update', narratives: levelNarratives, timestamp: new Date().toISOString() })
        console.log('[level-narrative] SSE emitted')
      }
    })
    .catch(err => console.warn('[level-narrative] failed:', err.message))
  generateSessionBrief(result)
    .then(briefs => {
      if (briefs?.session) {
        sseEmitter.emit('event', { type: 'session_brief_update', session: briefs.session, tactical: briefs.tactical, timestamp: new Date().toISOString() })
        console.log('[session-brief] SSE emitted')
      }
    })
    .catch(err => console.warn('[session-brief] failed:', err.message))
  generateAssistantRead(result)
    .then(read => {
      if (read) {
        lastAssistantRead = read
        sseEmitter.emit('event', { type: 'assistant_read_update', assistantRead: read, timestamp: new Date().toISOString() })
      }
    })
    .catch(err => console.warn('[assistant] failed:', err.message))
})

app.get('/latest', (req, res) => {
  if (!latest) return res.status(404).json({ error: 'No data yet' })
  res.json(latest)
})

app.get('/history', (req, res) => {
  res.json(history)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', last_update: latest?._received_at || null, version: '4c' })
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
    narrativeModeSource,
    systemPaused,
    pausedAt: systemPaused
      ? (db.prepare(`SELECT value FROM settings WHERE key = 'paused_at'`).get()?.value || null)
      : null,
    levelSourceMode,
    nqOffsets,
    autoScoreEnabled,
    activeSymbolPref,
    sessionRatio,
    sessionRatioLockedAt,
    activeRatio: getActiveRatio(),   // the EXACT ratio used for canonical derivation (locked || live)
    ratioIsLocked: !!sessionRatio,
    ratioIsFromToday: sessionRatioDate === new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    nqContract: activeNQContract,
    nqContractExpiry: activeNQContractExpiry,
    contractRecalibrating,
    contractRolledFrom,
    daysToExpiry: nqContractDaysToExpiry,
  })
})

app.post('/system/pause', (req, res) => {
  systemPaused = true
  const now = new Date().toISOString()
  try {
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('system_paused', 'true', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`).run()
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('paused_at', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(now)
  } catch (e) { console.warn('[pause] SQLite write failed:', e.message) }
  provider?.stop?.()
  sseEmitter.emit('event', { type: 'system_paused', pausedAt: now, timestamp: now })
  console.log('[server] System PAUSED at', now)
  res.json({ success: true, paused: true, pausedAt: now })
})

app.post('/system/resume', (req, res) => {
  systemPaused = false
  const now = new Date().toISOString()
  try {
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('system_paused', 'false', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = datetime('now')`).run()
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('paused_at', NULL, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = NULL, updated_at = datetime('now')`).run()
  } catch (e) { console.warn('[resume] SQLite write failed:', e.message) }
  provider?.start?.()
  sseEmitter.emit('event', { type: 'system_resumed', resumedAt: now, timestamp: now })
  console.log('[server] System RESUMED at', now)
  res.json({ success: true, paused: false, resumedAt: now })
})


app.post('/narrative-mode', async (req, res) => {
  const { mode } = req.body
  if (!['template', 'claude', 'off'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode — use template|claude|off' })
  }
  narrativeMode       = mode
  narrativeModeSource = 'db'
  // Reset hash so first narrative after mode switch always generates fresh
  if (mode === 'claude') lastNarrativeHash = null
  // Persist so mode survives Railway restarts
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('narrative_mode', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(mode)
  console.log('[server] Narrative mode set:', mode)
  sseEmitter.emit('event', { type: 'narrative_mode', mode, timestamp: new Date().toISOString() })
  res.json({ success: true, mode })
  // Immediately generate narrative with new mode
  if (latest && mode !== 'off') {
    generateNarrativeForMode(latest, dpHistory)
      .then(narrative => {
        if (narrative?.length > 0) {
          lastNarrative = narrative
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
        }
      })
      .catch(err => console.warn('[narrative] immediate generation failed:', err.message))
  }
})

app.post('/settings/symbol', (req, res) => {
  const { symbol } = req.body
  if (!['NQ', 'QQQ'].includes(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol — use NQ|QQQ' })
  }
  if (symbol === activeSymbolPref) {
    return res.json({ success: true, symbol, unchanged: true })
  }
  activeSymbolPref = symbol
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('active_symbol', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(symbol)
  // Clear hash caches so regeneration is not skipped
  lastNarrativeHash        = null
  lastAssistantReadHash    = null
  lastLevelNarrativeHashes = {}
  lastSessionBriefHash     = null
  // Clear content caches so reconnecting clients get empty state, not stale symbol content
  lastNarrative     = []
  lastAssistantRead = null
  lastSessionBrief  = null
  lastTacticalBrief = null
  lastLevelNarratives = {}
  console.log('[settings] symbol:', symbol, '— all caches cleared, triggering narrative regeneration')
  sseEmitter.emit('event', { type: 'symbol_changed', symbol, timestamp: new Date().toISOString() })
  res.json({ success: true, symbol })

  // Regenerate all narratives in background so SSE pushes updated content immediately
  if (!latest) return
  setTimeout(() => {
    generateNarrativeForMode(latest, dpHistory)
      .then(narrative => {
        if (narrative?.length > 0) {
          lastNarrative = narrative
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          console.log('[settings] narrative_update emitted for symbol:', symbol)
        }
      })
      .catch(err => console.warn('[settings] narrative regen failed:', err.message))
    generateSessionBrief(latest)
      .then(briefs => {
        if (briefs?.session) {
          lastSessionBrief  = briefs.session
          lastTacticalBrief = briefs.tactical
          sseEmitter.emit('event', { type: 'session_brief_update', session: briefs.session, tactical: briefs.tactical, timestamp: new Date().toISOString() })
          console.log('[settings] session_brief_update emitted for symbol:', symbol)
        }
      })
      .catch(err => console.warn('[settings] session brief regen failed:', err.message))
    generateAssistantRead(latest)
      .then(read => {
        if (read) {
          lastAssistantRead     = read
          lastAssistantReadHash = null // keep invalidated so next rescore refreshes too
          sseEmitter.emit('event', { type: 'assistant_read_update', assistantRead: read, timestamp: new Date().toISOString() })
          console.log('[settings] assistant_read_update emitted for symbol:', symbol)
        }
      })
      .catch(err => console.warn('[settings] assistant read regen failed:', err.message))
    generateLevelNarratives(latest)
      .then(levelNarratives => {
        if (Object.keys(levelNarratives).length > 0) {
          lastLevelNarratives = levelNarratives
          sseEmitter.emit('event', { type: 'level_narratives_update', narratives: levelNarratives, timestamp: new Date().toISOString() })
          console.log('[settings] level_narratives_update emitted for symbol:', symbol)
        }
      })
      .catch(err => console.warn('[settings] level narrative regen failed:', err.message))
  }, 300)
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
    const { scoredAt } = await scoreNow('manual — dashboard button')   // same canonical path Apply uses
    res.json({ success: true, scoredAt })
  } catch (err) {
    console.error('[server] Manual rescore failed:', err.message)
    res.status(500).json({ error: err.message })
  }
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
        const result = await runScoreWithNq({ trigger: 'webhook_accept', levelsOverride })
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

// GET /dp-history — per-level dark pool history
app.get('/dp-history', (req, res) => {
  res.json({ dpHistory })
})

// GET /price-history — price sparkline data
app.get('/price-history', (req, res) => {
  res.json({ priceHistory })
})

// GET /level-touches — session touch/cross counts
app.get('/level-touches', (req, res) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  try {
    const rows = db.prepare(`
      SELECT level_id,
        COUNT(*) as total_touches,
        SUM(CASE WHEN touch_type='cross' THEN 1 ELSE 0 END) as crosses,
        MIN(touched_at) as first_touch, MAX(touched_at) as last_touch
      FROM level_touches WHERE session_date = ? GROUP BY level_id
    `).all(today)
    const touches = {}
    rows.forEach(r => { touches[r.level_id] = r })
    res.json({ touches, date: today })
  } catch { res.json({ touches: {}, date: today }) }
})

// GET /assistant-read — return structured NOW/NEXT/RISK/IF-WRONG read
app.get('/assistant-read', (req, res) => {
  res.json({ assistantRead: lastAssistantRead, timestamp: new Date().toISOString() })
})

// GET /session-brief — return last session + tactical brief (for reconnect restore)
app.get('/session-brief', (req, res) => {
  res.json({ session: lastSessionBrief, tactical: lastTacticalBrief, timestamp: new Date().toISOString() })
})

// GET /level-narratives — return per-level Claude narratives (for reconnect restore)
app.get('/level-narratives', (req, res) => {
  res.json({ narratives: lastLevelNarratives, timestamp: new Date().toISOString() })
})

// GET /narrative — return last generated narrative (for reconnect restore)
app.get('/narrative', (req, res) => {
  res.json({ narrative: lastNarrative, timestamp: new Date().toISOString() })
})

// ─── LABS: Auto Level Detection ─────────────────────────────────────────────

let labsAutoLevels = { nq: null, lastCalculated: null }
let labsFresh      = true   // false when the last calc aborted (stale feed / no fresh bars)
let labsSettings   = { interval: '5m', activeInterval: '5m', length: 200, mult: 6.0, avgMode: 'daily' }

const YAHOO_INTERVAL_MAP = {
  '1m':  { interval: '1m',  range: '7d'  },
  '5m':  { interval: '5m',  range: '60d' },
  '15m': { interval: '15m', range: '60d' },
  '1h':  { interval: '60m', range: '730d' },
  '1d':  { interval: '1d',  range: '2y'  },
  '1wk': { interval: '1wk', range: '5y'  },
}
const POLYGON_INTERVAL_MAP = {
  '1m':  { multiplier: 1,  timespan: 'minute' },
  '5m':  { multiplier: 5,  timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '1h':  { multiplier: 1,  timespan: 'hour'   },
  '1d':  { multiplier: 1,  timespan: 'day'    },
}
const POLYGON_DAYS_BACK = { '1m': 7, '5m': 60, '15m': 60, '1h': 365, '1d': 730 }

// Polygon futures API uses a different endpoint + resolution param (not multiplier/timespan)
const POLYGON_FUTURES_RESOLUTION = {
  '1m':  '1min',
  '5m':  '5min',
  '15m': '15min',
  '1h':  '1hour',
  '1d':  '1session',
}

// ─── NQ CONTRACT AUTO-DETECTION ──────────────────────────────────────────────

let activeNQContract        = 'NQM6' // overwritten by detectActiveNQContract()
let activeNQContractExpiry  = null
let contractRecalibrating   = false
let contractRolledFrom      = null
let nqContractDaysToExpiry  = null

async function fetchContractDetails(ticker) {
  const POLYGON_KEY = process.env.POLYGON_API_KEY
  if (!POLYGON_KEY) return
  try {
    // Try /contracts/:ticker first, then query-param form if that returns HTML/error
    const urls = [
      `https://api.polygon.io/futures/v1/contracts/${ticker}?apiKey=${POLYGON_KEY}`,
      `https://api.polygon.io/futures/v1/contracts?ticker=${ticker}&apiKey=${POLYGON_KEY}`,
    ]
    let data
    for (const url of urls) {
      const res  = await fetch(url)
      const text = await res.text()
      console.log('[contract] direct fetch:', url.replace(POLYGON_KEY, 'REDACTED'), '→', text.slice(0, 200))
      try { data = JSON.parse(text) } catch { continue }
      if (data?.results) break
    }
    // /contracts/:ticker → results is object; /contracts?ticker= → results is array
    const contract = Array.isArray(data?.results) ? data.results[0] : data?.results
    if (contract?.last_trade_date) {
      const expiry   = contract.last_trade_date
      const daysLeft = Math.max(0, Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24)))
      activeNQContractExpiry = expiry
      nqContractDaysToExpiry = daysLeft
      console.log(`[contract] ${ticker} expires: ${expiry} days: ${daysLeft}`)
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('nq_contract', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
        .run(JSON.stringify({ ticker, expiry, daysLeft, detectedAt: new Date().toISOString() }))
    } else {
      console.warn('[contract] direct fetch: no last_trade_date in response')
    }
  } catch (err) {
    console.warn('[contract] direct fetch failed:', err.message)
  }
}

async function detectActiveNQContract() {
  const POLYGON_KEY = process.env.POLYGON_API_KEY
  if (!POLYGON_KEY) { console.warn('[contract] no POLYGON_API_KEY — keeping', activeNQContract); return }

  // Step 1: update expiry for current contract via direct ticker fetch
  await fetchContractDetails(activeNQContract)

  // Step 2: check for rollover using product_code query, filtered to 0-120 days out
  try {
    const today = new Date().toISOString().split('T')[0]
    const url   = `https://api.polygon.io/futures/v1/contracts?product_code=NQ&active=true&as_of=${today}&limit=10&apiKey=${POLYGON_KEY}`
    console.log('[contract] rollover check:', url.replace(POLYGON_KEY, 'REDACTED'))
    const res  = await fetch(url)
    const text = await res.text()
    console.log('[contract] list response:', text.slice(0, 300))
    const data = JSON.parse(text)
    const now  = new Date()
    const frontMonth = (data.results || [])
      .filter(c => {
        if (!c.last_trade_date) return false
        const daysOut = (new Date(c.last_trade_date) - now) / (1000 * 60 * 60 * 24)
        return daysOut > 0 && daysOut < 120
      })
      .sort((a, b) => new Date(a.last_trade_date) - new Date(b.last_trade_date))[0]
    if (!frontMonth) { console.log('[contract] no rollover candidate found'); return }
    const newTicker = frontMonth.ticker
    if (newTicker === activeNQContract) return  // no rollover
    const expiry   = frontMonth.last_trade_date
    const daysLeft = Math.max(0, Math.ceil((new Date(expiry) - now) / (1000 * 60 * 60 * 24)))
    const prevTicker = activeNQContract
    console.log(`[contract] ROLLOVER: ${prevTicker} → ${newTicker} expires: ${expiry} days: ${daysLeft}`)
    activeNQContract       = newTicker
    activeNQContractExpiry = expiry
    nqContractDaysToExpiry = daysLeft
    contractRolledFrom     = prevTicker
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('nq_contract', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
      .run(JSON.stringify({ ticker: newTicker, expiry, daysLeft, detectedAt: new Date().toISOString() }))
    db.prepare(`DELETE FROM settings WHERE key IN ('labs_pr_avg', 'labs_pr_avg_5m', 'labs_pr_avg_1m')`).run()
    // Drop stale cold-start anchors so the new contract computes fresh ones on first cold-start
    db.prepare(`DELETE FROM settings WHERE key LIKE 'labs_pr_anchor_%'`).run()
    console.log('[contract] PR state + anchors cleared (both timeframes) for new contract convergence')
    contractRecalibrating = true
    sseEmitter.emit('event', {
      type: 'contract_rollover', from: prevTicker, to: newTicker, expiry,
      message: `NQ rolled ${prevTicker}→${newTicker} — recalibrating levels`,
      timestamp: new Date().toISOString(),
    })
    calculateLabsLevels(labsSettings.interval, { reason: 'rollover' }).then(() => {
      contractRecalibrating = false
      sseEmitter.emit('event', {
        type: 'contract_ready', contract: newTicker,
        message: `${newTicker} levels active`, timestamp: new Date().toISOString(),
      })
    }).catch(err => {
      contractRecalibrating = false
      console.warn('[contract] recalibration failed:', err.message)
    })
  } catch (err) {
    console.warn('[contract] rollover check failed:', err.message)
  }
}

// Restore persisted contract on startup
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'nq_contract'`).get()
  if (saved?.value) {
    const data = JSON.parse(saved.value)
    activeNQContract       = data.ticker
    activeNQContractExpiry = data.expiry
    console.log('[contract] restored:', activeNQContract, 'expires:', activeNQContractExpiry)
  }
} catch (e) {}

// Detect on startup (async — fallback value used if API hasn't resolved yet)
detectActiveNQContract()

// If persisted record had no expiry, fetch it directly
if (!activeNQContractExpiry) {
  fetchContractDetails(activeNQContract)
}

// ─── NQ CONTRACT CANDIDATES (fallback math-based) ────────────────────────────
// Returns [frontMonth, nextMonth] contract tickers for NQ (e.g. ['NQM6','NQU6'])
// CME quarterly schedule: Mar=H, Jun=M, Sep=U, Dec=Z — single-digit year required
function getNqFuturesCandidates() {
  const now = new Date()
  const m   = now.getMonth() + 1            // 1–12
  const yr  = now.getFullYear() % 10        // e.g. 2026 → 6
  const nyr = (now.getFullYear() + 1) % 10
  const Q   = [
    { from: 1,  thru: 3,  code: 'H' },
    { from: 4,  thru: 6,  code: 'M' },
    { from: 7,  thru: 9,  code: 'U' },
    { from: 10, thru: 12, code: 'Z' },
  ]
  const ci = Q.findIndex(q => m >= q.from && m <= q.thru)
  const ni = (ci + 1) % 4
  return [
    `NQ${Q[ci].code}${yr}`,
    `NQ${Q[ni].code}${ci === 3 ? nyr : yr}`,
  ]
}

async function fetchFromYahoo(ticker, bars, interval) {
  const yConfig = YAHOO_INTERVAL_MAP[interval] || YAHOO_INTERVAL_MAP['1d']
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${yConfig.interval}&range=${yConfig.range}`
  const res     = await fetch(url)
  const data    = await res.json()
  const result  = data.chart.result[0]
  const quotes  = result.indicators.quote[0]
  const ts      = result.timestamp || []
  const valid   = []
  for (let i = 0; i < quotes.close.length; i++) {
    if (quotes.close[i] && quotes.high[i] && quotes.low[i])
      valid.push({ c: quotes.close[i], h: quotes.high[i], l: quotes.low[i], t: (ts[i] || 0) * 1000 })
  }
  const last = valid.slice(-bars)
  return { closes: last.map(v => v.c), highs: last.map(v => v.h), lows: last.map(v => v.l), times: last.map(v => v.t), source: 'yahoo' }
}

async function fetchFromPolygon(ticker, bars, interval) {
  const POLYGON_KEY = process.env.POLYGON_API_KEY
  if (!POLYGON_KEY) throw new Error('no POLYGON_API_KEY')
  const daysBack = POLYGON_DAYS_BACK[interval] || 730
  const to       = new Date().toISOString().split('T')[0]
  const from     = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const pg       = POLYGON_INTERVAL_MAP[interval] || POLYGON_INTERVAL_MAP['1d']
  const url      = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${pg.multiplier}/${pg.timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_KEY}`
  const res      = await fetch(url)
  const data     = await res.json()
  const count    = data.results?.length ?? 0
  if (count < bars) throw new Error(`only ${count} bars (need ${bars})`)
  const results  = data.results.slice(-bars)
  console.log(`[labs] ${ticker}: source=polygon bars=${count}`)
  return { closes: results.map(r => r.c), highs: results.map(r => r.h), lows: results.map(r => r.l), times: results.map(r => r.t), source: `polygon (${ticker})` }
}

function filterOutlierBars(bars) {
  if (bars.length < 10) return bars
  const trs = []
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close)
    ))
  }
  const sorted = [...trs].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  // 3× median: avg~65 → threshold~195, catches gap bars at 200+ pts
  const threshold = median * 3
  let smoothed = 0
  const result = [bars[0]]
  for (let i = 1; i < bars.length; i++) {
    if (trs[i - 1] > threshold) {
      smoothed++
      // Replace OHLC spike with flat bar at prev close — preserves series length,
      // eliminates gap from ATR, keeps actual close for ratcheting avg
      result.push({ ...bars[i], open: bars[i - 1].close, high: bars[i - 1].close, low: bars[i - 1].close })
    } else {
      result.push(bars[i])
    }
  }
  if (smoothed > 0) console.log(`[labs] smoothed ${smoothed} gap bars (threshold=${threshold.toFixed(0)} pts)`)
  return result
}

async function fetchFromPolygonFutures(bars, interval, opts = {}) {
  const POLYGON_KEY = process.env.POLYGON_API_KEY
  if (!POLYGON_KEY) throw new Error('no POLYGON_API_KEY')
  const resolution = POLYGON_FUTURES_RESOLUTION[interval] || '1session'
  // /futures/v1/aggs honors window_start.gte/.lte (ns) — NOT the stocks-v2 from/to/sort.
  //  • cold-start: anchored at a FIXED per-contract anchor (opts.anchorMs) → deterministic
  //    warmup; ASCENDING + next_url pagination to span anchor→now even past one page.
  //  • advance: window = lastBarTs−1h → now, single newest page.
  const isColdStart = opts.anchorMs != null
  const fetchMode   = isColdStart ? 'cold-start' : (opts.sinceTs ? 'advance' : 'cold-start')
  const nowMs  = Date.now()
  const fromMs = isColdStart ? opts.anchorMs
               : opts.sinceTs ? opts.sinceTs - 60 * 60 * 1000     // advance: lastBarTs − 1h
               : nowMs - 8 * 24 * 60 * 60 * 1000                  // legacy fallback (unanchored)
  // ms → ns as string (ns exceeds Number.MAX_SAFE_INTEGER — never do ms*1e6 as a number)
  const gteNs = `${fromMs}000000`
  const lteNs = `${nowMs}000000`
  const fromIso = new Date(fromMs).toISOString()
  const toIso   = new Date(nowMs).toISOString()
  const sortDir = isColdStart ? 'asc' : 'desc'   // cold-start ascends from the anchor; advance takes newest
  const toMs = t => t > 1e15 ? Math.round(t / 1e6) : t
  const candidates = [activeNQContract, ...getNqFuturesCandidates().filter(t => t !== activeNQContract)]
  for (const fticker of candidates) {
    try {
      let url = `https://api.polygon.io/futures/v1/aggs/${fticker}?resolution=${resolution}&window_start.gte=${gteNs}&window_start.lte=${lteNs}&sort=window_start.${sortDir}&limit=50000&apiKey=${POLYGON_KEY}`
      console.log(`[labs] Polygon URL: ${url.replace(POLYGON_KEY, 'REDACTED')}`)
      // Cold-start follows next_url to the present; advance is a single page.
      const allRows = []
      let pages = 0
      while (url && pages < 50) {
        pages++
        const res  = await fetch(url)
        const data = await res.json()
        if (data.results?.length) allRows.push(...data.results)
        url = (isColdStart && data.next_url)
          ? (data.next_url.includes('apiKey=') ? data.next_url : `${data.next_url}&apiKey=${POLYGON_KEY}`)
          : null
      }
      if (allRows.length === 0) { console.warn(`[labs] Polygon futures ${fticker}: 0 bars in range ${fromIso}→${toIso}`); continue }
      // Sort ascending by timestamp (defensive vs API order). Cold-start keeps the FULL
      // anchor→now span; advance takes the newest `bars`. Gap bars kept (TV ratchets on them).
      const sorted = [...allRows].sort((a, b) => toMs(a.window_start ?? a.t) - toMs(b.window_start ?? b.t))
      const usedBars = isColdStart ? sorted : sorted.slice(-bars)
      console.log(`[labs] fetch mode=${fetchMode} bars=${usedBars.length} pages=${pages} (fetched=${allRows.length}, ${fticker})`)
      const firstBar = usedBars[0]
      const lastBar  = usedBars[usedBars.length - 1]
      const firstTs  = new Date(toMs(firstBar.window_start ?? firstBar.t)).toISOString()
      const lastTs   = new Date(toMs(lastBar.window_start  ?? lastBar.t)).toISOString()
      console.log(`[labs] Polygon ${fticker} sample: first=${firstTs} last=${lastTs} first_close=${firstBar.close} last_close=${lastBar.close}`)
      if (lastBar.close < 20000 || lastBar.close > 50000) {
        console.warn(`[labs] Polygon ${fticker}: price ${lastBar.close} out of NQ range — skipping`)
        continue
      }
      if (usedBars.length >= Math.min(bars, 10)) {
        return { closes: usedBars.map(b => b.close), highs: usedBars.map(b => b.high), lows: usedBars.map(b => b.low), times: usedBars.map(b => toMs(b.window_start ?? b.t)), source: `polygon-futures (${fticker})` }
      }
      console.warn(`[labs] Polygon futures ${fticker}: only ${usedBars.length} usable bars`)
    } catch (err) {
      console.warn(`[labs] Polygon futures ${fticker} failed:`, err.message)
    }
  }
  throw new Error('all NQ futures candidates returned insufficient bars')
}

async function fetchOHLC(ticker, bars = 250, interval = '1d', opts = {}) {
  const isNQ = ticker === 'NQ=F' || ticker === '/NQ' || ticker === 'NQ'

  let result
  if (isNQ) {
    try { result = await fetchFromPolygonFutures(bars, interval, opts) }
    catch (err) { console.warn('[labs] Polygon NQ failed:', err.message, '— falling back to Yahoo') }
    if (!result) result = await fetchFromYahoo('NQ=F', bars, interval)
  } else {
    result = await fetchFromYahoo(ticker, bars, interval)
  }

  // Hard cap — never pass more bars than requested to the recurrence.
  // EXCEPT cold-start (opts.anchorMs): the anchored warmup must span anchor→now intact.
  if (!opts.anchorMs && result?.closes?.length > bars) {
    console.warn(`[labs] fetchOHLC ${ticker}: got ${result.closes.length} bars, slicing to ${bars}`)
    result = {
      closes: result.closes.slice(-bars),
      highs:  result.highs.slice(-bars),
      lows:   result.lows.slice(-bars),
      times:  result.times ? result.times.slice(-bars) : undefined,
      source: result.source,
    }
  }

  console.log(`[labs] fetchOHLC ${ticker}: source=${result?.source} bars=${result?.closes?.length}`)
  return result
}


// ── Faithful LuxAlgo Predictive Ranges, ported with persistable recurrence state ──
// Reference (per CLOSED bar):
//   atr = RMA-ATR(length) * mult
//   close - avg > atr  → avg += atr   (ratchet up)
//   avg - close > atr  → avg -= atr   (ratchet down)
//   else               → hold
//   halfWidth = atr / 2  updates ONLY on ratchet bars, held otherwise
//   levels = avg ± halfWidth, avg ± 2*halfWidth
// State persisted across recalcs: { avg, halfWidth, atrState (running RMA, no mult), lastBarTs }

function trueRange(high, low, prevClose) {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
}

// Cold start — build full recurrence state from a long window of CLOSED bars (RMA warmup).
function initRecurrence(closes, highs, lows, times, length, mult) {
  const n = closes.length
  if (n < 2) return null
  let avg = closes[0]
  let halfWidth = 0
  let atrState = 0
  let lastBarTs = times[0]
  let ratchets = 0
  const seedBuf = []      // first `length` TR values → SMA seed for RMA (matches Pine ta.rma)
  let seeded = false
  for (let i = 1; i < n; i++) {
    const tr = trueRange(highs[i], lows[i], closes[i - 1])
    if (!seeded) {
      seedBuf.push(tr)
      if (seedBuf.length === length) { atrState = seedBuf.reduce((a, b) => a + b, 0) / length; seeded = true }
    } else {
      atrState = (atrState * (length - 1) + tr) / length
    }
    const atr = (seeded ? atrState : 0) * mult
    if (atr > 0) {
      if      (closes[i] - avg > atr) { avg += atr; halfWidth = atr / 2; ratchets++ }
      else if (avg - closes[i] > atr) { avg -= atr; halfWidth = atr / 2; ratchets++ }
    }
    lastBarTs = times[i]
  }
  if (!seeded && seedBuf.length) atrState = seedBuf.reduce((a, b) => a + b, 0) / seedBuf.length
  if (halfWidth === 0) halfWidth = (atrState * mult) / 2   // ensure non-zero bands if no ratchet fired
  if (!avg || isNaN(avg)) return null
  return { avg, halfWidth, atrState, lastBarTs, ratchets, barsProcessed: n - 1 }
}

// Advance saved state over CLOSED bars newer than state.lastBarTs only (no window re-run).
function advanceRecurrence(state, closes, highs, lows, times, length, mult) {
  let { avg, halfWidth, atrState, lastBarTs } = state
  const n = closes.length
  // Find the window index at/just-before lastBarTs (gives prevClose for the first new bar)
  let idx = -1
  for (let i = 0; i < n; i++) {
    if (times[i] <= lastBarTs) idx = i
    else break
  }
  if (idx === -1) return { needsReinit: true }   // saved bar predates window → gap too large
  let ratchets = 0
  let advanced = 0
  const ratchetBars = []
  for (let i = idx + 1; i < n; i++) {
    const tr = trueRange(highs[i], lows[i], closes[i - 1])
    atrState = (atrState * (length - 1) + tr) / length
    const atr = atrState * mult
    let ratcheted = false
    if      (closes[i] - avg > atr) { avg += atr; halfWidth = atr / 2; ratcheted = true }
    else if (avg - closes[i] > atr) { avg -= atr; halfWidth = atr / 2; ratcheted = true }
    if (ratcheted) { ratchets++; ratchetBars.push(times[i]) }
    lastBarTs = times[i]
    advanced++
  }
  return { avg, halfWidth, atrState, lastBarTs, ratchets, ratchetBars, barsAdvanced: advanced }
}

// Build the level object from recurrence state (faithful geometry: spacing = halfWidth).
function levelsFromState(state, mult) {
  const { avg, halfWidth, atrState } = state
  const bandWidth = atrState * mult
  return {
    R2:        parseFloat((avg + 2 * halfWidth).toFixed(2)),
    R1:        parseFloat((avg + halfWidth).toFixed(2)),
    MID:       parseFloat(avg.toFixed(2)),
    S1:        parseFloat((avg - halfWidth).toFixed(2)),
    S2:        parseFloat((avg - 2 * halfWidth).toFixed(2)),
    avg:       parseFloat(avg.toFixed(4)),
    halfWidth: parseFloat(halfWidth.toFixed(4)),
    rawAtr:    parseFloat(atrState.toFixed(4)),   // unscaled running RMA ATR
    bandWidth: parseFloat(bandWidth.toFixed(4)),  // rawAtr × mult (live, for display)
    atr:       parseFloat(bandWidth.toFixed(4)),  // back-compat display field
    holdAtr:   parseFloat(halfWidth.toFixed(4)),
  }
}

function saveNQLevels(nqResult, interval) {
  labsAutoLevels = {
    nq: nqResult,
    lastCalculated: new Date().toISOString(),
    interval, settings: labsSettings
  }
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('labs_auto_levels', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(labsAutoLevels))
  console.log('[labs] levels saved')
  return labsAutoLevels
}

// PR recurrence state is persisted PER TIMEFRAME so timeframes never mix.
// 5m → labs_pr_avg_5m, 1m → labs_pr_avg_1m (any other tf gets its own isolated key).
const prAvgKey = (interval) => 'labs_pr_avg_' + (interval || '5m')

// Cold-start warmup window is anchored at a FIXED per-(contract,timeframe) point so every
// reset/cold-start seeds the path-dependent recurrence from the SAME first bar → identical
// levels. A sliding now−Nd anchor reseeded the path each run (the bug this fixes).
const anchorKey = (contract) => `labs_pr_anchor_${contract}`
function getColdStartAnchor(contract, interval) {
  const key = anchorKey(contract)
  let obj = {}
  try { const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key); if (row?.value) obj = JSON.parse(row.value) } catch (e) {}
  if (obj[interval] != null) return obj[interval]
  // First-ever cold-start for this contract+tf: compute and persist a fixed anchor.
  // 1m: ~10 trading days (≈14 cal). 5m: 60-day floor — deep enough to erase the seed at Factor 6.
  const nowMs = Date.now()
  const anchorMs = interval === '1m'
    ? nowMs - 14 * 24 * 60 * 60 * 1000
    : nowMs - 60 * 24 * 60 * 60 * 1000
  obj[interval] = anchorMs
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(key, JSON.stringify(obj))
  console.log(`[labs] [${interval}] persisted NEW cold-start anchor for ${contract}: ${new Date(anchorMs).toISOString()}`)
  return anchorMs
}

// Approx NQ futures (ETH/Globex) open state in ET. Used only to decide whether a stale
// feed is suspicious — when the market is closed, old last-bars are legitimate.
function isFuturesMarketOpen() {
  const { hour, day } = getETNow()   // day: 0=Sun … 6=Sat
  if (day === 6) return false                 // Saturday — closed
  if (day === 0) return hour >= 18            // Sunday — opens 18:00 ET
  if (day === 5) return hour < 17             // Friday — closes 17:00 ET
  if (hour === 17) return false               // Mon–Thu daily maintenance break 17:00–18:00 ET
  return true
}

// Hard recency guard: during market hours the newest CLOSED bar must be fresh, else the
// feed is stale and we must NOT consume it (returns false → caller aborts without writing).
function barsAreFresh(lastBarTs, interval) {
  if (!isFuturesMarketOpen()) return true     // legitimate gaps when closed
  const ageMin = (Date.now() - lastBarTs) / 60000
  if (ageMin > 30) {
    console.warn(`[labs] [${interval}] STALE BARS: last=${new Date(lastBarTs).toISOString()} (${ageMin.toFixed(0)}min old) — aborting, state NOT written`)
    return false
  }
  return true
}

async function calculateLabsLevels(interval = labsSettings.interval, opts = {}) {
  const INIT_BARS  = 1000
  const LEVEL_BARS = 250
  const stateKey   = prAvgKey(interval)
  const { length, mult, avgMode = 'daily' } = labsSettings
  // Cold-start may run ONLY when there is no usable persisted state. opts.reason
  // labels WHY (reset | rollover); absent → 'no-state' (first run / empty DB).
  const coldStartReason = opts.reason || 'no-state'
  console.log(`[labs] calculating: mode=${avgMode} interval=${interval}`)

  try {
    // ── DAILY PERSISTENT AVG MODE — faithful LuxAlgo PR with persisted recurrence state ──
    const dropForming = arr => (arr && arr.length ? arr.slice(0, -1) : arr)   // drop last (in-progress) bar

    const persistState = (s) => db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(stateKey, JSON.stringify({ avg: s.avg, halfWidth: s.halfWidth, atrState: s.atrState, lastBarTs: s.lastBarTs, savedAt: new Date().toISOString() }))

    const coldStart = async () => {
      // Fixed per-(contract,tf) anchor → deterministic warmup → reproducible levels on reset.
      const anchorMs = getColdStartAnchor(activeNQContract, interval)
      const init = await fetchOHLC('NQ=F', INIT_BARS, interval, { anchorMs })
      if (!init?.times) { console.warn('[labs] init fetch missing timestamps — cannot run recurrence'); return null }
      const closes = dropForming(init.closes), highs = dropForming(init.highs), lows = dropForming(init.lows), times = dropForming(init.times)
      const lastFedTs = times[times.length - 1]
      console.log(`[labs] [${interval}] cold-start anchor=${new Date(anchorMs).toISOString()} bars=${times.length} seed=${closes[0]} (first=${new Date(times[0]).toISOString()} last=${new Date(lastFedTs).toISOString()})`)
      if (!barsAreFresh(lastFedTs, interval)) return null   // stale feed → abort, do not write state
      const s = initRecurrence(closes, highs, lows, times, length, mult)
      if (!s) { console.warn('[labs] initRecurrence returned null'); return null }
      console.log(`[labs] [${interval}] init complete: avg=${s.avg.toFixed(1)} halfWidth=${s.halfWidth.toFixed(1)} rawATR=${s.atrState.toFixed(1)} ratchets=${s.ratchets} bars=${s.barsProcessed}`)
      return { state: s, source: init.source }
    }

    // 1) Load this timeframe's persisted full state (must be new-format with atrState + lastBarTs)
    let state = null
    try {
      const saved = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(stateKey)
      if (saved?.value) {
        const d = JSON.parse(saved.value)
        if (d.atrState != null && d.lastBarTs != null && d.halfWidth != null && d.avg != null) {
          state = { avg: d.avg, halfWidth: d.halfWidth, atrState: d.atrState, lastBarTs: d.lastBarTs }
          console.log(`[labs] [${interval}] loaded PR state: avg=${state.avg.toFixed(1)} halfWidth=${state.halfWidth.toFixed(1)} rawATR=${state.atrState.toFixed(1)} lastBar=${new Date(state.lastBarTs).toISOString()}`)
        } else {
          console.log(`[labs] [${interval}] old-format/partial PR state — cold-start required`)
        }
      }
    } catch (e) {}

    // Load-side validation: state whose anchor is ancient must NOT be advanced — advancing
    // across weeks/months of bars from a stale anchor is never correct. Discard → cold-start.
    if (state) {
      const ageMs = Date.now() - state.lastBarTs
      const MAX_STATE_AGE_MS = 5 * 24 * 60 * 60 * 1000   // ~3 trading days of catch-up headroom
      if (!(state.lastBarTs > 0) || ageMs > MAX_STATE_AGE_MS) {
        console.warn(`[labs] [${interval}] DISCARDING stale state lastBar=${new Date(state.lastBarTs).toISOString()} (${(ageMs / 86400000).toFixed(1)}d old) — cold-starting`)
        db.prepare(`DELETE FROM settings WHERE key = ?`).run(stateKey)
        state = null
      }
    }

    let source
    if (!state) {
      // No usable persisted state for this timeframe → cold-start (first run / reset / rollover only)
      console.log(`[labs] [${interval}] recalc mode=cold-start reason=${coldStartReason}`)
      const cs = await coldStart()
      if (!cs) return null
      state = cs.state; source = cs.source
      persistState(state)
    } else {
      // Advance saved state over ONLY newly-closed bars since lastBarTs — identical
      // to the scheduled cycle. No new closed bar → barsAdvanced=0 → no-op.
      // sinceTs shrinks the Polygon `from` window to just past lastBarTs.
      const nqData = await fetchOHLC('NQ=F', LEVEL_BARS, interval, { sinceTs: state.lastBarTs })
      if (!nqData?.times) { console.warn('[labs] recent fetch missing timestamps — skipping advance'); return null }
      source = nqData.source
      const aCloses = dropForming(nqData.closes), aHighs = dropForming(nqData.highs), aLows = dropForming(nqData.lows), aTimes = dropForming(nqData.times)
      const lastFedTs = aTimes[aTimes.length - 1]
      if (!barsAreFresh(lastFedTs, interval)) return null   // stale feed → abort, keep prior state untouched
      const prevAvg = state.avg
      const adv = advanceRecurrence(state, aCloses, aHighs, aLows, aTimes, length, mult)
      if (adv.needsReinit) {
        // Saved bar predates the window — only safe recovery is a re-init
        console.log(`[labs] [${interval}] recalc mode=cold-start reason=gap-too-large`)
        console.warn('[labs] saved bar predates window — re-initializing from long window')
        const cs = await coldStart()
        if (!cs) return null
        state = cs.state; source = cs.source
      } else {
        state = { avg: adv.avg, halfWidth: adv.halfWidth, atrState: adv.atrState, lastBarTs: adv.lastBarTs }
        console.log(`[labs] [${interval}] avg ${prevAvg.toFixed(1)} → ${state.avg.toFixed(1)}, ratcheted=${adv.ratchets > 0}, halfWidth=${state.halfWidth.toFixed(1)}, mode=advance barsAdvanced=${adv.barsAdvanced}`)
        if (adv.ratchetBars?.length) {
          console.log(`[labs] [${interval}] ratchet bars: ` + adv.ratchetBars.map(ts => new Date(ts).toISOString()).join(', '))
        }
      }
      persistState(state)
    }

    const nqResult = levelsFromState(state, mult)
    console.log(`[labs] [${interval}] NQ:`, `MID=${nqResult.MID.toFixed(1)}`, `R1=${nqResult.R1.toFixed(1)}`, `S1=${nqResult.S1.toFixed(1)}`, `rawATR=${nqResult.rawAtr.toFixed(1)}`, `halfWidth=${nqResult.halfWidth.toFixed(1)}`)
    return saveNQLevels({ ...nqResult, source, interval }, interval)
  } catch (err) {
    console.error('[labs] calculation failed:', err.message)
    return null
  }
}

// Restore settings + levels from SQLite on startup
try {
  const savedSettings = db.prepare(`SELECT value FROM settings WHERE key = 'labs_settings'`).get()
  if (savedSettings?.value) {
    labsSettings = { ...labsSettings, ...JSON.parse(savedSettings.value) }
    // Weekly avg mode was removed — coerce any stale persisted value so it can't route
    // into a deleted branch. (avgMode kept as a vestigial always-'daily' field.)
    if (labsSettings.avgMode && labsSettings.avgMode !== 'daily') {
      console.log(`[labs] avgMode '${labsSettings.avgMode}' no longer supported → daily`)
      labsSettings.avgMode = 'daily'
    }
    console.log('[labs] settings restored:', JSON.stringify(labsSettings))
  }
} catch (e) {}
// Migrate legacy single-key PR state → per-timeframe 5m key (preserve converged state)
try {
  const legacy = db.prepare(`SELECT value FROM settings WHERE key = 'labs_pr_avg'`).get()
  if (legacy?.value) {
    const has5m = db.prepare(`SELECT 1 FROM settings WHERE key = 'labs_pr_avg_5m'`).get()
    if (!has5m) {
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('labs_pr_avg_5m', ?, datetime('now'))`).run(legacy.value)
      console.log('[labs] migrated labs_pr_avg → labs_pr_avg_5m (converged 5m state preserved)')
    }
    db.prepare(`DELETE FROM settings WHERE key = 'labs_pr_avg'`).run()
  }
} catch (e) {}
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'labs_auto_levels'`).get()
  if (saved?.value) {
    labsAutoLevels = JSON.parse(saved.value)
    console.log('[labs] levels restored from DB')
  }
} catch (e) {}
try {
  const saved = db.prepare(`SELECT value FROM settings WHERE key = 'session_ratio'`).get()
  if (saved?.value) {
    const data  = JSON.parse(saved.value)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    // Always restore — 9:30 AM cron will replace with fresh value automatically
    sessionRatio         = data.ratio
    sessionRatioLockedAt = data.lockedAt
    sessionRatioDate     = data.date
    const isToday = data.date === today
    console.log('[ratio] restored:', sessionRatio, isToday ? '(today)' : '(yesterday)')
  }
} catch (e) {}

const nqRound = v => Math.round(v * 4) / 4

// Returns session-locked ratio if available, otherwise falls back to live
function getActiveRatio() {
  return sessionRatio || nqOffsets.ratio || latest?.nq_ratio || getNqRatioFromDb(db) || 41.14
}

// Live NQ/QQQ ratio from the latest score, only if FRESH (≤30 min). null → defer the lock.
function getFreshLiveRatio() {
  const r = latest?.nq_ratio
  if (!r || r <= 0) return null
  const ts = latest?._received_at ? Date.parse(latest._received_at) : 0
  if (!ts || (Date.now() - ts) > 30 * 60 * 1000) return null
  return parseFloat(r.toFixed(4))
}

// Rewrite ONLY the stored QQQ columns from the canonical rounded NQ ÷ ratio. NQ stays the
// source of truth (untouched). Pure derivation rewrite — independent of level source mode,
// systemPaused, and market hours (it is not a data fetch). Returns true if a row was rewritten.
function rewriteQqqFromRatio(ratio) {
  if (!ratio || ratio <= 0) return false
  const today = getTodayET()
  const row = db.prepare(`SELECT r2_nq, r1_nq, mid_nq, s1_nq, s2_nq FROM daily_levels WHERE date = ?`).get(today)
  if (!row) return false
  const q = (nq) => nq != null ? parseFloat((nq / ratio).toFixed(2)) : null
  db.prepare(`
    UPDATE daily_levels
       SET r2_qqq = ?, r1_qqq = ?, mid_qqq = ?, s1_qqq = ?, s2_qqq = ?, nq_ratio = ?, updated_at = datetime('now')
     WHERE date = ?
  `).run(q(row.r2_nq), q(row.r1_nq), q(row.mid_nq), q(row.s1_nq), q(row.s2_nq), ratio, today)
  console.log(`[ratio] daily_levels QQQ rewritten from NQ ÷ ${ratio} (MID_nq=${row.mid_nq} → MID_qqq=${q(row.mid_nq)})`)
  return true
}

// Shared post-lock refresh — IDENTICAL behavior for scheduled, catch-up, and manual locks
// (one definition, three call sites, so they can't drift apart). Assumes sessionRatio /
// sessionRatioLockedAt / sessionRatioDate are already set + persisted by the caller.
async function onRatioLocked(trigger) {
  // Defensive — the ratio is already persisted by the caller; this refresh must never
  // reject (it's awaited by the manual endpoint without its own try/catch).
  try {
    // 1) Recompute stored QQQ from canonical NQ ÷ new ratio (gate-free)
    const rewrote = rewriteQqqFromRatio(sessionRatio)
    // 2) Stamp Labs display + notify the UI of the new ratio (frontend recomputes QQQ Equiv live)
    labsAutoLevels = { ...labsAutoLevels, appliedAt: new Date().toISOString() }
    sseEmitter.emit('event', { type: 'ratio_locked', ratio: sessionRatio, lockedAt: sessionRatioLockedAt, timestamp: new Date().toISOString() })
    sseEmitter.emit('event', { type: 'labs_levels_update', levels: labsAutoLevels, timestamp: new Date().toISOString() })
    // 3) Rescore so scored levels + QQQ-denominated narratives reflect the new QQQ columns
    if (runFullScore) {
      try { await scoreNow(`ratio_lock:${trigger}`) }
      catch (err) { console.error(`[ratio] post-lock rescore failed (${trigger}):`, err.message) }
    }
    console.log(`[ratio] post-lock refresh (${trigger}) — qqq rewritten=${rewrote}`)
  } catch (err) {
    console.error(`[ratio] post-lock refresh failed (${trigger}):`, err.message)
  }
}

// ── Level Rounding Policy ───────────────────────────────────────────────────────
// Applied/scored NQ levels are rounded to WHOLE points at APPLY TIME ONLY — never the
// recurrence state. The persisted {avg, halfWidth, atrState} stays full precision;
// rounding the path-dependent state would compound and diverge from TradingView.
// To change granularity (e.g. quarter-tick), change ONLY roundLevel() — nothing else in
// the pipeline assumes whole points; it takes effect on the next apply, no state reset.
const LEVEL_ROUNDING = 'whole'
function roundLevel(x) {
  return Math.round(x)            // LEVEL_ROUNDING='whole'. Quarter-tick: Math.round(x * 4) / 4.
}
// Canonical applied levels: round each NQ level, then derive QQQ from the ROUNDED NQ
// (rounded NQ ÷ ratio) so NQ and its QQQ equivalent stay consistent everywhere.
function roundAppliedLevels(nqRaw, ratio) {
  const out = {}
  for (const k of ['r2', 'r1', 'mid', 's1', 's2']) {
    const nq = roundLevel(nqRaw[`${k}_nq`])
    out[`${k}_nq`]  = nq
    out[`${k}_qqq`] = parseFloat((nq / ratio).toFixed(2))
  }
  return out
}

// Wraps runFullScore and attaches the CANONICAL stored NQ price (daily_levels) to each
// scored level by id, so every tab can show the same whole-point value instead of
// reconstructing NQ from QQQ × ratio (which drifts by a tick).
async function runScoreWithNq(opts) {
  const result = await runFullScore(opts)
  if (result?.levels?.length) {
    const today = getTodayET()
    const row = db.prepare(`SELECT * FROM daily_levels WHERE date = ?`).get(today)
            || db.prepare(`SELECT * FROM daily_levels ORDER BY date DESC LIMIT 1`).get()
    if (row) {
      for (const lv of result.levels) {
        const id = String(lv.id || lv.level_id || '').toLowerCase()
        if (row[`${id}_nq`] != null) lv.nq_price = row[`${id}_nq`]
      }
    }
  }
  return result
}

// Apply auto levels to daily_levels + trigger rescore when mode is auto_nq
async function applyAutoLevelsIfEnabled() {
  if (systemPaused) return
  if (levelSourceMode === 'manual') return
  const nq = labsAutoLevels?.nq
  if (!nq) { console.log('[levels] no auto levels yet'); return }

  const ratio = getActiveRatio()
  // Canonical applied levels = rounded NQ, QQQ derived from rounded NQ (apply-time only).
  const levelData = roundAppliedLevels(
    { r2_nq: nq.R2, r1_nq: nq.R1, mid_nq: nq.MID, s1_nq: nq.S1, s2_nq: nq.S2 },
    ratio
  )

  // Skip write + rescore if levels haven't meaningfully changed. Both sides are rounded,
  // so the ≤0.5 rounding (≤1pt NQ, ≤~0.02 QQQ) is far below the 20pt / 0.50 thresholds —
  // it cannot flap the guard at the boundary.
  const today    = getTodayET()
  const existing = db.prepare(`SELECT mid_nq, mid_qqq FROM daily_levels WHERE date = ?`).get(today)
  const nqChanged  = !existing || Math.abs((existing.mid_nq  || 0) - levelData.mid_nq)  > 20
  const qqqChanged = !existing || Math.abs((existing.mid_qqq || 0) - levelData.mid_qqq) > 0.50
  const changed = nqChanged || qqqChanged
  if (!changed) return

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
  `).run(today,
    levelData.r2_nq, levelData.r2_qqq,
    levelData.r1_nq, levelData.r1_qqq,
    levelData.mid_nq, levelData.mid_qqq,
    levelData.s1_nq, levelData.s1_qqq,
    levelData.s2_nq, levelData.s2_qqq,
    ratio
  )
  console.log(`[levels] auto-applied (rounded): mode=${levelSourceMode} MID_nq=${levelData.mid_nq} R1_qqq=${levelData.r1_qqq}`)

  // Do NOT overwrite labsAutoLevels.nq — the Labs "NQ Native" column must keep the RAW
  // recurrence values for TradingView comparison. Active (rounded) is read from daily_levels;
  // Δ = raw vs rounded (a resting ±0.5 is expected). Just stamp appliedAt + notify.
  labsAutoLevels = { ...labsAutoLevels, appliedAt: new Date().toISOString() }
  sseEmitter.emit('event', { type: 'labs_levels_update', levels: labsAutoLevels, timestamp: new Date().toISOString() })

  sseEmitter.emit('event', {
    type: 'levels_auto_updated', mode: levelSourceMode,
    levelData, timestamp: new Date().toISOString(),
  })

  // Trigger rescore with the freshly-saved levels (only if auto-score enabled)
  if (autoScoreEnabled && runFullScore) {
    setTimeout(async () => {
      try {
        const levelsForScoring = getLevelsForScoring(db)
        if (!levelsForScoring) return
        const result = await runScoreWithNq({ trigger: 'auto_level_update', levelsOverride: levelsForScoring })
        result._received_at = new Date().toISOString()
        const savedRatio = getNqRatioFromDb(db)
        if (savedRatio) result.nq_ratio = savedRatio
        latest = result
        history.unshift(result)
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
        provider.setLevels(result.levels)
        checkExpansionGex(result)
        updateDpHistory(result)
        const sentiment = computeSentiment(result)
        result._sentiment = sentiment
        sseEmitter.emit('event', {
          type: 'rescore', result, trigger: 'auto_level_update',
          price: result.current_price, expansionGex: detectExpansionGex(result),
          dpHistory: { ...dpHistory }, sentiment, timestamp: new Date().toISOString(),
        })
      } catch (err) {
        console.error('[levels] auto rescore failed:', err.message)
      }
    }, 1000)
  }
}

// Shared rescore helper — runs scoring, updates latest, emits SSE
// Used by startup, manual-nq save, and Score Now button
async function runAutoRescore(trigger = 'manual') {
  if (!runFullScore) { console.log(`[rescore] scorer unavailable (${trigger})`); return }
  if (systemPaused)  { console.log(`[rescore] skipped — system paused (${trigger})`); return }
  const levels = getLevelsForScoring(db)
  if (!levels) { console.log('[rescore] no levels in DB — enter levels first'); return }
  console.log(`[rescore] running (trigger=${trigger})`)
  try {
    const result = await runScoreWithNq({ trigger, levelsOverride: levels })
    result._received_at = new Date().toISOString()
    const ratio = getNqRatioFromDb(db)
    if (ratio) result.nq_ratio = ratio
    latest = result
    history.unshift(result)
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
    provider.setLevels(result.levels)
    emitStaleIfChanged(result)
    checkExpansionGex(result)
    updateDpHistory(result)
    if (result.current_price) trackLevelTouches(result.current_price, result.levels, db)
    const sentiment = computeSentiment(result)
    result._sentiment = sentiment
    sseEmitter.emit('event', {
      type: 'rescore', result, trigger,
      price: result.current_price, expansionGex: detectExpansionGex(result),
      dpHistory: { ...dpHistory }, sentiment, timestamp: new Date().toISOString(),
    })
    console.log(`[rescore] complete (${trigger}) — ${result.levels.length} levels`)
  } catch (err) {
    console.error(`[rescore] failed (${trigger}):`, err.message)
  }
}

// Canonical FULL rescore — the exact path the "Score Now" button uses. Scores the
// currently-active DB levels, updates latest/history/provider, emits 'rescore' SSE, then
// regenerates narrative / level-narratives / session-brief / assistant-read in background.
// Returns { result, scoredAt } once scoring + the rescore SSE are done (narratives lag).
async function scoreNow(trigger) {
  const result = await runScoreWithNq({ trigger, levelsOverride: getLevelsForScoring(db) })
  result._received_at = new Date().toISOString()
  const ratio = getNqRatioFromDb(db)
  if (ratio) result.nq_ratio = ratio
  latest = result
  history.unshift(result)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  provider.setLevels(result.levels)
  checkExpansionGex(result)
  updateDpHistory(result)
  if (result.current_price) trackLevelTouches(result.current_price, result.levels, db)
  const sentiment = computeSentiment(result)
  result._sentiment = sentiment
  const scoredAt = new Date().toISOString()
  sseEmitter.emit('event', {
    type: 'rescore', result, trigger,
    price: result.current_price, expansionGex: detectExpansionGex(result),
    dpHistory: { ...dpHistory }, sentiment, timestamp: scoredAt,
  })
  // Background narrative regeneration (slow) — identical set to the /rescore path
  generateNarrativeForMode(result, dpHistory)
    .then(narrative => { if (narrative?.length > 0) { lastNarrative = narrative; sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() }) } })
    .catch(err => console.warn('[narrative] async failed:', err.message))
  generateLevelNarratives(result)
    .then(ln => { if (Object.keys(ln).length > 0) { lastLevelNarratives = ln; sseEmitter.emit('event', { type: 'level_narratives_update', narratives: ln, timestamp: new Date().toISOString() }) } })
    .catch(err => console.warn('[level-narrative] failed:', err.message))
  generateSessionBrief(result)
    .then(briefs => { if (briefs?.session) sseEmitter.emit('event', { type: 'session_brief_update', session: briefs.session, tactical: briefs.tactical, timestamp: new Date().toISOString() }) })
    .catch(err => console.warn('[session-brief] failed:', err.message))
  generateAssistantRead(result)
    .then(read => { if (read) { lastAssistantRead = read; sseEmitter.emit('event', { type: 'assistant_read_update', assistantRead: read, timestamp: new Date().toISOString() }) } })
    .catch(err => console.warn('[assistant] failed:', err.message))
  return { result, scoredAt }
}

// Calculate fresh on startup (async, non-blocking)
// After levels are applied, trigger an initial rescore so all tabs populate immediately
calculateLabsLevels(labsSettings.activeInterval)
  .then(() => applyAutoLevelsIfEnabled())
  .then(() => setTimeout(() => runAutoRescore('startup'), 4000))

// ─── SCHEDULER HELPERS ───────────────────────────────────────────────────────

function levelsChanged(oldLevels, newLevels) {
  if (!oldLevels || !newLevels) return false
  return oldLevels.MID !== newLevels.MID ||
         oldLevels.R1  !== newLevels.R1  ||
         oldLevels.S1  !== newLevels.S1
}

function handleLabsUpdate(result) {
  labsFresh = !!result   // a null result means the calc aborted (stale feed / no fresh bars)
  if (!result) {
    sseEmitter.emit('event', { type: 'labs_no_fresh_data', activeInterval: labsSettings.activeInterval, timestamp: new Date().toISOString() })
    return
  }
  const old = labsAutoLevels?.nq
  if (levelsChanged(old, result?.nq)) {
    console.log('[labs] ⚡ levels shifted')
    sseEmitter.emit('event', { type: 'labs_levels_changed', levels: result, changedAt: new Date().toISOString() })
  } else {
    sseEmitter.emit('event', { type: 'labs_levels_update', levels: result, timestamp: new Date().toISOString() })
  }
  applyAutoLevelsIfEnabled()
}

function getETNow() {
  const d = new Date()
  const e = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  return {
    hour: e.getHours(),
    min:  e.getMinutes(),
    day:  e.getDay(),
    date: d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  }
}

// Minute-tick scheduler — replaces node-cron, no external package required
let _contractCheckedToday = false
let _lastScheduledMinute  = -1
let _ratioDeferDate       = null   // ET date we last logged a deferred ratio lock (throttle)

setInterval(() => {
  const { hour, min, day, date } = getETNow()
  if (day < 1 || day > 5) return  // skip weekends

  const currentMinute = hour * 60 + min

  // Reset daily flags at midnight ET (ratio lock no longer uses a flag — it is date-aware)
  if (hour === 0 && min === 0 && _lastScheduledMinute !== 0) {
    _lastScheduledMinute  = 0
    _contractCheckedToday = false
    console.log('[cron] midnight — daily flags reset')
  }

  // 6:00 AM: NQ contract detection
  if (hour === 6 && min === 0 && !_contractCheckedToday) {
    _contractCheckedToday = true
    console.log('[contract] daily check...')
    detectActiveNQContract()
  }

  // Daily ratio lock — DATE-AWARE with CATCH-UP, evaluated every tick during the session.
  // Locks once per ET day at/after 9:30. A missed 9:30 tick, a restart after 9:30, or a
  // price hiccup self-heals on a later tick instead of failing for the day. The guard is
  // the persisted lock's ET date (sessionRatioDate) — never an in-memory "done" flag.
  if (currentMinute >= 9 * 60 + 30 && currentMinute < 16 * 60) {
    if (sessionRatioDate !== date) {                      // no lock yet for today (ET)
      const liveRatio = getFreshLiveRatio()
      if (liveRatio) {
        const mode = currentMinute <= 9 * 60 + 35 ? 'scheduled' : 'catch-up'
        sessionRatio         = liveRatio
        sessionRatioLockedAt = new Date().toLocaleTimeString('en-US', {
          timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        sessionRatioDate = date
        db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('session_ratio', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `).run(JSON.stringify({ ratio: sessionRatio, lockedAt: sessionRatioLockedAt, date }))
        console.log(`[ratio] LOCKED ${sessionRatio} at ${sessionRatioLockedAt} (${mode})`)
        // Shared post-lock refresh (QQQ rewrite + SSE + rescore) — same as the manual path
        onRatioLocked(mode).catch(err => console.error('[ratio] post-lock failed:', err.message))
      } else if (_ratioDeferDate !== date) {
        _ratioDeferDate = date
        console.warn('[ratio] lock deferred: prices unavailable — will retry on later ticks')
      }
    }
  }

  // Intraday labs recalc: 9:00–16:00 ET
  if (hour >= 9 && hour < 16) {
    const intervalMin = labsSettings.activeInterval === '1m' ? 1
                      : labsSettings.activeInterval === '15m' ? 15 : 5
    if (currentMinute % intervalMin === 0 && currentMinute !== _lastScheduledMinute) {
      _lastScheduledMinute = currentMinute
      if (!systemPaused) calculateLabsLevels(labsSettings.activeInterval).then(handleLabsUpdate)
    }
  }

  // 4:35 PM: end-of-day recalc
  if (hour === 16 && min === 35 && _lastScheduledMinute !== 16 * 60 + 35) {
    _lastScheduledMinute = 16 * 60 + 35
    console.log('[labs] end of day recalc')
    calculateLabsLevels(labsSettings.activeInterval).then(handleLabsUpdate)
  }

}, 60 * 1000)

console.log('[cron] minute-tick scheduler started')

// ─── LABS ENDPOINTS ──────────────────────────────────────────────────────────

app.get('/labs/auto-levels', (req, res) => {
  // activeInterval is the single source of truth for the active feed; surface it so the
  // UI toggle never reads the preview `interval` field. labsFresh=false → no fresh data.
  res.json({ ...labsAutoLevels, activeInterval: labsSettings.activeInterval, fresh: labsFresh, timestamp: new Date().toISOString() })
})

app.get('/labs/scoring-latest', (req, res) => {
  res.json({ levels: latest?.levels ?? null, timestamp: new Date().toISOString() })
})

app.post('/labs/recalculate', async (req, res) => {
  // Always runs the ACTIVE timeframe (never the preview `interval`). Advances persisted
  // state over newly closed bars only; never cold-starts. Abort (stale feed) → status.
  const result = await calculateLabsLevels(labsSettings.activeInterval)
  handleLabsUpdate(result)
  res.json({
    success: true,
    activeInterval: labsSettings.activeInterval,
    status: result ? 'ok' : 'no_fresh_data',
    levels: result ? labsAutoLevels : null,
  })
})

app.post('/labs/settings', async (req, res) => {
  const { interval, length, mult, avgMode } = req.body
  const validIntervals = ['1m', '5m', '15m', '1h', '1d']
  if (interval && !validIntervals.includes(interval))
    return res.status(400).json({ error: 'Invalid interval' })

  // Detect a real length/mult change BEFORE mutating — the recurrence depends on these,
  // so any change invalidates ALL persisted state and requires a cold-start.
  const newLength = length != null ? parseInt(length)   : labsSettings.length
  const newMult   = mult   != null ? parseFloat(mult)   : labsSettings.mult
  const paramsChanged = newLength !== labsSettings.length || newMult !== labsSettings.mult

  if (interval) labsSettings.interval = interval  // preview only — does NOT affect active cron
  labsSettings.length = newLength
  labsSettings.mult   = newMult
  // Weekly avg mode was removed — only 'daily' is supported; ignore/coerce anything else.
  if (avgMode && avgMode !== 'daily') console.log(`[labs] avgMode '${avgMode}' no longer supported → daily`)
  labsSettings.avgMode = 'daily'
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('labs_settings', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(labsSettings))

  if (paramsChanged) {
    // All stored recurrence state was built under the old params — wipe every timeframe
    // and cold-start the active one now (the inactive tf cold-starts on next switch).
    db.prepare(`DELETE FROM settings WHERE key LIKE 'labs_pr_avg%'`).run()
    const tf = labsSettings.activeInterval
    console.log(`[labs] params changed length=${newLength} mult=${newMult} → state reset, cold-start ${tf}`)
    const result = await calculateLabsLevels(tf, { reason: 'params' })
    handleLabsUpdate(result)
  } else {
    console.log('[labs] settings updated (no param change):', JSON.stringify(labsSettings))
    await calculateLabsLevels(interval || labsSettings.activeInterval)
    // No auto-apply here — interval preview change does not push to active levels
  }
  res.json({ success: true, settings: labsSettings, levels: labsAutoLevels })
})

// Authoritative Predictive-Ranges timeframe toggle (5m / 1m). Switching loads that
// timeframe's persisted recurrence state (cold-starts if none) — the two never mix.
app.post('/labs/active-interval', async (req, res) => {
  const { interval } = req.body
  const valid = ['1m', '5m']
  if (!valid.includes(interval)) return res.status(400).json({ error: 'Invalid timeframe (1m or 5m)' })
  labsSettings.activeInterval = interval
  labsSettings.interval       = interval   // keep display field in sync with the active feed
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('labs_settings', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(labsSettings))
  console.log(`[labs] active timeframe → ${interval}`)
  // Selection is already persisted above — it STICKS even if the calc below aborts.
  // Load (or cold-start) the target timeframe's state. Switching back to a converged
  // timeframe restores its untouched state (advance only). Abort (stale feed) → status.
  const result = await calculateLabsLevels(interval)
  handleLabsUpdate(result)
  res.json({
    success: true,
    activeInterval: interval,
    status: result ? 'ok' : 'no_fresh_data',
    levels: result ? labsAutoLevels : null,
  })
})

app.post('/labs/reset-avg', async (req, res) => {
  const activeTf = labsSettings.activeInterval
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(prAvgKey(activeTf))
  console.log(`[labs] PR state reset (${activeTf} only) — running fresh cold-start init`)
  res.json({ success: true })
  // Re-initialize ONLY the active timeframe; the other timeframe's state is untouched
  try {
    const result = await calculateLabsLevels(activeTf, { reason: 'reset' })
    handleLabsUpdate(result)
  } catch (err) {
    console.warn('[labs] reset re-init failed:', err.message)
  }
})

app.post('/labs/apply-to-main', async (req, res) => {
  const { source } = req.body
  const levels = labsAutoLevels[source]
  if (!levels) return res.status(400).json({ error: `No ${source} levels available` })

  const ratio = latest?.nq_ratio || getNqRatioFromDb(db) || 41.14

  // Canonical applied levels via the single rounding policy (round NQ, derive QQQ from
  // rounded NQ). NQ source uses the raw recurrence values; qqq source derives raw NQ first.
  const rawNq = source === 'qqq'
    ? { r2_nq: levels.R2 * ratio, r1_nq: levels.R1 * ratio, mid_nq: levels.MID * ratio, s1_nq: levels.S1 * ratio, s2_nq: levels.S2 * ratio }
    : { r2_nq: levels.R2, r1_nq: levels.R1, mid_nq: levels.MID, s1_nq: levels.S1, s2_nq: levels.S2 }
  const levelData = roundAppliedLevels(rawNq, ratio)

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  db.prepare(`
    INSERT INTO daily_levels (date, r2_nq, r2_qqq, r1_nq, r1_qqq, mid_nq, mid_qqq, s1_nq, s1_qqq, s2_nq, s2_qqq, nq_ratio, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      r2_nq=excluded.r2_nq, r2_qqq=excluded.r2_qqq,
      r1_nq=excluded.r1_nq, r1_qqq=excluded.r1_qqq,
      mid_nq=excluded.mid_nq, mid_qqq=excluded.mid_qqq,
      s1_nq=excluded.s1_nq, s1_qqq=excluded.s1_qqq,
      s2_nq=excluded.s2_nq, s2_qqq=excluded.s2_qqq,
      nq_ratio=excluded.nq_ratio, updated_at=datetime('now')
  `).run(today, levelData.r2_nq, levelData.r2_qqq, levelData.r1_nq, levelData.r1_qqq, levelData.mid_nq, levelData.mid_qqq, levelData.s1_nq, levelData.s1_qqq, levelData.s2_nq, levelData.s2_qqq, ratio)

  const appliedAt = new Date().toISOString()
  console.log(`[labs] levels applied to main: ${source} R1_qqq=${levelData.r1_qqq}`)

  // Sync labsAutoLevels to EXACTLY what was applied (derived QQQ + appliedAt) so the Labs
  // panel and all tabs reflect the same numbers; emit so displays refresh immediately.
  labsAutoLevels = {
    ...labsAutoLevels,
    qqq: { R2: levelData.r2_qqq, R1: levelData.r1_qqq, MID: levelData.mid_qqq, S1: levelData.s1_qqq, S2: levelData.s2_qqq },
    appliedAt,
  }
  sseEmitter.emit('event', { type: 'labs_levels_update', levels: labsAutoLevels, timestamp: appliedAt })

  // ATOMIC: run the SAME full rescore the Score Now button uses (incl. narratives),
  // awaited, so the response confirms scoring completed. No separate Score Now needed.
  let scoredAt = null
  if (runFullScore) {
    try { ({ scoredAt } = await scoreNow('labs_apply')) }
    catch (err) { console.error('[labs] apply rescore failed:', err.message) }
  }
  res.json({ success: true, appliedAt, scoredAt, levelData })
})

app.post('/scoring/auto-score', (req, res) => {
  const { enabled } = req.body
  autoScoreEnabled = !!enabled
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('auto_score_enabled', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(String(autoScoreEnabled))
  console.log('[scoring] auto-score:', autoScoreEnabled)
  sseEmitter.emit('event', { type: 'auto_score_changed', enabled: autoScoreEnabled, timestamp: new Date().toISOString() })
  res.json({ success: true, autoScoreEnabled })
})

app.post('/levels/manual-nq', (req, res) => {
  const { R2_nq, R1_nq, MID_nq, S1_nq, S2_nq, R2_qqq, R1_qqq, MID_qqq, S1_qqq, S2_qqq, ratio, source } = req.body
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  db.prepare(`
    INSERT INTO daily_levels (date, R2_qqq, R1_qqq, MID_qqq, S1_qqq, S2_qqq, R2_nq, R1_nq, MID_nq, S1_nq, S2_nq, nq_ratio, source, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      R2_qqq=excluded.R2_qqq, R1_qqq=excluded.R1_qqq, MID_qqq=excluded.MID_qqq, S1_qqq=excluded.S1_qqq, S2_qqq=excluded.S2_qqq,
      R2_nq=excluded.R2_nq,   R1_nq=excluded.R1_nq,   MID_nq=excluded.MID_nq,   S1_nq=excluded.S1_nq,   S2_nq=excluded.S2_nq,
      nq_ratio=excluded.nq_ratio, source=excluded.source, updated_at=datetime('now')
  `).run(today, R2_qqq, R1_qqq, MID_qqq, S1_qqq, S2_qqq, R2_nq, R1_nq, MID_nq, S1_nq, S2_nq, ratio, source || 'manual_nq')
  console.log('[levels] manual NQ saved:', `MID_nq=${MID_nq}`, `MID_qqq=${MID_qqq}`, `ratio=${ratio}`)
  runAutoRescore('manual_nq_save')
  res.json({ success: true })
})

app.post('/levels/source-mode', async (req, res) => {
  const { mode } = req.body
  const valid = ['auto_nq', 'manual', 'manual_nq']
  if (!valid.includes(mode)) return res.status(400).json({ error: 'Invalid mode' })

  levelSourceMode = mode
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('level_source_mode', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(mode)
  console.log('[levels] source mode set:', mode)

  if (mode !== 'manual') await applyAutoLevelsIfEnabled()

  sseEmitter.emit('event', { type: 'level_source_mode_changed', mode, timestamp: new Date().toISOString() })
  res.json({ success: true, mode })
})

app.post('/ratio/lock', async (req, res) => {
  const { ratio } = req.body
  if (!ratio || isNaN(parseFloat(ratio))) return res.status(400).json({ error: 'Invalid ratio' })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })  // ET date
  const now   = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit'
  })
  sessionRatio         = parseFloat(parseFloat(ratio).toFixed(4))
  sessionRatioLockedAt = `${now} (manual)`
  sessionRatioDate     = today   // counts as today's lock — scheduler catch-up won't overwrite
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('session_ratio', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify({ ratio: sessionRatio, lockedAt: sessionRatioLockedAt, date: today }))
  console.log('[ratio] MANUALLY locked:', sessionRatio)
  // Same shared post-lock refresh as the scheduled/catch-up paths (QQQ rewrite + SSE +
  // rescore). Runs regardless of market hours / pause — it's a derivation rewrite.
  await onRatioLocked('manual')
  res.json({ success: true, ratio: sessionRatio, lockedAt: sessionRatioLockedAt })
})

app.post('/levels/nq-offsets', async (req, res) => {
  const { ratio, offsets } = req.body
  if (ratio !== undefined) nqOffsets.ratio = ratio ? parseFloat(ratio) : null
  if (offsets) {
    ;['R2', 'R1', 'MID', 'S1', 'S2'].forEach(id => {
      if (offsets[id] !== undefined) nqOffsets[id] = parseInt(offsets[id]) || 0
    })
  }
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('nq_offsets', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(nqOffsets))
  console.log('[levels] NQ offsets updated:', nqOffsets)
  if (levelSourceMode !== 'manual') await applyAutoLevelsIfEnabled()
  res.json({ success: true, offsets: nqOffsets })
})

// ─── TRADE ENDPOINTS ─────────────────────────────────────────────────────────

app.post('/trade/enter', (req, res) => {
  const { direction, entry, target, stop, instrument, contracts, entryLevel, targetLevel, symbol, priceUnit } = req.body
  const inst = INSTRUMENTS[instrument]
  if (!inst) return res.status(400).json({ error: 'Unknown instrument' })

  const tradeSymbol = priceUnit || symbol || 'NQ'
  const trade = {
    id:                   Date.now(),
    direction,
    entry:                parseFloat(entry),
    target:               parseFloat(target),
    stop:                 parseFloat(stop),
    instrument,
    contracts:            parseInt(contracts) || 1,
    symbol:               tradeSymbol,
    priceUnit:            tradeSymbol,
    entryLevel:           entryLevel || null,
    targetLevel:          targetLevel || null,
    pointValue:           inst.pointValue,
    isFutures:            inst.type === 'futures',
    cascadeActiveAtEntry: latest?.cascade?.active || false,
    enteredAt:            new Date().toISOString(),
    setupRR:              Math.abs(entry - target) / Math.abs(entry - stop),
  }

  activeTrades[tradeSymbol] = trade
  saveActiveTrades()

  console.log('[trade] entered:', tradeSymbol, direction, instrument, entry, '→ target:', target, 'stop:', stop)
  sseEmitter.emit('event', { type: 'trade_entered', symbol: tradeSymbol, trade, timestamp: new Date().toISOString() })
  res.json({ success: true, trade })
})

app.post('/trade/exit', (req, res) => {
  const { symbol, exitPrice, exitReason, notes } = req.body
  const tradeSymbol = symbol || 'NQ'
  const trade = activeTrades[tradeSymbol]
  if (!trade) return res.status(400).json({ error: `No active ${tradeSymbol} trade` })

  const price       = parseFloat(exitPrice)
  const pnlPoints   = trade.direction === 'short' ? trade.entry - price : price - trade.entry
  const pnlDollars  = pnlPoints * trade.pointValue * trade.contracts
  const enteredAt   = new Date(trade.enteredAt)
  const exitedAt    = new Date()
  const durationMin = Math.round((exitedAt - enteredAt) / 60000)
  const actualRR    = pnlPoints / Math.abs(trade.entry - trade.stop)

  db.prepare(`
    INSERT INTO trade_log (
      date, symbol, instrument, contracts, direction,
      entry_price, target_price, stop_price, exit_price, exit_reason,
      pnl_points, pnl_dollars, duration_minutes, entry_level, target_level,
      cascade_active, setup_rr, actual_rr, notes, entered_at, exited_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    trade.symbol, trade.instrument, trade.contracts, trade.direction,
    trade.entry, trade.target, trade.stop, price, exitReason || 'manual',
    pnlPoints, pnlDollars, durationMin, trade.entryLevel, trade.targetLevel,
    trade.cascadeActiveAtEntry ? 1 : 0, trade.setupRR, actualRR,
    notes || '', trade.enteredAt, exitedAt.toISOString()
  )

  console.log('[trade] exited:', tradeSymbol, exitReason, `P&L: ${pnlPoints.toFixed(2)} pts $${pnlDollars.toFixed(2)}`)

  activeTrades[tradeSymbol] = null
  saveActiveTrades()

  sseEmitter.emit('event', { type: 'trade_exited', symbol: tradeSymbol, pnlPoints, pnlDollars, exitReason, timestamp: new Date().toISOString() })
  res.json({ success: true, pnlPoints, pnlDollars, durationMin })
})

app.get('/trade/active', (req, res) => {
  const { symbol } = req.query
  if (symbol) {
    res.json({ trade: activeTrades[symbol] || null, timestamp: new Date().toISOString() })
  } else {
    res.json({
      trades:        activeTrades,
      activeSymbols: Object.entries(activeTrades).filter(([, t]) => t).map(([s]) => s),
      timestamp:     new Date().toISOString(),
    })
  }
})

app.get('/trade/history', (req, res) => {
  const rows = db.prepare(`SELECT * FROM trade_log ORDER BY entered_at DESC LIMIT 50`).all()
  res.json({ trades: rows })
})

// ─── CATALYST DATA ────────────────────────────────────────────────────────────

let catalystCache = null

function scoreCatalystBias(flowData, pcData, gexData, tideData, latestResult) {
  let upVotes = 0
  let downVotes = 0
  const factors = []

  // Factor 1: Put/Call ratio
  const pc = parseFloat(pcData?.data?.putCallRatio || pcData?.data?.ratio || 0)
  if (pc > 1.2) {
    downVotes += 2
    factors.push({ name: 'Put/Call Ratio', value: pc.toFixed(2), vote: 'DOWN', weight: 'HIGH', note: `${pc.toFixed(2)} > 1.2 — bearish positioning` })
  } else if (pc < 0.8 && pc > 0) {
    upVotes += 2
    factors.push({ name: 'Put/Call Ratio', value: pc.toFixed(2), vote: 'UP', weight: 'HIGH', note: `${pc.toFixed(2)} < 0.8 — bullish positioning` })
  } else if (pc > 0) {
    factors.push({ name: 'Put/Call Ratio', value: pc.toFixed(2), vote: 'NEUTRAL', weight: 'MED', note: `${pc.toFixed(2)} — neutral` })
  }

  // Factor 2: GEX environment
  const todayGex = gexData?.data?.find(g =>
    g.expiry === new Date().toISOString().split('T')[0] || g.date === new Date().toISOString().split('T')[0]
  ) || gexData?.data?.[0]
  const netGex = parseFloat(todayGex?.net_gex || 0)
  if (netGex < -50000) {
    factors.push({ name: '0DTE GEX', value: `${(netGex / 1000).toFixed(0)}k`, vote: 'EXPANSION', weight: 'HIGH', note: 'Negative GEX — move accelerates through levels' })
  } else if (netGex > 100000) {
    factors.push({ name: '0DTE GEX', value: `+${(netGex / 1000).toFixed(0)}k`, vote: 'PINNING', weight: 'MED', note: 'Positive GEX — price may pin, smaller move' })
  } else {
    factors.push({ name: '0DTE GEX', value: `${(netGex / 1000).toFixed(0)}k`, vote: 'NEUTRAL', weight: 'LOW', note: 'Neutral GEX environment' })
  }

  // Factor 3: ETF tide
  const tide = latestResult?.etf_tide || tideData?.data?.direction
  if (tide === 'bullish') {
    upVotes += 1
    factors.push({ name: 'ETF Tide', value: 'BULLISH', vote: 'UP', weight: 'MED', note: 'Institutions buying calls' })
  } else if (tide === 'bearish') {
    downVotes += 1
    factors.push({ name: 'ETF Tide', value: 'BEARISH', vote: 'DOWN', weight: 'MED', note: 'Institutions buying puts' })
  }

  // Factor 4: MID dark pool
  const midLevel = latestResult?.levels?.find(l => l.id === 'MID')
  const midDp = midLevel?.dark_pool || 0
  if (midDp <= -0.500) {
    downVotes += 2
    factors.push({ name: 'MID Dark Pool', value: midDp.toFixed(3), vote: 'DOWN', weight: 'HIGH', note: `${midDp.toFixed(3)} — strong institutional selling at MID` })
  } else if (midDp >= 0.500) {
    upVotes += 2
    factors.push({ name: 'MID Dark Pool', value: midDp.toFixed(3), vote: 'UP', weight: 'HIGH', note: `${midDp.toFixed(3)} — strong institutional buying at MID` })
  } else {
    factors.push({ name: 'MID Dark Pool', value: midDp.toFixed(3), vote: 'NEUTRAL', weight: 'LOW', note: `${midDp.toFixed(3)} — no strong signal` })
  }

  // Factor 5: Recent options flow
  const flows = flowData?.data || []
  let callFlow = 0
  let putFlow = 0
  flows.slice(0, 20).forEach(f => {
    const premium = parseFloat(f.total_premium || f.premium || 0)
    if (f.put_call === 'CALL' || f.type === 'call') callFlow += premium
    else if (f.put_call === 'PUT' || f.type === 'put') putFlow += premium
  })
  if (putFlow > callFlow * 1.5) {
    downVotes += 2
    factors.push({ name: 'Options Flow', value: `Puts $${(putFlow / 1000).toFixed(0)}k`, vote: 'DOWN', weight: 'HIGH', note: `Put flow ${((putFlow / Math.max(callFlow, 1)) * 100).toFixed(0)}% above calls` })
  } else if (callFlow > putFlow * 1.5) {
    upVotes += 2
    factors.push({ name: 'Options Flow', value: `Calls $${(callFlow / 1000).toFixed(0)}k`, vote: 'UP', weight: 'HIGH', note: `Call flow ${((callFlow / Math.max(putFlow, 1)) * 100).toFixed(0)}% above puts` })
  } else {
    factors.push({ name: 'Options Flow', value: 'Mixed', vote: 'NEUTRAL', weight: 'MED', note: 'No dominant directional flow' })
  }

  const total = upVotes + downVotes
  const confidence = total === 0 ? 5 : Math.round(Math.max(upVotes, downVotes) / total * 10)
  const direction = upVotes > downVotes ? 'UP' : downVotes > upVotes ? 'DOWN' : 'NEUTRAL'
  const gexNote = netGex < -50000 ? 'expansion' : 'pinning'

  return {
    direction, confidence, upVotes, downVotes, factors, gexNote,
    summary: direction === 'UP'
      ? `Bullish bias — ${confidence}/10 confidence`
      : direction === 'DOWN'
      ? `Bearish bias — ${confidence}/10 confidence`
      : 'No clear directional bias',
  }
}

async function fetchCatalystData() {
  console.log('[catalyst] fetching data...')
  const UW_BASE = process.env.UW_API_BASE || 'https://api.unusualwhales.com'
  const UW_KEY  = process.env.UW_API_KEY
  const headers = { Authorization: `Bearer ${UW_KEY}` }

  const safeFetch = async (url) => {
    try {
      const r = await fetch(url, { headers })
      return r.ok ? await r.json() : null
    } catch { return null }
  }

  const [flowData, pcData, gexData, tideData] = await Promise.all([
    safeFetch(`${UW_BASE}/api/alerts/options-flow?ticker=QQQ&limit=50`),
    safeFetch(`${UW_BASE}/api/stock/QQQ/put-call-ratio`),
    safeFetch(`${UW_BASE}/api/stock/QQQ/greek-exposure/expiry`),
    safeFetch(`${UW_BASE}/api/market/tide`),
  ])

  const score = scoreCatalystBias(flowData, pcData, gexData, tideData, latest)

  catalystCache = {
    fetchedAt:    new Date().toISOString(),
    flow:         flowData?.data || [],
    putCallRatio: pcData?.data || null,
    gex:          gexData?.data || [],
    tide:         tideData?.data || null,
    score,
    levels:       latest?.levels || [],
    currentPrice: latest?.current_price,
    nqRatio:      latest?.nq_ratio || 41.14,
  }

  console.log('[catalyst] fetched:', `bias=${score.direction}`, `confidence=${score.confidence}/10`)
  return catalystCache
}

app.get('/catalyst/data', (req, res) => {
  res.json({ cached: catalystCache, timestamp: new Date().toISOString() })
})

app.post('/catalyst/fetch', async (req, res) => {
  try {
    const data = await fetchCatalystData()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
