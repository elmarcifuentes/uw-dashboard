import { calculateTradeSetup } from '../../utils/tradeSetup'
import { stripMarkdown } from '../../utils/stripMarkdown'

export default function LevelPlanCard({
  level, allLevels, currentPrice, nqRatio,
  activeSymbol, narrative, dpHistory,
  cascade, onEnterTrade,
}) {
  const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
  const isNQ  = activeSymbol === 'NQ'
  const r     = nqRatio || 41.14

  const fmt = (qqq, nq) => isNQ
    ? (nq ?? Math.round(qqq * r * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2 })
    : `$${qqq?.toFixed(2)}`

  const classColor = {
    sell_resistance: 'text-red-400',
    buy_support:     'text-green-400',
    no_edge:         'text-gray-500',
    continuation:    'text-blue-400',
  }[level.classification] || 'text-gray-500'

  const rrColor = !setup ? 'text-gray-500'
    : setup.quality === 'excellent' ? 'text-green-400'
    : setup.quality === 'good'      ? 'text-green-500'
    : setup.quality === 'acceptable' ? 'text-amber-400'
    : 'text-red-400'

  const levelNq = Math.round(level.price * r * 4) / 4

  return (
    <div className="space-y-3">
      {/* Level header */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-bold ${classColor}`}>{level.id}</span>
          <span className="text-white font-mono text-lg">{fmt(level.price, levelNq)}</span>
        </div>
        <div className={`text-xs font-bold mt-0.5 ${classColor}`}>
          {level.classification?.replace('_', ' ').toUpperCase()}
          <span className="text-gray-500 font-normal ml-2">
            · {level.confidence?.toLowerCase()} · score {level.score}
          </span>
        </div>
      </div>

      {/* DP reading */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 w-16 shrink-0">Dark Pool</span>
        <div style={{ flex: 1, minWidth: 0 }} className="h-2 bg-gray-800 rounded relative overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700" />
          {(() => {
            const dp  = level.dark_pool || 0
            const pct = ((dp + 1) / 2) * 100
            return pct >= 50 ? (
              <div className="absolute inset-y-0 left-1/2 bg-green-500" style={{ width: `${(pct - 50) * 2}%` }} />
            ) : (
              <div className="absolute inset-y-0 right-1/2 bg-red-500" style={{ width: `${(50 - pct) * 2}%` }} />
            )
          })()}
        </div>
        <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }} className="text-xs font-mono text-gray-400">
          {level.dark_pool?.toFixed(3)}
        </span>
      </div>

      {/* Trade setup */}
      {setup ? (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-900/50 flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider">📍 Trade Setup</span>
            <span className={`text-xs font-bold font-mono ${rrColor}`}>{setup.rr}:1 {setup.quality}</span>
          </div>

          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Entry</span>
              <span className="text-xs text-white font-mono font-bold">
                {fmt(setup.entry.qqq, setup.entry.nq)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-green-950/30 rounded px-2 py-1">
              <span className="text-xs text-gray-500">
                Target <span className="text-gray-600 ml-1">← {setup.target.level}</span>
              </span>
              <span className="text-xs text-green-400 font-mono font-bold">
                {fmt(setup.target.qqq, setup.target.nq)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-red-950/30 rounded px-2 py-1">
              <span className="text-xs text-gray-500">Stop</span>
              <span className="text-xs text-red-400 font-mono font-bold">
                {fmt(setup.stop.qqq, setup.stop.nq)}
              </span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-gray-800">
              <span className="text-gray-600">
                Move <span className="text-gray-400 font-mono">{isNQ ? `${setup.move.nq} pts` : `$${setup.move.qqq}`}</span>
              </span>
              <span className="text-gray-600">
                Risk <span className="text-gray-400 font-mono">{isNQ ? `${setup.risk.nq} pts` : `$${setup.risk.qqq}`}</span>
              </span>
            </div>
          </div>

          {setup.flags.length > 0 && (
            <div className="px-3 pb-2 space-y-0.5">
              {setup.flags.map((f, i) => (
                <div key={i} className="text-xs text-gray-600">{f}</div>
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
              className="w-full py-2 rounded text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
            >
              → Trade This
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-600 py-2">
          {level.classification === 'no_edge'
            ? 'No trade setup — level has no institutional edge'
            : 'No adjacent level for target'}
        </div>
      )}

      {narrative && (
        <div className="border-t border-gray-800 pt-3">
          <div className="text-xs text-purple-500 mb-1">🤖 Analysis</div>
          <p className="text-xs text-gray-400 leading-relaxed">{stripMarkdown(narrative)}</p>
        </div>
      )}
    </div>
  )
}
