import { calculateTradeSetup } from '../../utils/tradeSetup'

export default function TradeSetupCard({ level, allLevels, currentPrice, nqRatio, activeSymbol = 'QQQ' }) {
  const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
  if (!setup) return null

  const isNQ = activeSymbol === 'NQ'

  const fmtPrice = (qqq, nq) => {
    if (isNQ) {
      const val = nq ?? (qqq != null && nqRatio ? Math.round(qqq * nqRatio * 4) / 4 : null)
      if (val == null) return '—'
      return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return qqq != null ? `$${qqq.toFixed(2)}` : '—'
  }

  const rrColor     = setup.quality === 'excellent' ? 'text-green-400' : setup.quality === 'good' ? 'text-green-500' : setup.quality === 'acceptable' ? 'text-amber-400' : 'text-red-400'
  const dirColor    = setup.direction === 'short' ? 'text-red-400' : 'text-green-400'
  const borderColor = level.classification === 'sell_resistance' ? 'border-red-900/50' : 'border-green-900/50'

  return (
    <div className={`bg-bg-card border rounded-lg p-4 ${borderColor}`}>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${dirColor}`}>{level.id}</span>
          <span className={`text-xs font-bold uppercase ${dirColor}`}>{setup.direction}</span>
          <span className="text-text-muted text-xs">
            {level.classification?.replace('_', ' ')} · {level.confidence}
          </span>
        </div>
        <span className={`text-sm font-bold font-mono ${rrColor}`}>
          {setup.rr}:1
          <span className="text-xs font-normal ml-1">{setup.quality}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-bg-card2/50 rounded p-2">
          <div className="text-xs text-text-muted mb-1">Entry</div>
          <div className="text-sm font-mono font-bold text-text-primary">{fmtPrice(setup.entry.qqq, setup.entry.nq)}</div>
          <div className="text-xs text-text-disabled mt-0.5">{setup.entry.level}</div>
        </div>

        <div className="bg-green-950/30 border border-green-900/30 rounded p-2">
          <div className="text-xs text-text-muted mb-1">Target</div>
          <div className="text-sm font-mono font-bold text-green-400">{fmtPrice(setup.target.qqq, setup.target.nq)}</div>
          <div className="text-xs text-text-disabled mt-0.5">{setup.target.level}</div>
        </div>

        <div className="bg-red-950/30 border border-red-900/30 rounded p-2">
          <div className="text-xs text-text-muted mb-1">Stop</div>
          <div className="text-sm font-mono font-bold text-red-400">{fmtPrice(setup.stop.qqq, setup.stop.nq)}</div>
        </div>
      </div>

      <div className="flex gap-4 text-xs border-t border-border-subtle pt-2">
        <div>
          <span className="text-text-muted">Move </span>
          <span className="text-text-primary font-mono">
            {isNQ ? `${setup.move.nq ?? '—'} pts` : `$${setup.move.qqq}`}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Risk </span>
          <span className="text-text-primary font-mono">
            {isNQ ? `${setup.risk.nq ?? '—'} pts` : `$${setup.risk.qqq}`}
          </span>
        </div>
      </div>

      {setup.flags.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-subtle space-y-0.5">
          {setup.flags.map((f, i) => (
            <div key={i} className="text-xs text-text-tertiary">{f}</div>
          ))}
        </div>
      )}
    </div>
  )
}
