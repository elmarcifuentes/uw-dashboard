import { useState, useEffect, useMemo } from 'react'
import DpSparkline from '../DpSparkline'

export default function RightRail({
  levels, currentPrice, nqRatio, cascade, dpHistory, levelNarratives,
}) {
  const [activeLevel, setActiveLevel] = useState(null)
  const [userSelected, setUserSelected] = useState(false)

  const nearestLevelId = useMemo(() => {
    if (!levels?.length || !currentPrice) return null
    return levels.reduce((nearest, l) => {
      const d  = Math.abs(currentPrice - l.price)
      const nd = Math.abs(currentPrice - nearest.price)
      return d < nd ? l : nearest
    }).id
  }, [currentPrice, levels])

  useEffect(() => {
    if (!userSelected && nearestLevelId) {
      setActiveLevel(nearestLevelId)
    }
  }, [nearestLevelId, userSelected])

  const mid   = levels?.find(l => l.id === 'MID')
  const midDp = mid?.dark_pool ?? 0
  const gap   = Math.abs(-0.700 - midDp)

  const activeLevelData = activeLevel ? levels?.find(l => l.id === activeLevel) : null

  return (
    <div className="space-y-3">

      {/* Cascade summary */}
      <div className={`border rounded-lg p-3 ${
        cascade?.active
          ? 'border-red-800 bg-red-950/20'
          : midDp <= -0.500
          ? 'border-amber-800/50 bg-amber-950/10'
          : 'border-gray-800 bg-[#111827]'
      }`}>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Cascade Monitor</div>
        <div className={`text-sm font-bold mb-1 ${
          cascade?.active ? 'text-red-400'
            : midDp <= -0.500 ? 'text-amber-400'
            : 'text-green-400'
        }`}>
          {cascade?.active ? '⚠ ACTIVE' : midDp <= -0.500 ? '⚡ APPROACHING' : '✓ SAFE'}
        </div>
        <div className="text-xs text-gray-400 font-mono">MID dp {midDp.toFixed(3)}</div>
        {!cascade?.active && (
          <div className={`text-xs font-mono mt-0.5 ${midDp <= -0.500 ? 'text-amber-400' : 'text-gray-600'}`}>
            {gap.toFixed(3)} from trigger
          </div>
        )}
      </div>

      {/* Level selector + evidence detail */}
      <div className="border border-gray-800 bg-[#111827] rounded-lg p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Level Evidence</div>

        {/* Level buttons */}
        <div className="flex gap-1 mb-3">
          {levels?.map(level => (
            <button
              key={level.id}
              onClick={() => {
                setUserSelected(true)
                setActiveLevel(activeLevel === level.id ? null : level.id)
              }}
              className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${
                activeLevel === level.id
                  ? level.classification === 'sell_resistance' ? 'bg-red-800 text-white'
                    : level.classification === 'buy_support' ? 'bg-green-800 text-white'
                    : 'bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {level.id}
            </button>
          ))}
        </div>

        {/* Selected level detail */}
        {activeLevelData ? (
          <div className="space-y-2">
            {/* Price + distance */}
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-white">
                ${activeLevelData.price?.toFixed(2)}
                {nqRatio && (
                  <span className="text-xs text-gray-500 ml-1">
                    NQ {Math.round(activeLevelData.price * nqRatio).toLocaleString()}
                  </span>
                )}
              </span>
              {currentPrice != null && (
                <span className="text-xs font-mono text-gray-400">
                  {(currentPrice - activeLevelData.price) >= 0 ? '+' : ''}
                  {(currentPrice - activeLevelData.price).toFixed(2)}
                </span>
              )}
            </div>

            {/* Dark Pool bar */}
            <div className="flex items-center gap-2">
              <span style={{ minWidth: '64px', flexShrink: 0 }}
                    className="text-xs text-gray-600 whitespace-nowrap">
                Dark Pool
              </span>
              <div style={{ flex: 1, minWidth: 0 }}
                   className="h-1.5 bg-gray-800 rounded relative overflow-hidden">
                <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700 z-10" />
                {(() => {
                  const dp  = activeLevelData.dark_pool || 0
                  const pct = ((dp + 1) / 2) * 100
                  return pct >= 50 ? (
                    <div className="absolute inset-y-0 left-1/2 bg-green-500"
                         style={{ width: `${(pct - 50) * 2}%` }} />
                  ) : (
                    <div className="absolute inset-y-0 right-1/2 bg-red-500"
                         style={{ width: `${(50 - pct) * 2}%` }} />
                  )
                })()}
              </div>
              <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                    className="text-xs font-mono text-gray-400">
                {activeLevelData.dark_pool?.toFixed(3)}
              </span>
            </div>

            {/* Sparkline */}
            {dpHistory?.[activeLevelData.id]?.length > 1 && (
              <div style={{ marginLeft: '72px' }}>
                <DpSparkline history={dpHistory[activeLevelData.id]} />
              </div>
            )}

            {/* Score bar */}
            <div className="flex items-center gap-2">
              <span style={{ minWidth: '64px', flexShrink: 0 }}
                    className="text-xs text-gray-600 whitespace-nowrap">
                Score
              </span>
              <div style={{ flex: 1, minWidth: 0 }}
                   className="h-1.5 bg-gray-800 rounded overflow-hidden">
                <div className={`h-full ${
                  activeLevelData.classification === 'sell_resistance' ? 'bg-red-500'
                    : activeLevelData.classification === 'buy_support' ? 'bg-green-500'
                    : 'bg-gray-600'
                }`}
                     style={{ width: `${Math.min(activeLevelData.score || 0, 100)}%` }} />
              </div>
              <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                    className="text-xs font-mono text-gray-400">
                {activeLevelData.score || 0}/100
              </span>
            </div>

            {/* Classification */}
            <div className={`text-xs font-medium ${
              activeLevelData.classification === 'sell_resistance' ? 'text-red-400'
                : activeLevelData.classification === 'buy_support' ? 'text-green-400'
                : 'text-gray-500'
            }`}>
              {activeLevelData.classification?.replace('_', ' ').toUpperCase()}
              {activeLevelData.confidence && activeLevelData.confidence.toLowerCase() !== 'none' && (
                <span className="text-gray-600 font-normal ml-1">
                  · {activeLevelData.confidence.toLowerCase()}
                </span>
              )}
            </div>

            {/* Full stack */}
            {activeLevelData.full_stack && (
              <div className="text-xs text-yellow-400 font-bold">★ FULL STACK</div>
            )}

            {/* Claude narrative */}
            {levelNarratives?.[activeLevelData.id] && (
              <div className="border-t border-gray-800 pt-2 mt-1">
                <p className="text-xs text-gray-300 leading-relaxed italic border-l-2 border-purple-900 pl-2">
                  {levelNarratives[activeLevelData.id]}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-700 text-center py-2">Select a level to see evidence</p>
        )}
      </div>

      {/* Active signals summary */}
      <div className="border border-gray-800 bg-[#111827] rounded-lg p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Signals</div>
        <div className="space-y-1">
          {levels?.filter(l => l.classification !== 'no_edge').map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold shrink-0 ${
                l.classification === 'sell_resistance' ? 'text-red-400' : 'text-green-400'
              }`}>
                {l.id}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {l.classification?.replace('_', ' ')}
              </span>
              <span className="text-xs font-mono text-gray-600 shrink-0">
                DP {l.dark_pool?.toFixed(3)}
              </span>
            </div>
          ))}
          {!levels?.some(l => l.classification !== 'no_edge') && (
            <p className="text-xs text-gray-700">No classified levels</p>
          )}
        </div>
      </div>
    </div>
  )
}
