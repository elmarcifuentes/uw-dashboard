import { memo, useState, useRef, useEffect, Fragment } from 'react'
import { dpConditionLabel, midDpWarning } from '../../utils/dpLabels'
import { getLevelProximity, getProximityStyles } from '../../utils/proximity'
import DpSparkline from '../DpSparkline'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { calculateTradeSetup } from '../../utils/tradeSetup'

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

function getClassificationBg(_cls) {
  return 'bg-[#111827]'
}

function getBaseBorderCls(cls) {
  return { buy_support: 'border border-green-900', sell_resistance: 'border border-red-900', no_edge: 'border border-gray-700', continuation: 'border border-purple-900' }[cls] || 'border border-gray-700'
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

export default memo(function PriceLadder({ result, currentPrice, nqRatio, compact, dpHistory = {}, scoredAt, levelNarratives = {}, levelTouches = {}, onSelect, selectedLevel }) {
  const [expandedLevel, setExpandedLevel] = useState(null)
  const [flashLevel, setFlashLevel]       = useState(null)
  const prevPriceRef = useRef(currentPrice)
  const sorted = result ? [...result.levels].sort((a, b) => b.price - a.price) : []

  useEffect(() => {
    if (!currentPrice || !prevPriceRef.current || !sorted.length) return
    const prev = prevPriceRef.current
    sorted.forEach(level => {
      const crossed = (prev < level.price && currentPrice >= level.price) ||
                      (prev >= level.price && currentPrice < level.price)
      if (crossed) {
        setFlashLevel(level.id)
        setTimeout(() => setFlashLevel(null), 3000)
      }
    })
    prevPriceRef.current = currentPrice
  }, [currentPrice])

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Waiting for first rescore…
      </div>
    )
  }

  const cp = currentPrice != null ? Number(currentPrice) : null

  const criticalLevel = cp != null
    ? sorted.find(l => Math.abs(cp - l.price) <= 0.15)
    : null

  return (
    <div className="flex flex-col gap-1.5">

      {result.cascade?.active && (
        <div className="bg-red-900/50 border border-red-500 rounded px-3 py-2 text-red-300 text-sm animate-pulse">
          ⚠ CASCADE ACTIVE — no institutional floor below MID
        </div>
      )}

      <StructureBreakBar sb={result.structure_break} currentPrice={cp} />

      {/* Price above all levels */}
      {cp != null && !isNaN(cp) && sorted.length > 0 && cp > sorted[0].price && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 h-px bg-yellow-400/60" />
          <span className="text-xs text-yellow-400 font-mono font-bold shrink-0 animate-pulse bg-yellow-400/10 px-2 py-0.5 rounded">
            ▶ ${cp.toFixed(2)}{nqRatio ? ` / NQ ${(Math.round(cp * nqRatio * 4) / 4).toLocaleString()}` : ''} — above structure
          </span>
          <div className="flex-1 h-px bg-yellow-400/60" />
        </div>
      )}

      {sorted.map((level, i) => {
        const nextLevel  = sorted[i + 1]
        const colors     = CLASS_COLORS[level.classification] || CLASS_COLORS.no_edge
        const dist       = cp != null ? (cp - level.price) : null
        const distStr    = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
        const nqDist     = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio * 4) / 4 : null
        const nqDistStr  = nqDist != null ? `${dist >= 0 ? '+' : '-'}${nqDist}` : null
        const isAbove    = dist != null && dist > 0
        const isFlashing = flashLevel === level.id

        const proximity = getLevelProximity(cp, level.price)
        const styles    = getProximityStyles(proximity, level.classification, level)
        const isProximate = proximity && proximity.zone !== 'away'
        const borderCls = isProximate ? styles.border : getBaseBorderCls(level.classification)
        const bgCls     = getClassificationBg(level.classification)

        return (
          <Fragment key={level.id}>
          <div className="relative">
          <div
            onClick={() => onSelect?.(level.id)}
            className={`rounded-lg overflow-hidden px-3 py-2 transition-all duration-500 ${borderCls} ${bgCls} ${isProximate ? styles.glow : ''} ${styles.pulse && level.id === criticalLevel?.id ? 'animate-pulse' : ''} ${isFlashing ? 'ring-2 ring-white' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
          >
            {/* Proximity label */}
            {styles.label && (
              <div className={`text-xs font-medium mb-1.5 ${styles.labelColor}`}>{styles.label}</div>
            )}
            {isFlashing && (
              <div className="text-xs text-white font-bold mb-1 animate-bounce">⚡ CROSSED {level.id}</div>
            )}
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
                    / NQ {(Math.round(level.price * result.nq_ratio * 4) / 4).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {level.full_stack  && <span className="text-yellow-400 text-xs font-bold">★</span>}
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

            {/* Layer 1 — Classification label + GEX EXP flag */}
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs font-medium ${colors.text}`}>
                {level.classification === 'buy_support'     ? 'BUY SUPPORT'     :
                 level.classification === 'sell_resistance' ? 'SELL RESISTANCE' :
                 level.classification === 'continuation'    ? 'CONTINUATION'    : 'NO EDGE'}
                {level.confidence && level.confidence !== 'none' && (
                  <span className="text-gray-600 font-normal ml-1">· {level.confidence}</span>
                )}
              </span>
              {level.net_gex != null && level.net_gex < 0 && (
                <span className="text-xs font-mono px-1 rounded bg-red-950 text-red-400 font-bold">
                  GEX ⚠ {((level.net_gex ?? 0) / 1000).toFixed(0)}K EXP
                </span>
              )}
            </div>

            {/* Layer 2 — DP bar (always visible) */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-600 whitespace-nowrap" style={{ minWidth: '64px', flexShrink: 0 }}>Dark Pool</span>
              <div className="h-1.5 bg-gray-800 rounded relative overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
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
              <span className="text-xs font-mono text-gray-400" style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}>
                {level.dark_pool?.toFixed(3)}
              </span>
            </div>

            {/* Layer 2 — expand toggle (non-compact only) */}
            {!compact && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedLevel(expandedLevel === level.id ? null : level.id) }}
                className="w-full text-center text-xs text-gray-600 hover:text-gray-400 mt-1.5 pt-1.5 border-t border-gray-800/50 transition-colors"
              >
                {expandedLevel === level.id ? '▲ less' : '▼ more'}
              </button>
            )}

            {/* Layer 3 — evidence (behind expand) */}
            {expandedLevel === level.id && !compact && (
              <div className="pt-2 space-y-1.5">
                <p className="text-xs text-gray-500 italic">{LEVEL_DESCRIPTIONS[level.classification] || ''}</p>

                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  <span style={{ color: colors.text }}>
                    {level.classification === 'buy_support'    ? 'BUY SUP'  :
                     level.classification === 'sell_resistance' ? 'SELL RES' :
                     level.classification === 'continuation'   ? 'CONT'     : 'NO EDGE'}
                    {' '}{level.score}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    level.confidence === 'high'   ? 'bg-green-900 text-green-300'  :
                    level.confidence === 'medium' ? 'bg-amber-900 text-amber-300'  :
                    level.confidence === 'low'    ? 'bg-red-900/50 text-red-300'   :
                                                    'bg-gray-800 text-gray-500'
                  }`}>
                    {(level.confidence || 'none').toUpperCase()}
                  </span>
                  <span>ETF {level.etf_direction === 'bullish' ? '↑' : level.etf_direction === 'bearish' ? '↓' : '—'}</span>
                  {level.conflict   && <span className="text-amber-400">⚠ conflict</span>}
                  {level.boundary   && <span className="text-orange-400">⚡ boundary</span>}
                  {level.lower_high && <span className="text-purple-400">↙ lower high</span>}
                </div>

                {dpHistory[level.id]?.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600" style={{ minWidth: '64px', flexShrink: 0 }}>DP history</span>
                    <DpSparkline history={dpHistory[level.id]} />
                  </div>
                )}

                <DpTrend levelId={level.id} history={dpHistory[level.id]} compact={false} />

                {(() => {
                  const dc = dpConditionLabel(level.dark_pool, level.type, level.classification)
                  const mw = level.id === 'MID' ? midDpWarning(level.dark_pool) : { show: false }
                  if (!dc.label && !mw.show) return null
                  return (
                    <div className={`text-xs font-bold ${dc.color}`}>
                      {dc.label}
                      <span className="text-gray-600 font-normal ml-1">— {dc.sublabel}</span>
                      {mw.show && <span className={`ml-1 ${mw.color}`}>⚠ {mw.text}</span>}
                    </div>
                  )
                })()}

                {levelTouches[level.id] && (
                  <div className="flex items-center gap-2">
                    {levelTouches[level.id].total_touches > 0 && <span className="text-xs text-gray-500">touched {levelTouches[level.id].total_touches}×</span>}
                    {levelTouches[level.id].crosses > 0 && <span className="text-xs text-amber-500">crossed {levelTouches[level.id].crosses}×</span>}
                  </div>
                )}

                {levelNarratives[level.id] && (
                  <div className="border-t border-gray-700/50 pt-1.5">
                    <div className="flex items-center gap-1 mb-1 text-xs text-purple-400">
                      <svg height="0.85em" width="0.85em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline">
                        <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
                      </svg>
                      <span>Claude Analysis</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed italic border-l-2 border-purple-800 pl-2">
                      {stripMarkdown(levelNarratives[level.id])}
                    </p>
                  </div>
                )}

                {(() => {
                  const levels = result?.levels
                  const setup = calculateTradeSetup(level, levels, currentPrice, nqRatio)
                  if (!setup) return null
                  const rrColor = setup.quality === 'excellent' ? 'text-green-400'
                    : setup.quality === 'good' ? 'text-green-500'
                    : setup.quality === 'acceptable' ? 'text-amber-400'
                    : 'text-red-400'
                  const dirColor = setup.direction === 'short' ? 'text-red-400' : 'text-green-400'
                  return (
                    <div className="border-t border-gray-700/50 pt-2 mt-1">
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
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 text-xs">
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

                {scoredAt && (
                  <div className="flex justify-end">
                    <span className="text-gray-600 text-xs font-mono">{formatTime(scoredAt)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedLevel === level.id && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-1.5 z-10">
              <div className="w-3 h-3 bg-indigo-500 rounded-full opacity-80"/>
            </div>
          )}
          </div>

          {/* Yellow crosshair — between this level and the next */}
          {nextLevel && cp != null && !isNaN(cp) && cp < level.price && cp > nextLevel.price && (
            <div className="flex items-center gap-2 px-2 py-0.5">
              <div className="flex-1 h-px bg-yellow-400/60" />
              <span className="text-xs text-yellow-400 font-mono font-bold shrink-0 bg-yellow-400/10 px-2 py-0.5 rounded">
                ▶ ${cp.toFixed(2)}{nqRatio ? ` / NQ ${(Math.round(cp * nqRatio * 4) / 4).toLocaleString()}` : ''}
              </span>
              <div className="flex-1 h-px bg-yellow-400/60" />
            </div>
          )}
          </Fragment>
        )
      })}

      {/* Price below all levels */}
      {cp != null && !isNaN(cp) && sorted.length > 0 && cp < sorted[sorted.length - 1].price && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 h-px bg-yellow-400/60" />
          <span className="text-xs text-yellow-400 font-mono font-bold shrink-0 animate-pulse bg-yellow-400/10 px-2 py-0.5 rounded">
            ▶ ${cp.toFixed(2)}{nqRatio ? ` / NQ ${(Math.round(cp * nqRatio * 4) / 4).toLocaleString()}` : ''} — below structure
          </span>
          <div className="flex-1 h-px bg-yellow-400/60" />
        </div>
      )}

      {currentPrice != null && (() => {
        const cp = Number(currentPrice)
        if (isNaN(cp)) return null
        const nearest = sorted.length > 0
          ? sorted.reduce((a, b) => Math.abs(cp - a.price) < Math.abs(cp - b.price) ? a : b)
          : null
        const nearDist = nearest ? (cp - nearest.price).toFixed(2) : null
        const nqPrice  = nqRatio ? (Math.round(cp * nqRatio * 4) / 4).toLocaleString() : null
        return (
          <div className="border border-yellow-400/30 rounded-lg px-3 py-2 bg-yellow-400/5 mt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-yellow-400 font-mono font-bold text-sm">
                ▶ QQQ ${cp?.toFixed(2) ?? '—'}
                {nqPrice && <span className="text-yellow-300 ml-2">/ NQ {nqPrice}</span>}
              </span>
              {nearest && nearDist !== null && (
                <span className="text-yellow-300 text-xs font-mono">
                  {parseFloat(nearDist) >= 0 ? '+' : ''}{nearDist}
                  {nqRatio ? ` / ${Math.round(Math.abs(parseFloat(nearDist)) * nqRatio * 4) / 4} NQ` : ''}
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
