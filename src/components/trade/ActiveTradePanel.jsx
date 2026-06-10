export default function ActiveTradePanel({ trade, currentPrice, pnl, evaluation, activeSymbol, nqRatio }) {
  const isNQ    = activeSymbol === 'NQ'
  const isShort = trade.direction === 'short'

  const fmt = (price) => price != null
    ? (isNQ
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2 })
      : `$${price.toFixed(2)}`)
    : '—'

  const fmtCurrent = currentPrice != null
    ? (isNQ
      ? (Math.round(currentPrice * (nqRatio || 41.14) * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2 })
      : `$${currentPrice.toFixed(2)}`)
    : '—'

  const progressPct = evaluation?.progressPct || 0

  return (
    <div className={`border rounded-lg p-4 ${
      pnl?.isProfit ? 'border-green-900/50 bg-green-950/10' : 'border-red-900/50 bg-red-950/10'
    }`}>
      {/* Direction badge + P&L */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold px-2 py-0.5 rounded ${
            isShort ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'
          }`}>
            {isShort ? '↓ SHORT' : '↑ LONG'}
          </span>
          <span className="text-xs text-gray-500">{trade.instrument} × {trade.contracts}</span>
        </div>
        {pnl && (
          <div className={`text-sm font-bold font-mono ${pnl.isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {pnl.points > 0 ? '+' : ''}{pnl.points.toFixed(2)} pts · {pnl.dollars > 0 ? '+' : ''}${Math.abs(pnl.dollars).toFixed(2)}
          </div>
        )}
      </div>

      {/* Price levels */}
      <div className="space-y-1.5 mb-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-red-400 font-bold">STOP</span>
          <span className="text-red-400 font-mono">{fmt(trade.stop)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-b border-gray-800 py-1">
          <span className="text-gray-400">Entry</span>
          <span className="text-white font-mono font-bold">{fmt(trade.entry)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-yellow-400">▶ NOW</span>
          <span className="text-yellow-400 font-mono font-bold">{fmtCurrent}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-green-400 font-bold">TARGET</span>
          <span className="text-green-400 font-mono">{fmt(trade.target)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Progress to target</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded overflow-hidden">
          <div
            className={`h-full rounded transition-all duration-500 ${
              progressPct >= 100 ? 'bg-green-400' : progressPct >= 50 ? 'bg-green-600' : 'bg-indigo-600'
            }`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
