import { memo, useState } from 'react'
import { dpConditionLabel, midDpWarning } from '../../utils/dpLabels'

const LEVEL_DESCRIPTIONS = {
  buy_support:     'Institutional buying below — price expected to be drawn upward',
  sell_resistance: 'Institutional supply above — price expected to struggle or reject',
  no_edge:         'Insufficient signal — no directional read',
  continuation:    'Momentum continuation — weak opposing data at level',
}

const CLASS_COLORS = {
  buy_support:     { border: '#1A7A4A', bg: '#0a2418', text: '#4ade80' },
  sell_resistance: { border: '#C0392B', bg: '#2a0a0a', text: '#f87171' },
  no_edge:         { border: '#6B7280', bg: '#111827', text: '#9ca3af' },
  continuation:    { border: '#7C3AED', bg: '#1a1040', text: '#a78bfa' },
}

function StructureBreakBar({ sb, currentPrice }) {
  if (!sb) return null
  const toR2 = sb.distance_to_r2
  const toS2 = sb.distance_to_s2
  const active   = sb.active ?? false
  const imminent = !active && ((toR2 != null && toR2 <= 0.50) || (toS2 != null && toS2 <= 0.50))

  let cls  = 'bg-gray-800 border-gray-700 text-gray-400'
  let text = `R2 $${toR2?.toFixed(2) ?? '—'} away  |  S2 $${toS2?.toFixed(2) ?? '—'} away`

  if (imminent) {
    cls  = 'bg-amber-900/50 border-amber-600 text-amber-300'
    text = toR2 != null && toR2 <= 0.50
      ? `⚠ R2 $${toR2.toFixed(2)} — BREAK IMMINENT`
      : `⚠ S2 $${toS2.toFixed(2)} — BREAK IMMINENT`
  }
  if (active) {
    const dir = sb.direction === 'upside' ? '▲' : '▼'
    const ext = sb.r3 ? ` — ${sb.direction === 'upside' ? 'R3' : 'S3'}: $${sb.r3}` : ''
    cls  = 'bg-red-900/50 border-red-600 text-red-300'
    text = `⚠ STRUCTURE BREAK ${dir} ${sb.direction?.toUpperCase() ?? ''}${ext}`
  }

  return (
    <div className={`px-3 py-1.5 rounded border text-sm font-medium mb-1 ${cls}`}>
      {text}
      {active && sb.r3 && currentPrice != null && (
        <span className="text-red-300 text-xs ml-2">
          · ${Math.abs(Number(currentPrice) - sb.r3).toFixed(2)} to S3
        </span>
      )}
    </div>
  )
}

function DpTrend({ levelId, history, compact }) {
  if (!history || history.length < 2) return null
  const last = history[history.length - 1].value
  const prev = history[history.length - 2].value
  const diff = last - prev
  const trend = Math.abs(diff) < 0.050 ? 'stable' : diff < 0 ? 'declining' : 'improving'

  if (compact) {
    return (
      <span className={`text-xs font-mono ml-1 ${
        trend === 'declining' ? 'text-red-400' : trend === 'improving' ? 'text-green-400' : 'text-gray-500'
      }`}>
        {trend === 'declining' ? '↓' : trend === 'improving' ? '↑' : '→'}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      <div className="flex items-center gap-0.5 text-xs font-mono">
        {history.map((h, i) => (
          <span key={i}>
            <span className={
              h.value <= -0.700 ? 'text-red-400' :
              h.value <= -0.300 ? 'text-amber-400' :
              h.value >= 0.300  ? 'text-green-400' :
              'text-gray-500'
            }>{h.value.toFixed(2)}</span>
            {i < history.length - 1 && <span className="text-gray-700"> → </span>}
          </span>
        ))}
      </div>
      <span className={`text-xs font-bold ${
        trend === 'declining' ? 'text-red-400' : trend === 'improving' ? 'text-green-400' : 'text-gray-500'
      }`}>
        {trend === 'declining' ? '↓' : trend === 'improving' ? '↑' : '→'}
      </span>
      {levelId === 'MID' && last <= -0.500 && trend === 'declining' && (
        <span className="text-amber-400 text-xs">⚠ approaching cascade</span>
      )}
    </div>
  )
}

const formatTime = (iso) => {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/New_York',
  }) + ' ET'
}

