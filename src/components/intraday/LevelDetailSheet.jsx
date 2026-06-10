import DpSparkline from '../DpSparkline'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { formatNarrative } from '../../utils/formatNarrative'

export default function LevelDetailSheet({ levelId, levels, currentPrice, nqRatio, dpHistory, levelNarrative, onClose, activeSymbol = 'NQ' }) {
  const level = levels?.find(l => l.id === levelId)
  if (!level) return null

  const nq   = nqRatio ? Math.round(level.price * nqRatio).toLocaleString() : null
  const dist = currentPrice != null ? (currentPrice - level.price).toFixed(2) : null
  const dp   = level.dark_pool ?? 0
  const dpPct = ((dp + 1) / 2) * 100

  const classColor = level.classification === 'sell_resistance' ? 'text-red-400'
    : level.classification === 'buy_support' ? 'text-green-400'
    : 'text-gray-400'

  const barColor = level.classification === 'sell_resistance' ? 'bg-red-500'
    : level.classification === 'buy_support' ? 'bg-green-500'
    : 'bg-gray-600'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${classColor}`}>{level.id}</span>
            <span className="text-white font-mono text-xl">${level.price?.toFixed(2)}</span>
          </div>
          {nq && <div className="text-xs text-gray-500 font-mono mt-0.5">NQ {nq}</div>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg px-2 py-0.5 -mr-1">✕</button>
      </div>

      {/* Classification + Distance */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${classColor}`}>
          {level.classification?.replace('_', ' ').toUpperCase() || 'NO EDGE'}
          {level.confidence && level.confidence !== 'NONE' && (
            <span className="text-gray-600 font-normal text-xs ml-2">{level.confidence}</span>
          )}
        </span>
        {dist != null && (
          <span className="text-sm font-mono text-gray-300">
            {parseFloat(dist) > 0 ? '+' : ''}{dist} from price
          </span>
        )}
      </div>

      {/* Dark Pool bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Dark Pool</span>
          <span className="font-mono text-gray-400">{dp.toFixed(3)}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded relative overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-gray-600" />
          {dpPct >= 50 ? (
            <div className="absolute inset-y-0 left-1/2 bg-green-500 opacity-80"
                 style={{ width: `${(dpPct - 50) * 2}%` }} />
          ) : (
            <div className="absolute inset-y-0 right-1/2 bg-red-500 opacity-80"
                 style={{ width: `${(50 - dpPct) * 2}%` }} />
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Score</span>
          <span className="font-mono text-gray-400">{level.score || 0}/100</span>
        </div>
        <div className="h-2 bg-gray-800 rounded overflow-hidden">
          <div className={`h-full ${barColor} opacity-80`}
               style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
        </div>
      </div>

      {/* DP Sparkline */}
      {dpHistory?.[level.id]?.length > 1 && (
        <div>
          <div className="text-xs text-gray-600 mb-1">DP trend</div>
          <DpSparkline history={dpHistory[level.id]} />
        </div>
      )}

      {/* Flags */}
      {(level.full_stack || level.conflict || level.boundary) && (
        <div className="flex gap-2 flex-wrap">
          {level.full_stack && <span className="text-xs text-yellow-400 font-bold">★ FULL STACK</span>}
          {level.conflict   && <span className="text-xs text-orange-400">⚠ conflict</span>}
          {level.boundary   && <span className="text-xs text-purple-400">◈ boundary</span>}
        </div>
      )}

      {/* Claude narrative */}
      {levelNarrative && (
        <div className="border-t border-gray-800 pt-3">
          <div className="text-xs text-purple-500 mb-2">🤖 Claude Analysis</div>
          <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-purple-900 pl-2">
            {formatNarrative(stripMarkdown(levelNarrative), activeSymbol)}
          </p>
        </div>
      )}
    </div>
  )
}
