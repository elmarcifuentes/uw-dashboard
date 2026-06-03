import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  getDarkPool, getOptionsFlow, getOptionsVolume, getGEXStrikes, getEtfTide
} from './fetchData.js'
import {
  scoreLevel, classifyLevel, gexContext, getConfidenceTier
} from './scoreLevel.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

function etNow() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' ET'
}

function applyEtfTierModifier(baseTier, classification, etfBias) {
  if (baseTier === 'none') return 'none'
  const ladder = ['none', 'low', 'medium', 'high']
  const idx = ladder.indexOf(baseTier)
  if (idx === -1) return baseTier
  let delta = 0
  if (classification === 'buy_support') {
    if (etfBias === 'bullish') delta = +1
    else if (etfBias === 'bearish') delta = -1
  } else if (classification === 'sell_resistance') {
    if (etfBias === 'bearish') delta = +1
    else if (etfBias === 'bullish') delta = -1
  }
  return ladder[Math.max(0, Math.min(ladder.length - 1, idx + delta))]
}

function findExtensionLevel(gexData, lo, hi) {
  const rows = gexData?.data ?? gexData ?? []
  let best = null, bestAbs = 0
  for (const row of rows) {
    const strike = parseFloat(row.strike ?? 0)
    if (strike < lo || strike > hi) continue
    const netGex = parseFloat(row.call_gex ?? 0) + parseFloat(row.put_gex ?? 0)
    const absGex = Math.abs(netGex)
    if (absGex > bestAbs) { bestAbs = absGex; best = { strike, netGex: Math.round(netGex) } }
  }
  return best
}