export default memo(function PriceLadder({ result, currentPrice, nqRatio, compact, dpHistory = {}, scoredAt, levelNarratives = {} }) {
  const [expandedLevel, setExpandedLevel] = useState(null)

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Waiting for first rescore…
      </div>
    )
  }

  const levels = [...result.levels].sort((a, b) => b.price - a.price)

  return (
    <div className="flex flex-col gap-1.5">

      {result.cascade?.active && (
        <div className="bg-red-900/50 border border-red-500 rounded px-3 py-2 text-red-300 text-sm animate-pulse">
          ⚠ CASCADE ACTIVE — no institutional floor below MID
        </div>
      )}

      <StructureBreakBar sb={result.structure_break} currentPrice={currentPrice} />

      {levels.map(level => {
        const colors   = CLASS_COLORS[level.classification] || CLASS_COLORS.no_edge
        const dist       = currentPrice != null ? (currentPrice - level.price) : null
        const distStr    = dist != null ? (dist >= 0 ? `+${dist?.toFixed(2) ?? '—'}` : dist?.toFixed(2)) : null
        const nqDist     = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio) : null
        const nqDistStr  = nqDist != null ? `${dist >= 0 ? '+' : '-'}${nqDist}` : null
        const isNear     = dist != null && Math.abs(dist) <= 0.50
        const isAbove    = dist != null && dist > 0

        return (
          <div
            key={level.id}
            style={{ borderColor: colors.border, backgroundColor: colors.bg }}
            className={`border rounded px-3 py-2 transition-all ${isNear ? 'ring-1 ring-yellow-400' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm w-8" style={{ color: colors.text }}>
                  {level.id}
                </span>
                <span className="text-white font-mono font-medium">
                  ${level.price?.toFixed(2) ?? '—'}
                </span>
                {result.nq_ratio && (
                  <span className="text-gray-400 font-mono font-medium">
                    / NQ {Math.round(level.price * result.nq_ratio).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {level.full_stack  && <span className="text-yellow-400 text-xs font-bold">★</span>}
                {level.conflict    && <span className="text-amber-400 text-xs">⚠</span>}
                {level.boundary    && <span className="text-orange-400 text-xs">⚡</span>}
                {level.lower_high  && <span className="text-purple-400 text-xs">↙</span>}
                {distStr != null && (
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-mono tabular-nums ${isAbove ? 'text-green-400' : 'text-red-400'}`}>
                      {distStr}
                    </span>
                    {nqDistStr && (
                      <span className={`text-xs font-mono tabular-nums ${isAbove ? 'text-green-300' : 'text-red-300'}`}>
                        {nqDistStr} NQ
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!compact && (
              <p className="text-xs text-gray-500 italic mt-1">
                {LEVEL_DESCRIPTIONS[level.classification] || ''}
              </p>
            )}

            {!compact && (
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span style={{ color: colors.text }}>
                  {level.classification === 'buy_support'    ? 'BUY SUP'  :
                   level.classification === 'sell_resistance' ? 'SELL RES' :
                   level.classification === 'continuation'   ? 'CONT'     : 'NO EDGE'}
                  {' '}{level.score}
                </span>
                <span>
                  DP {level.dark_pool >= 0.3 ? '↑' : level.dark_pool <= -0.3 ? '↓' : '—'}{' '}
                  {level.dark_pool?.toFixed(3)}
                </span>
                <span>
                  ETF {level.etf_direction === 'bullish' ? '↑' : level.etf_direction === 'bearish' ? '↓' : '—'}
                </span>
                {level.net_gex != null && (() => {
                  const isExp = level.net_gex < 0
                  return (
                    <span className={`text-xs font-mono px-1 rounded ${isExp ? 'bg-red-950 text-red-400 font-bold' : 'text-gray-500'}`}>
                      GEX {isExp ? '⚠ ' : ''}{((level.net_gex ?? 0) / 1000).toFixed(0)}K{isExp ? ' EXP' : ' pin'}
                    </span>
                  )
                })()}
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  level.confidence === 'high'   ? 'bg-green-900 text-green-300'  :
                  level.confidence === 'medium' ? 'bg-amber-900 text-amber-300'  :
                  level.confidence === 'low'    ? 'bg-red-900/50 text-red-300'   :
                                                  'bg-gray-800 text-gray-500'
                }`}>
                  {(level.confidence || 'none').toUpperCase()}
                </span>
              </div>
            )}

            <DpTrend levelId={level.id} history={dpHistory[level.id]} compact={compact} />

            {(() => {
              const dc = dpConditionLabel(level.dark_pool, level.type, level.classification)
              const mw = level.id === 'MID' ? midDpWarning(level.dark_pool) : { show: false }
              return (
                <div className={`text-xs font-bold ${dc.color} mt-0.5`}>
                  {dc.label}
                  {!compact && (
                    <span className="text-gray-600 font-normal ml-1">— {dc.sublabel}</span>
                  )}
                  {mw.show && (
                    <span className={`ml-1 ${mw.color}`}>⚠ {mw.text}</span>
                  )}
                </div>
              )
            })()}
            {scoredAt && (
              <div className="flex justify-end mt-1">
                <span className="text-gray-600 text-xs font-mono">{formatTime(scoredAt)}</span>
              </div>
            )}

            {/* Claude level analysis */}
            {!compact && levelNarratives[level.id] && (
              <div className="mt-1.5 border-t border-gray-700/50 pt-1.5">
                <button
                  onClick={() => setExpandedLevel(expandedLevel === level.id ? null : level.id)}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <span>{expandedLevel === level.id ? '▼' : '▶'}</span>
                  <svg height="0.85em" width="0.85em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline">
                    <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
                  </svg>
                  <span>Claude Analysis</span>
                </button>
                {expandedLevel === level.id && (
                  <p className="text-xs text-gray-300 mt-1.5 leading-relaxed italic border-l-2 border-purple-800 pl-2">
                    {levelNarratives[level.id]}
                  </p>
                )}
              </div>
            )}
            {compact && levelNarratives[level.id] && (
              <span className="text-xs text-purple-500 ml-1" title="Claude Analysis available — switch to full mode">
                <svg height="0.75em" width="0.75em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline">
                  <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
        )
      })}

      {currentPrice != null && (() => {
        const cp = Number(currentPrice)
        if (isNaN(cp)) return null
        const nearest = levels.length > 0
          ? levels.reduce((a, b) => Math.abs(cp - a.price) < Math.abs(cp - b.price) ? a : b)
          : null
        const nearDist = nearest ? (cp - nearest.price).toFixed(2) : null
        const nqPrice  = nqRatio ? Math.round(cp * nqRatio).toLocaleString() : null
        return (
          <div className="border-2 border-yellow-400 rounded px-3 py-2 bg-yellow-950 mt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-yellow-400 font-mono font-bold text-sm">
                ▶ QQQ ${cp?.toFixed(2) ?? '—'}
                {nqPrice && <span className="text-yellow-300 ml-2">/ NQ {nqPrice}</span>}
              </span>
              {nearest && nearDist !== null && (
                <span className="text-yellow-300 text-xs font-mono">
                  {parseFloat(nearDist) >= 0 ? '+' : ''}{nearDist}
                  {nqRatio ? ` / ${Math.round(Math.abs(parseFloat(nearDist)) * nqRatio)} NQ` : ''}
                  {' '}from {nearest.id}
                </span>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
})
