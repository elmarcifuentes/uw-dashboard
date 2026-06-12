import { formatNarrative } from '../../utils/formatNarrative'
import { levelNq } from '../../utils/levelNq'
import ClassificationChip from '../ClassificationChip'
import { CASCADE_TRIGGER, CASCADE_WATCH } from '../../utils/cascade'

export default function ThesisBar({
  sentiment, levels, cascade, assistantRead, currentPrice, nqRatio, activeSymbol = 'NQ'
}) {
  const dominant = levels
    ?.filter(l => l.classification !== 'no_edge')
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0]

  const mid   = levels?.find(l => l.id === 'MID')
  const midDp = mid?.dark_pool || 0
  const gap   = Math.abs(CASCADE_TRIGGER - midDp)

  const nq = p => nqRatio ? ` (NQ ${Math.round(p * nqRatio).toLocaleString()})` : ''

  const riskText = cascade?.active
    ? 'CASCADE ACTIVE'
    : midDp <= CASCADE_WATCH
    ? `MID dp ${midDp.toFixed(3)} — ${gap.toFixed(3)} from cascade`
    : 'Structure intact'

  // Sentiment is a market-state axis → state-* tokens (not the bias signal-* tokens).
  const sentimentColor = sentiment?.color === 'green' ? 'text-state-hold'
    : sentiment?.color === 'red' ? 'text-state-stop'
    : 'text-state-cascadeWatch'

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto">

        {/* Sentiment */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${
            sentiment?.color === 'green' ? 'bg-state-hold'
              : sentiment?.color === 'red' ? 'bg-state-stop'
              : 'bg-state-cascadeWatch'
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
              <span className="text-sm font-bold text-text-tertiary">{dominant.id}</span>
              <ClassificationChip classification={dominant.classification} confidence={dominant.confidence} level={dominant} size="xs" showConflict={false} />
              <span className="text-xs text-text-primary font-mono">
                {activeSymbol === 'NQ' && nqRatio
                  ? '$' + (levelNq(dominant, nqRatio)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '$' + (dominant.price?.toFixed(2) ?? '—')}
              </span>
              {dominant.full_stack && (
                <span className="text-xs text-accent-price font-bold">★</span>
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
              ? 'bg-state-stopSoft text-state-stop border border-state-stop/40'
              : midDp <= CASCADE_WATCH
              ? 'bg-state-cascadeWatchSoft text-state-cascadeWatch border border-state-cascadeWatch/40'
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
