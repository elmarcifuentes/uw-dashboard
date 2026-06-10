import { formatNarrative } from '../../utils/formatNarrative'

export default function ThesisBar({
  sentiment, levels, cascade, assistantRead, currentPrice, nqRatio, activeSymbol = 'NQ'
}) {
  const dominant = levels
    ?.filter(l => l.classification !== 'no_edge')
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0]

  const mid   = levels?.find(l => l.id === 'MID')
  const midDp = mid?.dark_pool || 0
  const gap   = Math.abs(-0.700 - midDp)

  const nq = p => nqRatio ? ` (NQ ${Math.round(p * nqRatio).toLocaleString()})` : ''

  const riskText = cascade?.active
    ? 'CASCADE ACTIVE'
    : midDp <= -0.500
    ? `MID dp ${midDp.toFixed(3)} — ${gap.toFixed(3)} from cascade`
    : 'Structure intact'

  const riskColor = cascade?.active
    ? 'text-red-400'
    : midDp <= -0.500
    ? 'text-amber-400'
    : 'text-green-400'

  const sentimentColor = sentiment?.color === 'green' ? 'text-green-400'
    : sentiment?.color === 'red' ? 'text-red-400'
    : 'text-amber-400'

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto">

        {/* Sentiment */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${
            sentiment?.color === 'green' ? 'bg-green-500'
              : sentiment?.color === 'red' ? 'bg-red-500'
              : 'bg-amber-500'
          } ${sentiment?.state === 'HIGH_RISK' && !cascade?.active ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold ${sentimentColor}`}>
            {sentiment?.state || 'MIXED'}
          </span>
        </div>

        <span className="text-text-disabled shrink-0">|</span>

        {/* Dominant level */}
        {dominant && (
          <>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-text-tertiary">Key level</span>
              <span className={`text-sm font-bold ${
                dominant.classification === 'sell_resistance' ? 'text-red-400'
                  : dominant.classification === 'buy_support' ? 'text-green-400'
                  : 'text-text-secondary'
              }`}>
                {dominant.id}
              </span>
              <span className="text-xs text-text-primary font-mono">
                {activeSymbol === 'NQ' && nqRatio
                  ? '$' + (Math.round(dominant.price * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '$' + (dominant.price?.toFixed(2) ?? '—')}
              </span>
              {dominant.full_stack && (
                <span className="text-xs text-yellow-400 font-bold">★</span>
              )}
            </div>
            <span className="text-text-disabled shrink-0">|</span>
          </>
        )}

        {/* Risk */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-text-tertiary">Risk</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            cascade?.active
              ? 'bg-red-950 text-red-400 border border-red-800'
              : midDp <= -0.500
              ? 'bg-amber-950 text-amber-400 border border-amber-800'
              : 'text-text-tertiary'
          }`}>
            {riskText}
          </span>
        </div>

        <span className="text-text-disabled shrink-0">|</span>

        {/* One-sentence setup */}
        {assistantRead?.now && (
          <p className="text-xs text-text-secondary truncate min-w-0">{formatNarrative(assistantRead.now, activeSymbol)}</p>
        )}
      </div>
    </div>
  )
}
