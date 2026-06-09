import { useState } from 'react'
import { getLevelProximity, getProximityStyles } from '../utils/proximity'
import DpSparkline from './DpSparkline'
import { stripMarkdown } from '../utils/stripMarkdown'
import { calculateTradeSetup } from '../utils/tradeSetup'

const CLASS_COLOR = {
  sell_resistance: 'text-red-400',
  buy_support:     'text-green-400',
  no_edge:         'text-gray-500',
  continuation:    'text-blue-400',
}

const CLASS_BORDER = {
  sell_resistance: 'border-red-900/40',
  buy_support:     'border-green-900/40',
  no_edge:         'border-gray-800',
  continuation:    'border-blue-900/40',
}

export default function LevelCard({
  level, allLevels, currentPrice, nqRatio,
  dpHistory, levelNarrative, levelTouches,
  onSelect,
}) {
  const [expanded, setExpanded] = useState(false)

  const nq      = nqRatio ? Math.round(level.price * nqRatio * 4) / 4 : null
  const dist    = currentPrice != null ? (currentPrice - level.price) : null
  const distStr = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
  const distNq  = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio * 4) / 4 : null

  const classColor  = CLASS_COLOR[level.classification]  || 'text-gray-500'
  const borderColor = CLASS_BORDER[level.classification] || 'border-gray-800'

  const proximity = getLevelProximity(currentPrice, level.price)
  const styles    = getProximityStyles(proximity, level.classification, level)

  return (
    <div
      onClick={() => onSelect?.(level.id)}
      className={`border rounded-lg overflow-hidden bg-[#111827] transition-all duration-300 ${
        onSelect ? 'cursor-pointer' : ''
      } ${styles.border || borderColor} ${styles.glow || ''} ${styles.pulse ? 'animate-pulse' : ''}`}
    >
      {/* LAYER 1 — SCAN */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`text-base font-bold shrink-0 ${classColor}`}>{level.id}</span>
          <span className="text-white font-mono font-semibold text-sm tabular-nums">
            ${level.price?.toFixed(2)}
          </span>
          {nq && (
            <span className="text-xs text-gray-600 font-mono hidden sm:inline">
              NQ {nq.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold ${classColor}`}>
            {level.classification?.replace('_', ' ').toUpperCase()}
          </span>
          {level.confidence && level.confidence.toLowerCase() !== 'none' && (
            <span className="text-xs text-gray-600">· {level.confidence.toLowerCase()}</span>
          )}
        </div>

        <div className="text-right shrink-0">
          {distStr && (
            <div className="text-sm font-mono font-bold text-gray-300">{distStr}</div>
          )}
          {distNq && (
            <div className="text-xs text-gray-600 font-mono">{distNq} NQ</div>
          )}
        </div>
      </div>

      {/* LAYER 2 — DECISION */}
      <div className="px-4 pb-2.5">
        {styles.label && (
          <div className={`text-xs mb-1.5 ${styles.labelColor}`}>{styles.label}</div>
        )}

        <div className="flex items-center gap-2">
          <span style={{ minWidth: '20px', flexShrink: 0 }} className="text-xs text-gray-600">DP</span>
          <div style={{ flex: 1, minWidth: 0 }} className="h-1.5 bg-gray-800 rounded relative overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700 z-10" />
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
          <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                className="text-xs font-mono text-gray-400">
            {level.dark_pool?.toFixed(3)}
          </span>
        </div>

        {(level.full_stack || (level.net_gex || 0) < 0) && (
          <div className="flex gap-1.5 mt-1.5">
            {level.full_stack && (
              <span className="text-xs text-yellow-400 font-bold">★ FULL STACK</span>
            )}
            {(level.net_gex || 0) < 0 && (
              <span className="text-xs text-red-400">⚡ EXP</span>
            )}
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <div
        className="border-t border-gray-800/50 px-4 py-1.5 flex items-center justify-between"
        onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
      >
        <span className="text-xs text-gray-700 hover:text-gray-500 cursor-pointer">
          {expanded ? '▲ less' : '▼ more'}
        </span>
        <div className="flex items-center gap-2">
          {levelTouches?.total_touches > 0 && (
            <span className="text-xs text-gray-700">{levelTouches.total_touches}× today</span>
          )}
          {levelNarrative && <span className="text-xs text-purple-700">🤖</span>}
        </div>
      </div>

      {/* LAYER 3 — EVIDENCE */}
      {expanded && (
        <div className="border-t border-gray-800/50 px-4 py-3 space-y-2 bg-[#0d1424]/50">

          {level.dp_condition && (
            <p className={`text-xs font-medium mb-2 ${classColor}`}>{level.dp_condition}</p>
          )}

          <div className="flex items-center gap-2">
            <span style={{ minWidth: '44px', flexShrink: 0 }} className="text-xs text-gray-600 whitespace-nowrap">
              Score
            </span>
            <div style={{ flex: 1, minWidth: 0 }} className="h-1.5 bg-gray-800 rounded overflow-hidden">
              <div className={`h-full rounded ${
                level.classification === 'sell_resistance' ? 'bg-red-500'
                  : level.classification === 'buy_support' ? 'bg-green-500'
                  : 'bg-gray-600'
              }`} style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
            </div>
            <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                  className="text-xs font-mono text-gray-400">
              {level.score || 0}/100
            </span>
          </div>

          {dpHistory?.[level.id]?.length > 1 && (
            <div style={{ marginLeft: '52px' }}>
              <DpSparkline history={dpHistory[level.id]} />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {level.etf_direction === 'bullish' && (
              <span className="text-xs bg-green-950 text-green-400 px-1.5 py-0.5 rounded">↑ ETF</span>
            )}
            {level.etf_direction === 'bearish' && (
              <span className="text-xs bg-red-950 text-red-400 px-1.5 py-0.5 rounded">↓ ETF</span>
            )}
            {level.lower_high && (
              <span className="text-xs bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded">↘ LH</span>
            )}
          </div>

          {levelTouches?.total_touches > 0 && (
            <div className="flex gap-3 text-xs text-gray-600">
              <span>touched {levelTouches.total_touches}×</span>
              {levelTouches.crosses > 0 && (
                <span className="text-amber-700">crossed {levelTouches.crosses}×</span>
              )}
            </div>
          )}

          {level.net_gex != null && (
            <div className="text-xs text-gray-600">
              GEX {level.net_gex?.toLocaleString()}
              {(level.net_gex || 0) < 0 ? ' — expansion' : ' — pinning'}
            </div>
          )}

          {levelNarrative && (
            <div className="border-t border-gray-800 pt-2">
              <div className="text-xs text-purple-600 mb-1">🤖 Claude Analysis</div>
              <p className="text-xs text-gray-300 leading-relaxed italic border-l-2 border-purple-900 pl-2">
                {stripMarkdown(levelNarrative)}
              </p>
            </div>
          )}

          {(() => {
            const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
            if (!setup) return null
            const rrColor = setup.quality === 'excellent' ? 'text-green-400'
              : setup.quality === 'good' ? 'text-green-500'
              : setup.quality === 'acceptable' ? 'text-amber-400'
              : 'text-red-400'
            const dirColor = setup.direction === 'short' ? 'text-red-400' : 'text-green-400'
            return (
              <div className="border-t border-gray-800 pt-2 mt-1">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">📍 Trade Setup</div>
                <div className={`text-xs font-bold mb-2 ${dirColor}`}>
                  {setup.direction.toUpperCase()} from {setup.entry.level}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 w-12">Entry</span>
                    <span className="text-white font-mono">${setup.entry.qqq?.toFixed(2)}</span>
                    {setup.entry.nq && <span className="text-gray-500 font-mono">NQ {setup.entry.nq.toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 w-12">Target</span>
                    <span className="text-green-400 font-mono">${setup.target.qqq?.toFixed(2)}</span>
                    {setup.target.nq && <span className="text-green-600 font-mono">NQ {setup.target.nq.toLocaleString()}</span>}
                    <span className="text-gray-600">← {setup.target.level}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 w-12">Stop</span>
                    <span className="text-red-400 font-mono">${setup.stop.qqq?.toFixed(2)}</span>
                    {setup.stop.nq && <span className="text-red-600 font-mono">NQ {setup.stop.nq.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800 text-xs">
                  <div className="text-gray-600">Move <span className="text-gray-400 font-mono">${setup.move.qqq}{setup.move.nq ? ` / ${setup.move.nq} NQ` : ''}</span></div>
                  <div className="text-gray-600">Risk <span className="text-gray-400 font-mono">${setup.risk.qqq}{setup.risk.nq ? ` / ${setup.risk.nq} NQ` : ''}</span></div>
                  <div className={`font-mono font-bold ${rrColor}`}>{setup.rr}:1</div>
                </div>
                <div className={`text-xs mt-1 ${rrColor}`}>
                  {setup.quality === 'excellent' && '✅ Excellent R/R'}
                  {setup.quality === 'good'      && '✅ Good R/R'}
                  {setup.quality === 'acceptable' && '⚠ Acceptable R/R'}
                  {setup.quality === 'poor'      && '✗ Poor R/R — consider skip'}
                </div>
                {setup.flags.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {setup.flags.map((f, i) => (
                      <div key={i} className="text-xs text-gray-600">{f}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {level.timestamp && (
            <div className="text-xs text-gray-700 text-right">{level.timestamp}</div>
          )}
        </div>
      )}
    </div>
  )
}
