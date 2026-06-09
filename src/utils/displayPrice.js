export function displayPrice(qqqPrice, nqPrice, activeSymbol, opts = {}) {
  const { showLabel = false, nqRatio } = opts

  if (activeSymbol === 'NQ') {
    const val = nqPrice ?? (qqqPrice != null && nqRatio
      ? Math.round(qqqPrice * nqRatio * 4) / 4
      : null)
    if (val == null) return '—'
    const formatted = val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return showLabel ? `NQ ${formatted}` : formatted
  } else {
    if (qqqPrice == null) return '—'
    const formatted = qqqPrice.toFixed(2)
    return showLabel ? `$${formatted}` : formatted
  }
}

export function displayDistance(qqqDist, nqDist, activeSymbol) {
  if (activeSymbol === 'NQ') {
    if (nqDist == null) return '—'
    const sign = nqDist >= 0 ? '+' : ''
    return `${sign}${nqDist.toFixed(2)} NQ`
  } else {
    if (qqqDist == null) return '—'
    const v = parseFloat(qqqDist)
    const sign = v >= 0 ? '+' : ''
    return `${sign}$${Math.abs(v).toFixed(2)}`
  }
}
