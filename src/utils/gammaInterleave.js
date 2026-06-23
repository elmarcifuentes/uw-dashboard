// gammaInterleave — select the key gamma levels to weave INTO the price-ladder card stack.
//
// The ladder is one price-descending list (PR cards + price marker); interleaving gamma at its
// correct price-sort position makes gamma and PR levels inherently aligned (same stack, same order).
// Collapsed default shows the top-N by |γ| magnitude, ALWAYS including magnet + call wall + put wall,
// filling the rest with the next-heaviest near-spot strikes. Pure (no JSX) so the row component owns
// icon/label; the full ~55-strike terrain stays in the expand-panel (GammaRail), not here.

const absMax = (s) => Math.max(Math.abs(s?.net0dte || 0), Math.abs(s?.netAll || 0))

export function selectGammaInterleave(gamma, max = 6) {
  if (!gamma?.strikes?.length) return []
  const byStrike = new Map(gamma.strikes.map(s => [s.strike, s]))

  // Role assignment — magnet/walls are always shown; a strike can hold only one role.
  const roleOf = {}
  if (gamma.magnet?.strike   != null) roleOf[gamma.magnet.strike]   = 'magnet'
  if (gamma.callWall?.strike != null && roleOf[gamma.callWall.strike] == null) roleOf[gamma.callWall.strike] = 'callWall'
  if (gamma.putWall?.strike  != null && roleOf[gamma.putWall.strike]  == null) roleOf[gamma.putWall.strike]  = 'putWall'
  const forced = Object.keys(roleOf).map(Number)

  // Fill remaining slots with the next-highest-magnitude near-spot strikes.
  const fill = gamma.strikes
    .filter(s => roleOf[s.strike] == null)
    .sort((a, b) => absMax(b) - absMax(a))
    .slice(0, Math.max(0, max - forced.length))
    .map(s => s.strike)

  const chosen = [...forced, ...fill]

  // Displayed γ value per role (what makes it that kind): magnet=net, walls=their defining call/put γ.
  const valueOf = (k) => {
    if (roleOf[k] === 'magnet')   return gamma.magnet?.netGamma
    if (roleOf[k] === 'callWall') return gamma.callWall?.callGamma
    if (roleOf[k] === 'putWall')  return gamma.putWall?.putGamma
    const s = byStrike.get(k)
    return Math.abs(s?.net0dte || 0) >= Math.abs(s?.netAll || 0) ? s?.net0dte : s?.netAll
  }

  const items = chosen.map(k => {
    const s = byStrike.get(k) || { strike: k }
    const value = valueOf(k)
    return { strike: k, nq: s.nq ?? null, role: roleOf[k] || 'strike', value, magnitude: Math.abs(value || 0) }
  })

  const maxMag = Math.max(1, ...items.map(i => i.magnitude))
  return items
    .map(i => ({ ...i, intensity: i.magnitude / maxMag }))
    .sort((a, b) => b.strike - a.strike)   // price-descending — matches the ladder
}
