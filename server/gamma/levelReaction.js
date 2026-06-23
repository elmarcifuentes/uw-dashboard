// server/gamma/levelReaction.js
//
// Stage 2 — reaction-probability model. DISPLAY-ONLY, additive: reads scored outputs (classification,
// score), gamma topography, and the net-prem directional push; NEVER writes scoring. Produces a
// distribution over { STALL, BREAK_THROUGH, FADE_LONG, FADE_SHORT } + confidence + a one-line reason.
//
// The weights/refs are HYPOTHESES, not truth — the calibration store (gamma_predictions) logs every
// prediction + its resolved outcome so we can correct them against reality. Until a bucket has enough
// resolved samples its display is marked provisional ("est."). All constants live here, in one place.

// ── Tunable constants (calibration corrects these) ────────────────────────────────────────────────
export const REACTION_WEIGHTS = {
  W_MAGNET: 1.4,   // magnet pull — primary mover
  W_WALL:   1.2,   // wall stall/reversal + corridor-to-next-wall
  W_REGIME: 1.1,   // expansion↔pinning — load-bearing (flips break vs stall)
  W_PUSH:   0.6,   // net-prem flow aligned with break direction
  W_PUSH_FADE: 0.4,// net-prem flow tilts which fade
  W_SCORER: 0.5,   // DP/flow scorer confirm/conflict nudge
}
export const REACTION_REFS = {
  MAGNET_REF: 500e6,   // |net γ| at which magnet pull ≈ full strength
  WALL_REF:   800e6,   // |wall γ| at which a wall ≈ full strength
  REGIME_REF: 5000e6,  // |aggregate net γ| at which regime ≈ full strength
  PUSH_SCALE: 10e6,    // 15-min Σ(net_call − net_put) at which push ≈ tanh(1)
  MAGNET_TOL: 1.5,     // QQQ pts — level ≈ magnet
  WALL_TOL:   2.0,     // QQQ pts — level ≈ wall
  REACH_SCALE: 6,      // QQQ pts — confidence decay with distance
  REACH_LIMIT: 12,     // QQQ pts — beyond this (or outside the gamma window) = "not in range"
}
// Outcome-resolution tunables (flagged for review once calibration data accumulates)
export const RESOLUTION = { WINDOW_MIN: 15, TEST_TOL: 0.15, BREAK_TOL: 0.30, FADE_TOL: 0.30 }
export const MIN_CALIBRATION_SAMPLES = 20

export const OUTCOMES = ['STALL', 'BREAK_THROUGH', 'FADE_LONG', 'FADE_SHORT']
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

// push = tanh( Σ last-N minutes (net_call_premium − net_put_premium) / PUSH_SCALE ) ∈ [−1,+1], + = up.
export function computePush(netPremRows, n = RESOLUTION.WINDOW_MIN) {
  if (!Array.isArray(netPremRows) || !netPremRows.length) return 0
  const sum = netPremRows.slice(-n).reduce(
    (a, r) => a + ((parseFloat(r.net_call_premium) || 0) - (parseFloat(r.net_put_premium) || 0)), 0)
  return Math.tanh(sum / REACTION_REFS.PUSH_SCALE)
}

