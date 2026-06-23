// server/gamma/computeGammaTopography.js
//
// Stage 1 gamma-magnet topography — DISPLAY ONLY, additive. Pure compute: no fetch, no scoring,
// no probability model (that is Stage 2). Derives the near-spot gamma topography from UW
// per-strike spot-exposures so the ladder can render a live gamma-terrain rail beside the levels.
//
// Derived markers (validated 2026-06-23 against the user's UW dashboard: magnet 715, walls 700/730):
//   magnet   = near-spot strike with the largest |net gamma| (0DTE primary/loud; all-expiry fallback)
//   callWall = strike with the largest call gamma at/above spot (all-expiry, structural)
//   putWall  = strike with the largest |put gamma| at/below spot (all-expiry, structural)
//   regime   = sign of the AGGREGATE net gamma (negative = expansion/trending, positive = pinning)
//
// NO flip line in Stage 1: net gamma is one-signed across the near-spot window, so a per-strike
// zero-cross there is noise, not a regime line. The honest regime read is the aggregate sign.

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : 0 }
const NQ_TICK = 0.25
const toNq = (strike, ratio) => (ratio ? Math.round((strike * ratio) / NQ_TICK) * NQ_TICK : null)

// Collapse rows (UW may return >1 row per strike, e.g. expiry splits) into one net per strike.
function netByStrike(rows) {
  const m = new Map()
  for (const r of rows || []) {
    const k = num(r.strike)
    if (!k) continue
    const cur = m.get(k) || { strike: k, callGamma: 0, putGamma: 0 }
    cur.callGamma += num(r.call_gamma_oi)
    cur.putGamma  += num(r.put_gamma_oi)
    m.set(k, cur)
  }
  return [...m.values()].map(s => {
    const net = s.callGamma + s.putGamma
    return { ...s, net, abs: Math.abs(net) }
  })
}

/**
 * @returns null when there is no usable strike data (caller should keep last-good), else the
 *          topography object consumed by the GammaRail component.
 */
export function computeGammaTopography({ rows0dte, rowsAllExp, aggregate, spot, ratio, asOf } = {}) {
  const s0 = netByStrike(rows0dte)
  const sA = netByStrike(rowsAllExp)
  if (!s0.length && !sA.length) return null

  const max0 = Math.max(1, ...s0.map(x => x.abs))
  const maxA = Math.max(1, ...sA.map(x => x.abs))

  // Merge both layers per strike for terrain rendering (loud = 0DTE, quiet = all-expiry).
  const byStrike = new Map()
  for (const x of s0) byStrike.set(x.strike, { strike: x.strike, net0dte: x.net, abs0dte: x.abs, netAll: 0, absAll: 0 })
  for (const x of sA) {
    const cur = byStrike.get(x.strike) || { strike: x.strike, net0dte: 0, abs0dte: 0 }
    cur.netAll = x.net; cur.absAll = x.abs
    byStrike.set(x.strike, cur)
  }
  const strikes = [...byStrike.values()].map(x => {
    const i0 = (x.abs0dte || 0) / max0
    const iA = (x.absAll || 0) / maxA
    return {
      strike: x.strike,
      nq: toNq(x.strike, ratio),
      net0dte: x.net0dte || 0,
      netAll: x.netAll || 0,
      intensity0dte: Math.round(i0 * 1000) / 1000,   // 0..1 terrain opacity, loud layer
      intensityAll:  Math.round(iA * 1000) / 1000,   // 0..1 terrain opacity, quiet layer
      aligned: i0 > 0.5 && iA > 0.5,                  // heavy in BOTH → reinforced/brightened
    }
  }).sort((a, b) => b.strike - a.strike)             // descending — matches the ladder's order

  // Magnet — 0DTE primary (loud); fall back to all-expiry if 0DTE is empty (e.g. non-expiry day).
  const magnetSrc = s0.length ? s0 : sA
  const mg = magnetSrc.slice().sort((a, b) => b.abs - a.abs)[0]
  const magnet = mg ? {
    strike: mg.strike, nq: toNq(mg.strike, ratio), netGamma: mg.net,
    source: s0.length ? '0DTE' : 'all-expiry',
  } : null

  // Walls — all-expiry structural (fall back to 0DTE). Walls STRADDLE the magnet (the pull center):
  // call wall = biggest call γ ABOVE the magnet; put wall = biggest |put γ| BELOW it. Splitting on the
  // magnet (not spot) keeps the wall distinct from the magnet — otherwise the heaviest put-γ strike is
  // usually the magnet itself, collapsing the two. (Matches the dashboard: magnet 715 → walls 700/730.)
  const wallSrc = sA.length ? sA : s0
  const divider = magnet?.strike ?? spot
  const above = wallSrc.filter(x => x.strike > divider)
  const below = wallSrc.filter(x => x.strike < divider)
  const cwRow = above.slice().sort((a, b) => b.callGamma - a.callGamma)[0]
  const pwRow = below.slice().sort((a, b) => Math.abs(b.putGamma) - Math.abs(a.putGamma))[0]
  const callWall = cwRow ? { strike: cwRow.strike, nq: toNq(cwRow.strike, ratio), callGamma: cwRow.callGamma } : null
  const putWall  = pwRow ? { strike: pwRow.strike, nq: toNq(pwRow.strike, ratio), putGamma: pwRow.putGamma } : null

  // Regime — aggregate net gamma sign (the honest regime read; no flip line).
  const aggNet = num(aggregate?.gamma_per_one_percent_move_oi)
  const regime = aggregate != null ? {
    netGamma: aggNet,
    sign: aggNet < 0 ? 'expansion' : 'pinning',
    label: aggNet < 0 ? 'EXPANSION' : 'PINNING',
  } : null

  const ks = strikes.map(s => s.strike)
  return {
    asOf: asOf || null,
    spot: spot ?? null,
    ratio: ratio ?? null,
    window: ks.length ? { lo: Math.min(...ks), hi: Math.max(...ks) } : null,
    magnet, callWall, putWall, regime,
    strikes,
    max0dte: max0, maxAll: maxA,
  }
}
