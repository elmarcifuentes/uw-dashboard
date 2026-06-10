export default function LevelComparison({
  autoLevels, currentLevels, activeSource, lastCalculated, interval, onApply, applying,
  activeSymbol = 'QQQ', nqRatio,
}) {
  const isNQ     = activeSource === 'nq'
  const levelIds = ['R2', 'R1', 'MID', 'S1', 'S2']

  const fmt = (v) => {
    if (v == null) return '—'
    if (isNQ || activeSymbol === 'NQ') {
      const val = isNQ ? v : Math.round(v * (nqRatio || 41.14) * 4) / 4
      return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return `$${v.toFixed(2)}`
  }

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Auto vs Manual Levels</div>
          {lastCalculated && (
            <div className="text-xs text-gray-700 mt-0.5">
              Calculated{' '}
              {new Date(lastCalculated).toLocaleString('en-US', {
                timeZone: 'America/New_York', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })} ET
            </div>
          )}
        </div>
        <button
          onClick={onApply}
          disabled={applying}
          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
            applying
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-indigo-700 hover:bg-indigo-600 text-white'
          }`}
        >
          {applying ? '⟳ Applying...' : `Apply ${activeSource.toUpperCase()} Levels`}
        </button>
      </div>

      <div className="space-y-0">
        <div className="grid grid-cols-5 gap-2 text-xs text-gray-600 pb-2 border-b border-gray-800">
          <span>Level</span>
          <span className="text-right">Auto</span>
          <span className="text-right">Manual</span>
          <span className="text-right">Delta</span>
          <span className="text-right">Match</span>
        </div>

        {levelIds.map(id => {
          const autoVal   = autoLevels[id]
          const manualEntry = currentLevels?.find(l => l.id === id)
          const manualVal = isNQ ? manualEntry?.nq_price : manualEntry?.price

          const delta      = manualVal != null && autoVal != null ? Math.abs(autoVal - manualVal) : null
          const matchColor = delta === null ? 'text-gray-600' : delta < 0.50 ? 'text-green-500' : delta < 1.50 ? 'text-amber-500' : 'text-red-500'
          const matchLabel = delta === null ? '—' : delta < 0.50 ? '✅ close' : delta < 1.50 ? '~ near' : '✗ diff'
          const levelColor = id === 'R2' || id === 'R1' ? 'text-red-400' : id === 'MID' ? 'text-blue-400' : 'text-green-400'

          return (
            <div key={id} className="grid grid-cols-5 gap-2 text-xs py-1.5 border-b border-gray-800/50">
              <span className={`font-bold ${levelColor}`}>{id}</span>
              <span className="text-right text-white font-mono">{fmt(autoVal)}</span>
              <span className="text-right text-gray-500 font-mono">{manualVal != null ? fmt(manualVal) : '—'}</span>
              <span className="text-right font-mono text-gray-600">{delta != null ? delta.toFixed(2) : '—'}</span>
              <span className={`text-right ${matchColor}`}>{matchLabel}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
        <div className="text-xs text-gray-600">
          Predictive Ranges · {interval || autoLevels.interval || '1d'} bars · length=200 factor=6.0
          · {isNQ || activeSymbol === 'NQ' ? 'NQ' : 'QQQ'} · ATR {fmt(autoLevels.atr)}
        </div>
        {autoLevels?.source === 'derived_from_qqq' && (
          <div className="text-xs text-amber-600 flex items-center gap-1">
            <span>⚠</span>
            <span>Derived from QQQ × {autoLevels.derivedRatio?.toFixed(2)} — add POLYGON_API_KEY for native NQ</span>
          </div>
        )}
      </div>
    </div>
  )
}