// Reaction for one PR level. Returns { inRange:false } when too far / outside the gamma window.
export function levelReaction(prLevel, gamma, push = 0, spot) {
  if (!prLevel || !gamma || spot == null) return null
  const W = REACTION_WEIGHTS
  const R = REACTION_REFS
  const L = prLevel.price
  const d = L - spot                       // + above spot, − below
  const breakDir = Math.sign(d) || 1       // breaking continues up (above) / down (below)

  const inWindow = gamma.window && L >= gamma.window.lo && L <= gamma.window.hi
  if (!inWindow || Math.abs(d) > R.REACH_LIMIT) {
    return { level: prLevel.id, inRange: false, reason: 'not in range' }
  }

  const { magnet, callWall, putWall } = gamma
  const aggNet = gamma.regime?.netGamma ?? 0
  const expansion = aggNet < 0
  const rStr = clamp(Math.abs(aggNet) / R.REGIME_REF, 0, 1)
  const mStr = magnet ? clamp(Math.abs(magnet.netGamma) / R.MAGNET_REF, 0, 1) : 0

  const Lg = { STALL: 0, BREAK_THROUGH: 0, FADE_LONG: 0, FADE_SHORT: 0 }
  // Natural reversal direction at this level: bounce up if below spot, reject down if above.
  const FADE_REV = d < 0 ? 'FADE_LONG' : 'FADE_SHORT'
  const FADE_OPP = d < 0 ? 'FADE_SHORT' : 'FADE_LONG'
  const atMagnet = magnet && Math.abs(L - magnet.strike) <= R.MAGNET_TOL

  // ── 1. Magnet pull (primary) ──────────────────────────────────────────────
  let magnetNote = null
  if (magnet) {
    const mSide = Math.sign(magnet.strike - spot)
    const sameSide = Math.sign(d) === mSide && mSide !== 0
    if (atMagnet) {
      Lg.STALL += W.W_MAGNET * mStr * 1.0
      Lg.BREAK_THROUGH -= W.W_MAGNET * mStr * 0.4
      magnetNote = `at ${magnet.strike} magnet`
    } else if (sameSide && Math.abs(d) < Math.abs(magnet.strike - spot)) {
      Lg.BREAK_THROUGH += W.W_MAGNET * mStr                 // between spot & magnet → price wants magnet
      magnetNote = `toward ${magnet.strike} magnet`
    } else if (sameSide) {
      Lg.STALL += W.W_MAGNET * mStr * 0.6                   // beyond magnet → stall/reverse (your read)
      Lg[FADE_REV] += W.W_MAGNET * mStr * 0.7
      Lg.BREAK_THROUGH -= W.W_MAGNET * mStr * 0.3
      magnetNote = `beyond ${magnet.strike} magnet`
    } else {
      Lg[FADE_REV] += W.W_MAGNET * mStr * 0.6              // magnet opposite side → pulls away from level
      Lg.STALL += W.W_MAGNET * mStr * 0.4
      Lg.BREAK_THROUGH -= W.W_MAGNET * mStr * 0.4
      magnetNote = `magnet ${magnet.strike} pulls away`
    }
  }

  // ── 2. Walls (at-wall stall/reversal · open corridor to next wall) ─────────
  let wallNote = null, corridorNote = null
  const atCallWall = callWall && d > 0 && Math.abs(L - callWall.strike) <= R.WALL_TOL
  const atPutWall  = putWall  && d < 0 && Math.abs(L - putWall.strike)  <= R.WALL_TOL
  let wallStr = 0
  if (atCallWall) {
    wallStr = clamp(Math.abs(callWall.callGamma) / R.WALL_REF, 0, 1)
    Lg.STALL += W.W_WALL * wallStr; Lg.FADE_SHORT += W.W_WALL * wallStr
    wallNote = `at ${callWall.strike} call wall`
  } else if (atPutWall) {
    wallStr = clamp(Math.abs(putWall.putGamma) / R.WALL_REF, 0, 1)
    Lg.STALL += W.W_WALL * wallStr; Lg.FADE_LONG += W.W_WALL * wallStr
    wallNote = `at ${putWall.strike} put wall`
  } else if (!atMagnet) {
    // Open corridor to the next wall in the break direction — only in open space, not at the magnet
    // (at the magnet the pin/regime tension is the story; a corridor term there double-counts break).
    const tgt = breakDir > 0 ? callWall : putWall
    if (tgt) {
      const tStr = clamp(Math.abs(breakDir > 0 ? tgt.callGamma : tgt.putGamma) / R.WALL_REF, 0, 1)
      Lg.BREAK_THROUGH += W.W_WALL * 0.3 * tStr
      corridorNote = `toward ${tgt.strike} ${breakDir > 0 ? 'call' : 'put'} wall`
    }
  }

  // ── 3. Regime (load-bearing) ───────────────────────────────────────────────
  if (expansion) {
    Lg.BREAK_THROUGH += W.W_REGIME * rStr
    Lg.STALL -= W.W_REGIME * rStr * 0.7
    Lg.FADE_LONG -= W.W_REGIME * rStr * 0.4
    Lg.FADE_SHORT -= W.W_REGIME * rStr * 0.4
  } else {
    Lg.STALL += W.W_REGIME * rStr
    Lg[FADE_REV] += W.W_REGIME * rStr * 0.6
    Lg.BREAK_THROUGH -= W.W_REGIME * rStr
  }

  // ── 4. net-prem push (direction) ───────────────────────────────────────────
  Lg.BREAK_THROUGH += W.W_PUSH * (push * breakDir)   // flow aligned with break dir
  Lg.FADE_LONG += W.W_PUSH_FADE * push               // up-flow → more bounce / less reject
  Lg.FADE_SHORT -= W.W_PUSH_FADE * push

  // ── 5. Scorer confirm/conflict ─────────────────────────────────────────────
  const cls = prLevel.classification
  const sStr = clamp(((prLevel.score || 0) - 50) / 50, 0, 1)
  const defendsBreak = (cls === 'buy_support' && breakDir < 0) || (cls === 'sell_resistance' && breakDir > 0)
  let scorerImplied = null
  if (defendsBreak) {
    Lg.BREAK_THROUGH -= W.W_SCORER * sStr
    Lg.STALL += W.W_SCORER * sStr * 0.6
    Lg[FADE_REV] += W.W_SCORER * sStr
    scorerImplied = FADE_REV
  } else if (cls === 'continuation') {
    Lg.BREAK_THROUGH += W.W_SCORER * sStr
    scorerImplied = 'BREAK_THROUGH'
  } else if (cls !== 'no_edge') {
    Lg.BREAK_THROUGH += W.W_SCORER * 0.5 * sStr        // classification doesn't defend this break dir
    scorerImplied = 'BREAK_THROUGH'
  }

  // Pre-confidence dominant (for agreement scoring)
  const preDom = OUTCOMES.reduce((a, k) => Lg[k] > Lg[a] ? k : a, 'STALL')
  let agree = 1.0, conflict = null
  if (scorerImplied && scorerImplied === preDom) {
    agree = 1.1
  } else if (scorerImplied && (scorerImplied === FADE_REV || scorerImplied === 'STALL') && preDom === 'BREAK_THROUGH') {
    agree = 0.7
    conflict = cls === 'sell_resistance' ? 'gamma says break, DP says resistance'
             : cls === 'buy_support'    ? 'gamma says break, DP says support' : 'gamma vs DP mixed'
  } else if (scorerImplied === 'BREAK_THROUGH' && (preDom === 'STALL' || preDom === FADE_REV)) {
    agree = 0.7; conflict = 'gamma says hold, DP says break'
  }

  // ── Confidence → softmax temperature ───────────────────────────────────────
  const reach = Math.exp(-Math.abs(d) / R.REACH_SCALE)
  const C = clamp(Math.max(mStr, wallStr) * (1 + 0.2 * rStr) * agree * reach, 0, 1)
  const bucket = C >= 0.66 ? 'high' : C >= 0.40 ? 'med' : 'low'
  const T = 1 / (0.5 + 1.5 * C)
  Lg[FADE_OPP] = Math.max(Lg[FADE_OPP], -2.0)   // small floor so the unnatural fade never fully vanishes

  let sum = 0; const exps = {}
  for (const k of OUTCOMES) { exps[k] = Math.exp(Lg[k] / T); sum += exps[k] }
  const dist = {}
  for (const k of OUTCOMES) dist[k] = Math.round((exps[k] / sum) * 1000) / 10   // % to 0.1
  const dominant = OUTCOMES.reduce((a, k) => dist[k] > dist[a] ? k : a, 'STALL')
  const ranked = OUTCOMES.slice().sort((a, b) => dist[b] - dist[a])
  const contested = (dist[ranked[0]] - dist[ranked[1]]) < 5 ? ranked[1] : null

  const reasonBits = [magnetNote, wallNote || corridorNote, expansion ? 'expansion' : 'pinning']
  if (Math.abs(push) > 0.15) reasonBits.push(push > 0 ? 'flow up' : 'flow down')

  return {
    level: prLevel.id, inRange: true,
    dist, dominant, contested, breakDir,
    confidence: { value: Math.round(C * 100) / 100, bucket },
    reason: reasonBits.filter(Boolean).join(', '),
    conflict,
    inputs: {
      d: Math.round(d * 100) / 100, magnet: magnet?.strike, regime: expansion ? 'expansion' : 'pinning',
      mStr: Math.round(mStr * 100) / 100, rStr: Math.round(rStr * 100) / 100,
      push: Math.round(push * 100) / 100, cls, score: prLevel.score || 0,
    },
  }
}