export async function runFullScore({ trigger = 'auto', session = null } = {}) {
  const levelsPath = join(__dirname, 'levels.json')
  const input      = JSON.parse(readFileSync(levelsPath, 'utf8'))
  const { symbol, levels } = input
  const sessionId = session || input.session

  const delay = ms => new Promise(r => setTimeout(r, ms))

  console.log(`[scorer] Fetching data for ${symbol}…`)
  const darkPoolData  = await getDarkPool(symbol);     await delay(400)
  const flowData      = await getOptionsFlow(symbol);  await delay(400)
  const optionsVolume = await getOptionsVolume(symbol); await delay(400)
  const gexData       = await getGEXStrikes(symbol);   await delay(400)
  const etfTideData   = await getEtfTide(symbol)
  console.log('[scorer] Fetch complete')

  // ETF tide
  const allTideBars   = etfTideData?.data ?? etfTideData ?? []
  const validTideBars = allTideBars.filter(b => b.net_call_premium !== null)
  const tideNow       = validTideBars.at(-1)  ?? {}
  const tide30Ago     = validTideBars.at(-31) ?? validTideBars[0] ?? {}
  const recentNetCall = parseFloat(tideNow.net_call_premium ?? 0) - parseFloat(tide30Ago.net_call_premium ?? 0)
  const recentNetPut  = parseFloat(tideNow.net_put_premium  ?? 0) - parseFloat(tide30Ago.net_put_premium  ?? 0)
  const callAbs = Math.abs(recentNetCall), putAbs = Math.abs(recentNetPut)
  const larger  = Math.max(callAbs, putAbs)
  let sessionFlowBias = validTideBars.length === 0 ? 'no data' : 'neutral'
  if (validTideBars.length > 0 && larger > 0 && Math.abs(callAbs - putAbs) / larger > 0.10) {
    sessionFlowBias = recentNetCall > recentNetPut ? 'bullish' : 'bearish'
  }

  // Current price from most recent dark pool print
  const dpPrints   = darkPoolData?.data ?? darkPoolData ?? []
  const firstPrint = dpPrints[0]
  const currentPrice = firstPrint
    ? parseFloat(firstPrint.price ?? firstPrint.executed_price ?? 0)
    : null

  // Score + classify each level
  const results = levels.map(level => {
    const scored     = scoreLevel(level, { darkPoolData, flowData, optionsVolume })
    const classified = classifyLevel(scored)
    const gex        = gexContext(level, gexData)
    const baseTier   = getConfidenceTier(classified)
    const tier       = applyEtfTierModifier(baseTier, classified.classification, sessionFlowBias)
    return { ...classified, gex, baseTier, tier, prior_attempt_high: level.prior_attempt_high ?? null }
  })

  // Cascade check
  const midResult = results.find(r => r.level_id === 'MID')
  const s1Result  = results.find(r => r.level_id === 'S1')
  const s2Result  = results.find(r => r.level_id === 'S2')
  const r2Result  = results.find(r => r.level_id === 'R2')
  const midDp = midResult?.raw.dark_pool ?? null
  const s1Dp  = s1Result?.raw.dark_pool  ?? null
  const s2Dp  = s2Result?.raw.dark_pool  ?? null
  const cond1 = midDp !== null && midDp <= -0.700
  const cond2 = s1Dp === 0 || s1Dp === -1
  const cond3 = !!(s2Result?.raw.flow_zeroed && s2Dp === 0)

  // Structure break
  const r2Price = r2Result?.price ?? null
  const s2Price = s2Result?.price ?? null
  const breakUp   = currentPrice !== null && r2Price !== null && currentPrice > r2Price
  const breakDown = currentPrice !== null && s2Price !== null && currentPrice < s2Price
  let extPrice = null
  if (breakUp)   { const e = findExtensionLevel(gexData, r2Price, r2Price * 1.02); if (e) extPrice = e.strike }
  if (breakDown) { const e = findExtensionLevel(gexData, s2Price * 0.98, s2Price); if (e) extPrice = e.strike }

  // Build level payloads
  const sorted = [...results].sort((a, b) => a.price - b.price)
  const levelPayloads = results.map(r => {
    const primaryScore =
      r.classification === 'buy_support'    ? r.scores.buy_support_score
    : r.classification === 'sell_resistance' ? r.scores.sell_resistance_score
    :                                          r.scores.continuation_score
    const passiveUp   = r.classification === 'buy_support'    && r.scores.buy_support_score    >= 65 && r.scores.continuation_score >= 40
    const passiveDown = r.classification === 'sell_resistance' && r.scores.sell_resistance_score >= 65 && r.scores.continuation_score >= 40
    let passiveTargetFrom = null
    if (passiveUp)   { const above = sorted.filter(l => l.price > r.price); passiveTargetFrom = above[0]?.level_id ?? null }
    if (passiveDown) { const below = sorted.filter(l => l.price < r.price); passiveTargetFrom = below.at(-1)?.level_id ?? null }
    const etfConfirms = (r.classification === 'buy_support'    && sessionFlowBias === 'bullish') ||
                        (r.classification === 'sell_resistance' && sessionFlowBias === 'bearish')
    const lowerHigh = r.prior_attempt_high != null && r.prior_attempt_high > 0 &&
                      r.prior_attempt_high < r.price && currentPrice !== null && currentPrice < r.prior_attempt_high
    return {
      id:                  r.level_id,
      price:               r.price,
      type:                r.type,
      classification:      r.classification,
      score:               primaryScore,
      confidence:          r.tier,
      dark_pool:           r.raw.dark_pool,
      etf_direction:       sessionFlowBias,
      full_stack:          r.structural_conflict && r.tier === 'high' && etfConfirms,
      conflict:            r.structural_conflict,
      boundary:            (r.classification === 'buy_support'    && r.scores.buy_support_score    === 65) ||
                           (r.classification === 'sell_resistance' && r.scores.sell_resistance_score === 65),
      lower_high:          lowerHigh,
      passive_target:      passiveUp || passiveDown,
      passive_target_from: passiveTargetFrom,
    }
  })

  return {
    session:      String(sessionId),
    run_type:     trigger === 'auto' ? 'auto-rescore' : (input.run_type ?? 'unknown'),
    fetched_at:   etNow(),
    current_price: currentPrice,
    cascade: {
      active:  cond1 && cond2 && cond3,
      mid_dp:  midDp,
    },
    structure_break: {
      active:         breakUp || breakDown,
      direction:      breakUp ? 'upside' : breakDown ? 'downside' : null,
      distance_to_r2: (r2Price !== null && currentPrice !== null) ? +(r2Price - currentPrice).toFixed(2) : null,
      distance_to_s2: (s2Price !== null && currentPrice !== null) ? +(currentPrice - s2Price).toFixed(2) : null,
      r3:             extPrice,
    },
    levels: levelPayloads,
    trigger,
    scored_at: new Date().toISOString(),
  }
}
