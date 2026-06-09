export function calculateTradeSetup(level, allLevels, currentPrice, nqRatio) {
  if (!level || !allLevels?.length || !currentPrice) return null

  const cls = level.classification
  if (cls === 'no_edge' || cls === 'continuation') return null

  const isShort = cls === 'sell_resistance'
  const isLong  = cls === 'buy_support'
  if (!isShort && !isLong) return null

  const sorted = [...allLevels].sort((a, b) => b.price - a.price)
  const idx = sorted.findIndex(l => l.id === level.id)
  if (idx === -1) return null

  const targetLevel = isShort ? sorted[idx + 1] : sorted[idx - 1]
  if (!targetLevel) return null

  const entry  = level.price
  const target = targetLevel.price
  const stop   = isShort ? entry + 0.50 : entry - 0.50

  const moveQqq = Math.abs(target - entry)
  const riskQqq = Math.abs(stop - entry)
  const rr = parseFloat((moveQqq / riskQqq).toFixed(1))

  const nq = (p) => nqRatio ? Math.round(p * nqRatio) : null

  const flags = []
  if (level.full_stack) flags.push('★ FULL STACK — highest conviction')
  if (isShort && level.dark_pool <= -0.700) flags.push('DP past -0.700 — strong supply')
  if (isLong  && level.dark_pool >= 0.500)  flags.push('DP +0.500+ — institutional support')
  if (targetLevel.classification === 'no_edge') flags.push('⚠ Target has no edge — partial size')
  if (isShort && targetLevel.classification === 'buy_support')     flags.push('Target has buy support — full target')
  if (isLong  && targetLevel.classification === 'sell_resistance') flags.push('Target has resistance — watch for rejection')
  if (rr < 1.5) flags.push('⚠ Poor R/R — consider skipping')

  return {
    direction: isShort ? 'short' : 'long',
    entry:  { qqq: entry,                            nq: nq(entry),  level: level.id },
    target: { qqq: parseFloat(target.toFixed(2)),    nq: nq(target), level: targetLevel.id, classification: targetLevel.classification },
    stop:   { qqq: parseFloat(stop.toFixed(2)),      nq: nq(stop) },
    move:   { qqq: parseFloat(moveQqq.toFixed(2)),   nq: nqRatio ? Math.round(moveQqq * nqRatio) : null },
    risk:   { qqq: parseFloat(riskQqq.toFixed(2)),   nq: nqRatio ? Math.round(riskQqq * nqRatio) : null },
    rr,
    quality: rr >= 3 ? 'excellent' : rr >= 2 ? 'good' : rr >= 1.5 ? 'acceptable' : 'poor',
    flags
  }
}
