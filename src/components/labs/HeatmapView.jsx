export default function HeatmapView({ levels, currentPrice, nqRatio, activeSource, activeSymbol = 'QQQ' }) {
  if (!levels) return null

  const showNQ = activeSymbol === 'NQ' || activeSource === 'nq'
  const p = (v) => {
    if (v == null) return '—'
    if (showNQ) {
      const val = activeSource === 'nq' ? v : Math.round(v * (nqRatio || 41.14) * 4) / 4
      return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return `$${v.toFixed(2)}`
  }

  const step    = levels.holdAtr / 4
  const gridMin = levels.S2 - levels.holdAtr
  const gridMax = levels.R2 + levels.holdAtr

  // Raw Predictive-Ranges bands are UNSCORED structure — they carry no classification, so per
  // the design rule they render in NEUTRAL treatments (never signal-* action colors). MID keeps
  // its blue continuation token as the range anchor. R/S identity comes from the label text.
  const levelMap = {
    [levels.R2]:  { id: 'R2'  },
    [levels.R1]:  { id: 'R1'  },
    [levels.MID]: { id: 'MID' },
    [levels.S1]:  { id: 'S1'  },
    [levels.S2]:  { id: 'S2'  },
  }

  const rows = []
  let price = gridMax
  while (price >= gridMin - step) {
    rows.push(parseFloat(price.toFixed(showNQ ? 0 : 2)))
    price -= step
  }

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
      <div className="mb-3">
        <div className="text-xs text-text-tertiary uppercase tracking-wider">
          Level Heatmap — {showNQ ? 'NQ' : 'QQQ'}
        </div>
        <div className="text-micro text-text-muted mt-0.5">structure — not scored bias</div>
      </div>

      <div className="space-y-0.5 font-mono text-xs">
        {rows.map((rowPrice, i) => {
          const nearestLevelKey = Object.keys(levelMap).find(
            lp => Math.abs(parseFloat(lp) - rowPrice) < step / 2
          )
          const levelInfo = nearestLevelKey ? levelMap[nearestLevelKey] : null
          const nearCurrent = currentPrice != null && Math.abs(rowPrice - currentPrice) < step

          const distToNearest = levelInfo
            ? 0
            : Math.min(...Object.keys(levelMap).map(lp => Math.abs(parseFloat(lp) - rowPrice))) / levels.holdAtr
          const barWidth = levelInfo ? 100 : Math.max(10, 100 - distToNearest * 60)

          const isMid = levelInfo?.id === 'MID'
          const barColor = levelInfo
            ? (isMid ? 'bg-signal-continuation' : 'bg-signal-neutral')
            : 'bg-bg-elevated'

          const textColor = isMid ? 'text-signal-continuation'
            : levelInfo      ? 'text-text-secondary'
            : nearCurrent    ? 'text-accent-price'
            : 'text-text-muted'

          return (
            <div
              key={i}
              className={`flex items-center gap-2 py-0.5 rounded px-1 ${
                nearCurrent ? 'bg-accent-priceSoft' : levelInfo ? 'bg-bg-elevated/50' : ''
              }`}
            >
              <span className={`w-16 text-right shrink-0 ${textColor}`}>
                {p(rowPrice)}
              </span>
              <div className="flex-1 h-3 bg-bg-card2 rounded overflow-hidden relative">
                <div
                  className={`h-full rounded transition-all ${barColor} ${levelInfo ? 'opacity-80' : 'opacity-30'}`}
                  style={{ width: `${barWidth}%` }}
                />
                {nearCurrent && (
                  <div className="absolute inset-y-0 right-0 w-0.5 bg-accent-price" />
                )}
              </div>
              <span className={`w-12 shrink-0 text-xs font-bold ${textColor}`}>
                {levelInfo?.id || (nearCurrent ? '▶ now' : '')}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 mt-3 text-xs text-text-muted">
        <span><span className="text-signal-neutral">■</span> R/S band (structure)</span>
        <span><span className="text-signal-continuation">■</span> MID anchor</span>
        <span><span className="text-accent-price">▶</span> Current price</span>
      </div>

      <div className="mt-3 pt-3 border-t border-border-subtle space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">ATR band</span>
          <span className="text-text-secondary font-mono">{p(levels.holdAtr)} per side</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Full range</span>
          <span className="text-text-secondary font-mono">{p(levels.S2)} — {p(levels.R2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Source</span>
          <span className="text-text-tertiary">{levels.source}</span>
        </div>
      </div>
    </div>
  )
}
