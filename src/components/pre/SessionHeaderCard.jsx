function msToLabel(ms) {
  if (!ms) return '—'
  if (ms >= 60000) return `${ms / 1000 / 60}m`
  return `${ms / 1000}s`
}

export default function SessionHeaderCard({
  date, sessionType, price, nqPrice, nqRatio,
  lastFetch, budget, mode, onToggleMode, onRefresh,
  providerStatus, lastPolled, activeSymbol = 'NQ',
}) {
  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary uppercase tracking-wider">Session</div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            sessionType === 'LIVE' ? 'bg-green-950 text-green-400'
              : sessionType === 'PRE-MARKET' ? 'bg-blue-950 text-blue-400'
              : 'bg-bg-elevated text-text-tertiary'
          }`}>
            {sessionType}
          </span>
          <button
            onClick={onToggleMode}
            className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors ${
              mode === 'REST'
                ? 'bg-green-800 text-green-200 border border-green-600'
                : 'bg-blue-800 text-blue-200 border border-blue-600'
            }`}
          >
            {mode === 'REST' ? '● REST' : '○ WS'}
          </button>
          <button
            onClick={onRefresh}
            className="px-2 py-0.5 text-xs bg-bg-elevated hover:bg-bg-elevated rounded border border-border-default text-text-secondary transition-colors"
          >
            ↺
          </button>
        </div>
      </div>

      <div className="text-xs text-text-tertiary font-mono">{date}</div>

      <div>
        <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">
          {activeSymbol === 'NQ' && nqRatio && price != null
            ? '$' + (Math.round(price * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : (price != null ? '$' + price.toFixed(2) : '—')}
        </div>
      </div>

    </div>
  )
}
