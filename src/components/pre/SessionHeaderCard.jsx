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
    <div className="bg-bg-elevated border border-border-default rounded-lg p-4 space-y-3 shadow-elevated">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary uppercase tracking-wider">Session</div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            sessionType === 'LIVE' ? 'bg-state-holdSoft text-state-hold'
              : sessionType === 'PRE-MARKET' ? 'bg-signal-continuationSoft text-signal-continuation'
              : 'bg-bg-card2 text-text-tertiary'
          }`}>
            {sessionType}
          </span>
          <button
            onClick={onToggleMode}
            className={`px-2 py-0.5 rounded text-xs font-price font-bold transition-colors ${
              mode === 'REST'
                ? 'bg-state-holdSoft text-state-hold border border-state-hold/50'
                : 'bg-signal-continuationSoft text-signal-continuation border border-signal-continuation/50'
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

      <div className="text-xs text-text-tertiary font-price">{date}</div>

      <div>
        <div className="text-xl2 font-bold text-text-primary font-price tabular-nums">
          {activeSymbol === 'NQ' && nqRatio && price != null
            ? '$' + (Math.round(price * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : (price != null ? '$' + price.toFixed(2) : '—')}
        </div>
      </div>

    </div>
  )
}
