function msToLabel(ms) {
  if (!ms) return '—'
  if (ms >= 60000) return `${ms / 1000 / 60}m`
  return `${ms / 1000}s`
}

export default function SessionHeaderCard({
  date, sessionType, price, nqPrice, nqRatio,
  lastFetch, budget, mode, onToggleMode, onRefresh,
  providerStatus, lastPolled,
}) {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Session</div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            sessionType === 'LIVE' ? 'bg-green-950 text-green-400'
              : sessionType === 'PRE-MARKET' ? 'bg-blue-950 text-blue-400'
              : 'bg-gray-800 text-gray-500'
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
            className="px-2 py-0.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-400 transition-colors"
          >
            ↺
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500 font-mono">{date}</div>

      <div>
        <div className="text-2xl font-bold text-white font-mono tabular-nums">
          ${price?.toFixed(2) ?? '—'}
        </div>
        <div className="text-sm text-gray-500 font-mono">
          NQ {nqPrice ?? '—'}
          {nqRatio && <span className="text-gray-700 ml-2">ratio {nqRatio?.toFixed(3)}</span>}
        </div>
      </div>

      <div className="space-y-1 border-t border-gray-800 pt-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Last fetch</span>
          <span className="text-gray-400 font-mono">{lastFetch || '—'}</span>
        </div>
        {budget && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">API budget</span>
            <span className={`font-mono ${
              budget.status === 'red' ? 'text-red-400'
                : budget.status === 'amber' ? 'text-amber-400'
                : 'text-green-400'
            }`}>
              {budget.callsToday?.toLocaleString()} / {budget.workingBudget?.toLocaleString()} ({budget.percentUsed}%)
            </span>
          </div>
        )}
        {providerStatus && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Polling</span>
            <span className="text-gray-400 font-mono">
              {providerStatus.mode} · {msToLabel(providerStatus.currentInterval)}
            </span>
          </div>
        )}
        {lastPolled && (
          <div className="text-xs text-gray-700">
            polled {lastPolled.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}