// Resolve a logged prediction from price samples within [t0, t0+window]. Pure.
// samples: [{ ts, price }] (any cadence). Returns one of OUTCOMES | 'NOT_TESTED' | 'NO_DATA'.
export function resolveReaction({ levelPrice, spot0, samples }, res = RESOLUTION) {
  if (!samples || !samples.length) return 'NO_DATA'
  const L = levelPrice
  const side = Math.sign(spot0 - L) || 1     // side spot started (level below spot → +)
  const far = -side
  // Tested = price touched within TEST_TOL OR crossed the level between two samples (fast moves can
  // skip the band at coarse sampling, so a sign change across consecutive samples also counts).
  let tested = false
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i].price - L) <= res.TEST_TOL) { tested = true; break }
    if (i > 0 && Math.sign(samples[i - 1].price - L) !== Math.sign(samples[i].price - L)) { tested = true; break }
  }
  if (!tested) return 'NOT_TESTED'
  const end = samples[samples.length - 1].price
  const disp = end - L
  if (Math.sign(disp) === far && Math.abs(disp) >= res.BREAK_TOL) return 'BREAK_THROUGH'
  if (Math.sign(disp) === side && Math.abs(disp) >= res.FADE_TOL) return side > 0 ? 'FADE_LONG' : 'FADE_SHORT'
  return 'STALL'
}
