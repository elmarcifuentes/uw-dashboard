export default function ActiveTradePanel({ trade, currentPrice, pnl, evaluation, activeSymbol }) {
  const isShort = trade.direction === 'short'

  const fmt = (price) => {
    if (price == null) return '—'
    return trade.priceUnit === 'NQ'
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2 })
      : `$${price.toFixed(2)}`
  }

  const fmtCurrent = fmt(currentPrice)
  const progressPct = evaluation?.progressPct || 0

  return (
    <div className={`border rounded-lg p-4 relative overflow-hidden ${
      pnl?.isProfit
        ? 'border-state-hold/30 bg-state-holdSoft'
        : 'border-state-stop/30 bg-state-stopSoft'
    }`}>
      <div className={`absolute inset-0 pointer-events-none ${
        isShort
          ? 'bg-gradient-to-b from-state-stopSoft via-transparent to-transparent'
          : 'bg-gradient-to-t from-state-holdSoft via-transparent to-transparent'
      }`} />
      <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-7xl font-black pointer-events-none select-none opacity-[0.04] ${
        isShort ? 'text-state-stop' : 'text-state-hold'
      }`}>
        {isShort ? '↓' : '↑'}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold px-2 py-0.5 rounded ${
            isShort ? 'bg-state-stopSoft text-state-stop' : 'bg-state-holdSoft text-state-hold'
          }`}>
            {isShort ? '↓ SHORT' : '↑ LONG'}
          </span>
          <span className="text-xs text-text-tertiary">{trade.instrument} × {trade.contracts}</span>
        </div>
        {pnl && (
          <div className={`text-sm font-bold font-price ${pnl.isProfit ? 'text-state-hold' : 'text-state-stop'}`}>
            {pnl.points > 0 ? '+' : ''}{pnl.points.toFixed(2)} pts · {pnl.dollars > 0 ? '+' : ''}${Math.abs(pnl.dollars).toFixed(2)}
          </div>
        )}
      </div>

      <div className="space-y-1.5 mb-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-state-stop font-bold">STOP</span>
          <span className="text-state-stop font-price">{fmt(trade.stop)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-b border-border-subtle py-1">
          <span className="text-text-secondary">Entry</span>
          <span className="text-text-primary font-price font-bold">{fmt(trade.entry)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-accent-price font-bold">▶ NOW</span>
          <span className="text-accent-price font-price font-bold">{fmtCurrent}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-state-hold font-bold">TARGET</span>
          <span className="text-state-hold font-price">{fmt(trade.target)}</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>Progress to target</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-bg-elevated rounded overflow-hidden">
          <div
            className={`h-full rounded transition-all duration-500 ${
              progressPct >= 100 ? 'bg-state-hold' : progressPct >= 50 ? 'bg-state-hold/70' : 'bg-state-info'
            }`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
