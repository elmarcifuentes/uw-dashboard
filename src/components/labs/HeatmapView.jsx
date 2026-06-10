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

  const levelMap = {
    [levels.R2]:  { id: 'R2',  color: 'red'   },
    [levels.R1]:  { id: 'R1',  color: 'red'   },
    [levels.MID]: { id: 'MID', color: 'blue'  },
    [levels.S1]:  { id: 'S1',  color: 'green' },
    [levels.S2]:  { id: 'S2',  color: 'green' },
  }

  const rows = []
  let price = gridMax
  while (price >= gridMin - step) {
    rows.push(parseFloat(price.toFixed(showNQ ? 0 : 2)))
    price -= step
  }

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
        Level Heatmap — {showNQ ? 'NQ' : 'QQQ'}
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

          const barColor = levelInfo
            ? levelInfo.color === 'red'   ? 'bg-red-500'
            : levelInfo.color === 'green' ? 'bg-green-500'
            : 'bg-blue-500'
            : 'bg-gray-700'

          const textColor = levelInfo?.color === 'red'   ? 'text-red-400'
            : levelInfo?.color === 'green' ? 'text-green-400'
            : levelInfo?.color === 'blue'  ? 'text-blue-400'
            : nearCurrent                  ? 'text-yellow-400'
            : 'text-gray-600'

          return (
            <div
              key={i}
              className={`flex items-center gap-2 py-0.5 rounded px-1 ${
                nearCurrent ? 'bg-yellow-400/10' : levelInfo ? 'bg-gray-800/50' : ''
              }`}
            >
              <span className={`w-16 text-right shrink-0 ${textColor}`}>
                {p(rowPrice)}
              </span>
              <div className="flex-1 h-3 bg-gray-900 rounded overflow-hidden relative">
                <div
                  className={`h-full rounded transition-all ${barColor} ${levelInfo ? 'opacity-80' : 'opacity-30'}`}
                  style={{ width: `${barWidth}%` }}
                />
                {nearCurrent && (
                  <div className="absolute inset-y-0 right-0 w-0.5 bg-yellow-400" />
                )}
              </div>
              <span className={`w-12 shrink-0 text-xs font-bold ${textColor}`}>
                {levelInfo?.id || (nearCurrent ? '▶ now' : '')}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 mt-3 text-xs text-gray-600">
        <span><span className="text-red-500">■</span> Resistance band</span>
        <span><span className="text-green-500">■</span> Support band</span>
        <span><span className="text-yellow-400">▶</span> Current price</span>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">ATR band</span>
          <span className="text-gray-400 font-mono">{p(levels.holdAtr)} per side</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Full range</span>
          <span className="text-gray-400 font-mono">{p(levels.S2)} — {p(levels.R2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Source</span>
          <span className="text-gray-500">{levels.source}</span>
        </div>
      </div>
    </div>
  )
}
