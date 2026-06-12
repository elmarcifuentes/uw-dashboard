import { calculateTradeSetup } from '../../utils/tradeSetup'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { formatNarrative } from '../../utils/formatNarrative'
import { levelNq } from '../../utils/levelNq'
import ClassificationChip from '../ClassificationChip'

export default function LevelPlanCard({
  level, allLevels, currentPrice, nqRatio,
  activeSymbol, narrative, dpHistory,
  cascade, onEnterTrade,
}) {
  const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
  const isNQ  = activeSymbol === 'NQ'
  const r     = nqRatio || 41.14

  const fmt = (qqq, nq) => isNQ
    ? '$' + (nq ?? Math.round(qqq * r * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : `$${qqq?.toFixed(2)}`

  // R/R quality is a trade-management axis → state-* tokens (not the bias signal-* tokens).
  const rrColor = !setup ? 'text-text-tertiary'
    : setup.quality === 'excellent' ? 'text-state-hold'
    : setup.quality === 'good'      ? 'text-state-hold'
    : setup.quality === 'acceptable' ? 'text-state-exit'
    : 'text-state-stop'

  const levelNqVal = levelNq(level, r)

  return (
    <div className="space-y-3">
      {/* Level header */}
      <div>
        <div className="flex items-baseline gap-2">
          {/* Structural name = neutral; bias on the chip below */}
          <span className="text-xl font-bold text-text-tertiary">{level.id}</span>
          <span className="text-text-primary font-mono text-lg">{fmt(level.price, levelNqVal)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <ClassificationChip classification={level.classification} confidence={level.confidence} level={level} />
          <span className="text-text-tertiary text-xs font-normal">· score {level.score}</span>
        </div>
      </div>

      {/* DP reading */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted w-16 shrink-0">Dark Pool</span>
        <div style={{ flex: 1, minWidth: 0 }} className="h-2 bg-bg-elevated rounded relative overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-bg-elevated" />
          {(() => {
            const dp  = level.dark_pool || 0
            const pct = ((dp + 1) / 2) * 100
            return pct >= 50 ? (
              <div className="absolute inset-y-0 left-1/2 bg-signal-support" style={{ width: `${(pct - 50) * 2}%` }} />
            ) : (
              <div className="absolute inset-y-0 right-1/2 bg-signal-resistance" style={{ width: `${(50 - pct) * 2}%` }} />
            )
          })()}
        </div>
        <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }} className="text-xs font-mono text-text-secondary">
          {level.dark_pool?.toFixed(3)}
        </span>
      </div>

      {/* Trade setup */}
      {setup ? (
        <div className="border border-border-subtle rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-bg-card2/50 flex items-center justify-between">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">📍 Trade Setup</span>
            <span className={`text-xs font-bold font-mono ${rrColor}`}>{setup.rr}:1 {setup.quality}</span>
          </div>

          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">Entry</span>
              <span className="text-xs text-text-primary font-mono font-bold">
                {fmt(setup.entry.qqq, setup.entry.nq)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-state-holdSoft rounded px-2 py-1">
              <span className="text-xs text-text-tertiary">
                Target <span className="text-text-muted ml-1">← {setup.target.level}</span>
              </span>
              <span className="text-xs text-state-hold font-mono font-bold">
                {fmt(setup.target.qqq, setup.target.nq)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-state-stopSoft rounded px-2 py-1">
              <span className="text-xs text-text-tertiary">Stop</span>
              <span className="text-xs text-state-stop font-mono font-bold">
                {fmt(setup.stop.qqq, setup.stop.nq)}
              </span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-border-subtle">
              <span className="text-text-muted">
                Move <span className="text-text-secondary font-mono">{isNQ ? `${setup.move.nq} pts` : `$${setup.move.qqq}`}</span>
              </span>
              <span className="text-text-muted">
                Risk <span className="text-text-secondary font-mono">{isNQ ? `${setup.risk.nq} pts` : `$${setup.risk.qqq}`}</span>
              </span>
            </div>
          </div>

          {setup.flags.length > 0 && (
            <div className="px-3 pb-2 space-y-0.5">
              {setup.flags.map((f, i) => (
                <div key={i} className="text-xs text-text-muted">{f}</div>
              ))}
            </div>
          )}

          <div className="px-3 pb-3">
            <button
              onClick={() => onEnterTrade?.({
                direction:   setup.direction,
                entry:       isNQ ? setup.entry.nq  : setup.entry.qqq,
                target:      isNQ ? setup.target.nq : setup.target.qqq,
                stop:        isNQ ? setup.stop.nq   : setup.stop.qqq,
                entryLevel:  level.id,
                targetLevel: setup.target.level,
                priceUnit:   activeSymbol,
              })}
              className="w-full py-2 rounded text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-text-primary transition-colors"
            >
              → Trade This
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-muted py-2">
          {level.classification === 'no_edge'
            ? 'No trade setup — level has no institutional edge'
            : 'No adjacent level for target'}
        </div>
      )}

      {narrative && (
        <div className="border-t border-border-subtle pt-3">
          <div className="text-xs text-purple-500 mb-1">🤖 Analysis</div>
          <p className="text-xs text-text-secondary leading-relaxed">{formatNarrative(stripMarkdown(narrative), activeSymbol)}</p>
        </div>
      )}
    </div>
  )
}
