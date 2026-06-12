import { getLevelProximity } from '../../utils/proximity'
import { levelNq } from '../../utils/levelNq'
import ClassificationChip from '../ClassificationChip'

export default function LevelMap({ levels, currentPrice, nqRatio, activeSymbol, onLevelSelect, selectedLevel }) {
  if (!levels?.length) return null

  const sorted = [...levels].sort((a, b) => b.price - a.price)
  const r = nqRatio || 41.14

  // nqOverride = canonical stored NQ for a level (pass for level rows; omit for raw prices)
  const fmt = (p, nqOverride) => activeSymbol === 'NQ'
    ? ((nqOverride != null ? nqOverride : Math.round(p * r * 4) / 4)).toLocaleString('en-US', { minimumFractionDigits: 2 })
    : `$${p?.toFixed(2)}`

  const fmtCurrent = currentPrice != null
    ? activeSymbol === 'NQ'
      ? (Math.round(currentPrice * r * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2 })
      : `$${currentPrice.toFixed(2)}`
    : '—'

  // Score bar tracks scored bias (the action). Structural id renders neutral; bias on the chip.
  const barColor = (level) => ({
    sell_resistance: 'bg-signal-resistance',
    buy_support:     'bg-signal-support',
    continuation:    'bg-signal-continuation',
    no_edge:         'bg-bg-elevated',
  }[level.classification] || 'bg-bg-elevated')

  const barWidth = (level) =>
    level.classification === 'no_edge' ? 15 : Math.max(20, Math.min(100, level.score || 0))

  return (
    <div className="space-y-1 font-mono text-xs">
      {sorted.map((level, i) => {
        const isSelected  = selectedLevel === level.id
        const proximity   = getLevelProximity(currentPrice, level.price)
        const isNear      = proximity?.zone === 'critical' || proximity?.zone === 'near'
        const nextLevel   = sorted[i + 1]
        const priceIsHere = nextLevel && currentPrice != null &&
          currentPrice < level.price && currentPrice > nextLevel.price

        return (
          <div key={level.id}>
            <button
              onClick={() => onLevelSelect(level.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-left ${
                isSelected
                  ? 'bg-indigo-900/40 border border-indigo-700'
                  : 'hover:bg-bg-elevated/50'
              }`}
            >
              <span className="w-8 shrink-0 font-bold text-text-tertiary">{level.id}</span>
              <span className="shrink-0"><ClassificationChip classification={level.classification} confidence={level.confidence} level={level} size="xs" showConflict={false} /></span>
              <span className="w-24 shrink-0 text-text-primary">{fmt(level.price, levelNq(level, r))}</span>
              <div className="flex-1 h-3 bg-bg-card2 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${barColor(level)}`}
                  style={{ width: `${barWidth(level)}%`, opacity: isNear ? 1 : 0.6 }}
                />
              </div>
              <span className={`w-12 text-right shrink-0 ${
                level.classification === 'no_edge' ? 'text-text-disabled' : 'text-text-secondary'
              }`}>
                {level.classification === 'no_edge' ? '—' : level.score}
              </span>
            </button>

            {priceIsHere && (
              <div className="flex items-center gap-2 py-0.5 px-2">
                <div className="flex-1 h-px bg-yellow-400/40" />
                <span className="text-yellow-400 text-xs font-bold shrink-0">▶ {fmtCurrent}</span>
                <div className="flex-1 h-px bg-yellow-400/40" />
              </div>
            )}
          </div>
        )
      })}

      {/* Price above all levels */}
      {currentPrice != null && sorted.length > 0 && currentPrice > sorted[0].price && (
        <div className="flex items-center gap-2 py-0.5 px-2">
          <div className="flex-1 h-px bg-yellow-400/40" />
          <span className="text-yellow-400 text-xs font-bold shrink-0">▶ {fmtCurrent} — above structure</span>
          <div className="flex-1 h-px bg-yellow-400/40" />
        </div>
      )}

      {/* Price below all levels */}
      {currentPrice != null && sorted.length > 0 && currentPrice < sorted[sorted.length - 1].price && (
        <div className="flex items-center gap-2 py-0.5 px-2">
          <div className="flex-1 h-px bg-yellow-400/40" />
          <span className="text-yellow-400 text-xs font-bold shrink-0">▶ {fmtCurrent} — below structure</span>
          <div className="flex-1 h-px bg-yellow-400/40" />
        </div>
      )}
    </div>
  )
}
