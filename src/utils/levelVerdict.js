// ── Decision layer (DISPLAY ONLY) ─────────────────────────────────────────────
// Converts the existing per-level signals into ONE verdict that drives a card's headline and
// whether its setup is framed as actionable. It reads scorer OUTPUTS only — zero scoring change.
// Thresholds reuse the validated tradeSetup.js DP constants; nothing is invented here.
const IN_PLAY_NQ       = 10      // |price − level| ≤ 10 NQ pts ⇒ in play
const DP_CONFIRM_LONG  = 0.500   // buy_support confirmed by DP ≥ +0.500 (tradeSetup.js)
const DP_CONFIRM_SHORT = -0.700  // sell_resistance confirmed by DP ≤ -0.700 (tradeSetup.js)
// DP-oppose (CONFLICT) mirrors confirm on the opposite direction (same constants).

export function levelVerdict(level, currentPrice, nqRatio) {
  if (!level) return null
  const cls = level.classification
  const dir = cls === 'buy_support' ? 'long' : cls === 'sell_resistance' ? 'short' : null
  const dp  = typeof level.dark_pool === 'number' ? level.dark_pool : null
  const nqDist = (currentPrice != null && nqRatio)
    ? Math.round(Math.abs(currentPrice - level.price) * nqRatio)
    : null
  const inPlay   = nqDist != null && nqDist <= IN_PLAY_NQ
  const artifact = dp === -1                       // all prints in the resistance window — wrong side
  const high     = level.confidence === 'high'
  const dpConfirms = dir === 'long'  ? (dp != null && dp >= DP_CONFIRM_LONG)
                   : dir === 'short' ? (dp != null && dp <= DP_CONFIRM_SHORT) : false
  const dpOpposes  = dir === 'long'  ? (dp != null && dp <= DP_CONFIRM_SHORT)
                   : dir === 'short' ? (dp != null && dp >= DP_CONFIRM_LONG) : false

  let state
  if (!inPlay || artifact)             state = 'NOT_IN_PLAY'
  else if (dir && dpOpposes)           state = 'CONFLICT'
  else if (dir && high && dpConfirms)  state = dir === 'long' ? 'ACT_LONG' : 'ACT_SHORT'
  else if (dir && !high && dpConfirms) state = 'SMALL'
  else                                 state = 'WAIT'

  const actionable = state === 'SMALL' || state === 'ACT_LONG' || state === 'ACT_SHORT'
  return { state, dir, actionable, nqDist, summary: summaryFor(state, level, dir, nqDist, artifact) }
}

function summaryFor(state, level, dir, nqDist, artifact) {
  const id = level.id, conf = level.confidence
  switch (state) {
    case 'ACT_LONG':    return `Buy ${id} — high-confidence support, dark pool confirms.`
    case 'ACT_SHORT':   return `Sell ${id} — high-confidence resistance, dark pool confirms.`
    case 'SMALL':       return `${dir === 'long' ? 'Buy' : 'Sell'} ${id} — direction confirmed, confidence ${conf}; small size.`
    case 'WAIT':        return dir
      ? `Watch ${id} — in play, but dark pool hasn't confirmed; wait.`
      : `Watch ${id} — in play, no directional edge yet.`
    case 'CONFLICT':    return `Avoid ${id} — ${dir === 'short' ? 'buyers' : 'sellers'} defending; dark pool opposes the ${dir}.`
    case 'NOT_IN_PLAY': return artifact
      ? `Context only — price is the wrong side of ${id} (positioning artifact).`
      : `Context only — ${nqDist != null ? nqDist + ' NQ pts away' : 'out of range'}; pre-position, not a live call.`
    default: return ''
  }
}
