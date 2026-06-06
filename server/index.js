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

  const levelSummary = levels.map(l => {
    const nq    = nqRatio ? Math.round(l.price * nqRatio) : null
    const nqStr = nq ? ` (NQ ${nq.toLocaleString()})` : ''
    return `${l.id}: $${l.price?.toFixed(2)}${nqStr} — ` +
      `${l.classification} | DP ${l.dark_pool?.toFixed(3)} | score ${l.score} | conf ${l.confidence}` +
      `${l.full_stack ? ' | FULL STACK ★' : ''}` +
      `${(l.net_gex || 0) < 0 ? ' | EXPANSION GEX ⚠' : ''}`
  }).join('\n')

  const currentNq  = nqRatio ? Math.round(currentPrice * nqRatio) : null
  const currentStr = currentNq
    ? `$${currentPrice?.toFixed(2)} (NQ ${currentNq.toLocaleString()})`
    : `$${currentPrice?.toFixed(2)}`

  const cascadeStr = cascade?.active
    ? 'CASCADE ACTIVE ⚠ — no institutional floor below MID'
    : cascade?.conditions?.[0]
    ? `Cascade armed — MID DP ${mid?.dark_pool?.toFixed(3)}, ${Math.abs(-0.700 - (mid?.dark_pool || 0)).toFixed(3)} from trigger`
    : 'Cascade inactive'

  const sessionPrompt = `You are a professional QQQ/NQ futures trading analyst preparing a pre-session brief.

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
Sentence 3: Key thresholds — specific prices QQQ (NQ) to watch.

Every price must include NQ in parentheses: $703.54 (NQ 28,945).
Cascade fires when MID dark pool crosses -0.700 only. No bullets, no headers.
CRITICAL: Return ONLY 3 sentences. Stop after the third sentence.`

  const tacticalPrompt = `You are analyzing live QQQ/NQ futures flow.

CURRENT STATE: Price ${currentStr}
LEVELS:\n${levelSummary}
CASCADE: ${cascadeStr}

Write exactly 2 sentences:
1. Where price is right now relative to the most important level
2. The single most important thing to watch next

Include NQ prices in parentheses. Be specific with DP values. Max 2 sentences.
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
      `${l.id}: ${formatPrice(l.price, nqRatio)} — ${l.classification} (DP ${l.dark_pool?.toFixed(3)}, score ${l.score})`
    ).join('\n')

    const prompt = `You are a professional QQQ/NQ futures trading analyst.

Analyze this specific level and provide actionable trading guidance.

CURRENT LEVEL — ${level.id}:
  Price: ${formatPrice(level.price, nqRatio)}
  Classification: ${level.classification}
  Confidence: ${level.confidence}
  Score: ${level.score}
  Dark Pool: ${level.dark_pool?.toFixed(4)}
  Full Stack: ${level.full_stack ? 'YES ★' : 'no'}
  ETF Direction: ${level.etf_direction || 'none'}
  ${(level.net_gex || 0) < 0 ? '⚠ EXPANSION GEX — no mechanical friction' : 'GEX pinning active'}

CURRENT PRICE:
  ${currentPrice ? `QQQ: $${currentPrice.toFixed(2)}` : ''}
  ${distNq ? `${above ? '+' : '-'}$${Math.abs(distQqq)} / ${distNq} NQ ${above ? 'above' : 'below'} this level` : ''}

OTHER LEVELS:
${otherLevels}

CASCADE: ${cascade?.active ? 'ACTIVE ⚠' : cascade?.conditions?.[0] ? 'ARMED (condition 1 met)' : 'inactive'}
STRUCTURE BREAK: ${result?.structure_break?.active ? 'ACTIVE — ' + result.structure_break.direction : 'intact'}

Write 3-4 sentences: what the classification/DP means, what to watch for, retest scenario, target on confirmation.
Always include NQ price in parentheses: $703.54 (NQ 28,945).
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

  const levelSummary = levels.map(l => {
    const nq = nqRatio ? ` (NQ ${Math.round(l.price * nqRatio).toLocaleString()})` : ''
    return `${l.id} $${l.price?.toFixed(2)}${nq} — ${l.classification} DP ${l.dark_pool?.toFixed(3)}${l.full_stack ? ' FULL STACK ★' : ''}`
  }).join('\n')

  const currentNq = nqRatio ? Math.round(currentPrice * nqRatio).toLocaleString() : '—'
  const cascadeStr = cascade?.active ? 'ACTIVE' : mid?.dark_pool <= -0.700 ? 'threshold met' : `${Math.abs(-0.700 - (mid?.dark_pool || 0)).toFixed(3)} from trigger`

  const prompt = `Analyze this QQQ/NQ scoring result.

Price: $${currentPrice?.toFixed(2)} (NQ ${currentNq})
Levels: ${levelSummary}
Cascade: ${cascadeStr}

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

  const prompt = `You are analyzing live QQQ institutional flow data.

Current scoring result:
${JSON.stringify(result, null, 2)}

Write a 3-4 sentence trading narrative that covers:
- Where price sits relative to key levels (R2, R1, MID, S1, S2)
- The most important signal right now
- Primary risk to watch
- One actionable observation

Rules:
- Be specific with prices and level IDs
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

  // Throttle: skip if price hasn't moved ≥ $0.05 since last emit
  const priceMoved = !lastEmittedPrice || Math.abs(price - lastEmittedPrice) >= 0.05
  if (!priceMoved) return
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
    narrativeModeSource,
    systemPaused,
    pausedAt: systemPaused
      ? (db.prepare(`SELECT value FROM settings WHERE key = 'paused_at'`).get()?.value || null)
      : null,
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
          lastNarrative = narrative
          sseEmitter.emit('event', { type: 'narrative_update', narrative, timestamp: new Date().toISOString() })
          console.log('[narrative] SSE emitted (/rescore)')
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

app.listen(PORT, () => {
  console.log(`[server] UW Dashboard API listening on port ${PORT}`)
})
