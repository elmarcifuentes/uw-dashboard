import { memo, useState, useRef, useEffect, Fragment } from 'react'
import { levelNq } from '../../utils/levelNq'
import { dpConditionLabel, midDpWarning } from '../../utils/dpLabels'
import { getLevelProximity, getProximityStyles } from '../../utils/proximity'
import { CASCADE_TRIGGER, CASCADE_WATCH } from '../../utils/cascade'
import DpSparkline from '../DpSparkline'
import ClassificationChip from '../ClassificationChip'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { calculateTradeSetup } from '../../utils/tradeSetup'
import { formatNarrative } from '../../utils/formatNarrative'

const LEVEL_DESCRIPTIONS = {
  buy_support:     'Institutional buying below — price expected to be drawn upward',
  sell_resistance: 'Institutional supply above — price expected to struggle or reject',
  no_edge:         'Insufficient signal — no directional read',
  continuation:    'Momentum continuation — weak opposing data at level',
}

const CLASS_COLORS = {
  buy_support:     { border: '#2fd47a', bg: '#08111f', text: '#2fd47a' },
  sell_resistance: { border: '#ff6b6b', bg: '#08111f', text: '#ff6b6b' },
  no_edge:         { border: '#7b8ba8', bg: '#08111f', text: '#7b8ba8' },
  continuation:    { border: '#5ba7ff', bg: '#08111f', text: '#5ba7ff' },
}

function getClassificationBg(_cls) {
  return 'bg-bg-card'
}

function getBaseBorderCls(cls) {
  return {
    buy_support:     'border border-signal-support/40',
    sell_resistance: 'border border-signal-resistance/40',
    no_edge:         'border border-border-default',
    continuation:    'border border-signal-continuation/40',
  }[cls] || 'border border-border-default'
}

function StructureBreakBar({ sb, currentPrice, nqRatio, activeSymbol = 'NQ' }) {
  if (!sb) return null
  const toR2 = sb.distance_to_r2
  const toS2 = sb.distance_to_s2
  const active   = sb.active ?? false
  const imminent = !active && ((toR2 != null && toR2 <= 0.50) || (toS2 != null && toS2 <= 0.50))
  const isNQ = activeSymbol === 'NQ'

  const fmtDist = (d) => {
    if (d == null) return '—'
    const val = isNQ && nqRatio ? Math.round(d * nqRatio * 4) / 4 : d
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  let cls  = 'bg-bg-elevated border-border-default text-text-secondary'
  let text = `R2 ${fmtDist(toR2)} away  |  S2 ${fmtDist(toS2)} away`

  if (imminent) {
    cls  = 'bg-state-cascadeWatchSoft border-state-cascadeWatch text-state-cascadeWatch'
    text = toR2 != null && toR2 <= 0.50
      ? `⚠ R2 ${fmtDist(toR2)} — BREAK IMMINENT`
      : `⚠ S2 ${fmtDist(toS2)} — BREAK IMMINENT`
  }
  if (active) {
    const dir = sb.direction === 'upside' ? '▲' : '▼'
    const ext = sb.r3 ? ` — ${sb.direction === 'upside' ? 'R3' : 'S3'}: ${isNQ && nqRatio ? `NQ ${(Math.round(sb.r3 * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `$${sb.r3}`}` : ''
    cls  = 'bg-state-stopSoft border-state-stop text-state-stop'
    text = `⚠ STRUCTURE BREAK ${dir} ${sb.direction?.toUpperCase() ?? ''}${ext}`
  }

  return (
    <div className={`px-3 py-1.5 rounded border text-sm font-medium mb-1 ${cls}`}>
      {text}
      {active && sb.r3 && currentPrice != null && (
        <span className="text-state-stop/80 text-xs ml-2">
          · {fmtDist(Math.abs(isNQ && nqRatio ? (Number(currentPrice) - sb.r3) * nqRatio : Number(currentPrice) - sb.r3))} to S3
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
      <span className={`text-xs font-price ml-1 ${
        trend === 'declining' ? 'text-signal-resistance' : trend === 'improving' ? 'text-signal-support' : 'text-text-tertiary'
      }`}>
        {trend === 'declining' ? '↓' : trend === 'improving' ? '↑' : '→'}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      <div className="flex items-center gap-0.5 text-xs font-price">
        {history.map((h, i) => (
          <span key={i}>
            <span className={
              h.value <= CASCADE_TRIGGER ? 'text-signal-resistance' :
              h.value <= -0.300 ? 'text-state-cascadeWatch' :
              h.value >= 0.300  ? 'text-signal-support' :
              'text-text-tertiary'
            }>{h.value.toFixed(2)}</span>
            {i < history.length - 1 && <span className="text-text-disabled"> → </span>}
          </span>
        ))}
      </div>
      <span className={`text-xs font-bold ${
        trend === 'declining' ? 'text-signal-resistance' : trend === 'improving' ? 'text-signal-support' : 'text-text-tertiary'
      }`}>
        {trend === 'declining' ? '↓' : trend === 'improving' ? '↑' : '→'}
      </span>
      {levelId === 'MID' && last <= CASCADE_WATCH && trend === 'declining' && (
        <span className="text-state-cascadeWatch text-xs">⚠ approaching cascade</span>
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

function getLevelTier(level) {
  if (level.full_stack || level.confidence === 'high') return 1
  if (level.classification !== 'no_edge' && ((level.score || 0) >= 60 || level.confidence === 'medium')) return 2
  return 3
}

export default memo(function PriceLadder({ result, currentPrice, nqRatio, compact, dpHistory = {}, scoredAt, levelNarratives = {}, levelTouches = {}, onSelect, selectedLevel, activeSymbol = 'NQ' }) {
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
      <div className="flex items-center justify-center h-64 text-text-tertiary text-sm">
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
        <div className="bg-state-stopSoft border border-state-stop rounded px-3 py-2 text-state-stop text-sm animate-pulse">
          ⚠ CASCADE ACTIVE — no institutional floor below MID
        </div>
      )}

      <StructureBreakBar sb={result.structure_break} currentPrice={cp} nqRatio={nqRatio} activeSymbol={activeSymbol} />

      {cp != null && !isNaN(cp) && sorted.length > 0 && cp > sorted[0].price && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 h-px bg-accent-price/60" />
          <span className="text-xs text-accent-price font-price font-bold shrink-0 animate-pulse bg-accent-price/10 px-2 py-0.5 rounded">
            {activeSymbol === 'NQ' && nqRatio
              ? `▶ $${(Math.round(cp * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — above structure`
              : `▶ $${cp.toFixed(2)} — above structure`}
          </span>
          <div className="flex-1 h-px bg-accent-price/60" />
        </div>
      )}

      {sorted.map((level, i) => {
        const nextLevel  = sorted[i + 1]
        const colors     = CLASS_COLORS[level.classification] || CLASS_COLORS.no_edge
        const tier       = getLevelTier(level)
        const dist       = cp != null ? (cp - level.price) : null
        const nqDist     = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio * 4) / 4 : null
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
            className={`rounded-lg overflow-hidden px-3 py-2 transition-all duration-500 ${borderCls} ${bgCls} ${isProximate ? styles.glow : ''} ${styles.pulse && level.id === criticalLevel?.id ? 'animate-pulse' : ''} ${isFlashing ? 'ring-2 ring-text-primary/60' : ''} ${onSelect ? 'cursor-pointer' : ''} ${tier === 3 ? 'opacity-60 hover:opacity-100' : ''} ${tier === 1 ? 'shadow-card' : ''}`}
            style={tier === 1 ? { borderLeftWidth: '4px', borderLeftColor: colors.border } : undefined}
          >
            {styles.label && (
              <div className={`text-xs font-medium mb-1.5 ${styles.labelColor}`}>{styles.label}</div>
            )}
            {isFlashing && (
              <div className="text-xs text-text-primary font-bold mb-1 animate-bounce">⚡ CROSSED {level.id}</div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Structural name = informational only → neutral, never an action color */}
                <span className="font-price font-bold text-sm w-8 text-text-tertiary">
                  {level.id}
                </span>
                <span className="text-text-primary font-price font-medium">
                  {activeSymbol === 'NQ' && nqRatio
                    ? '$' + (levelNq(level, nqRatio)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '$' + (level.price?.toFixed(2) ?? '—')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {level.full_stack  && <span className="text-accent-price text-xs font-bold">★</span>}
                {(() => {
                  if (activeSymbol === 'NQ') {
                    if (nqDist == null) return null
                    const sign = dist >= 0 ? '+' : '-'
                    return <span className="text-xs font-price tabular-nums text-text-secondary">{sign}${nqDist.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  } else {
                    if (dist == null) return null
                    const sign = dist >= 0 ? '+' : '-'
                    return <span className="text-xs font-price tabular-nums text-text-secondary">{sign}${Math.abs(dist).toFixed(2)}</span>
                  }
                })()}
              </div>
            </div>

            <div className="flex items-center justify-between mt-1 gap-2">
              {/* Scored bias = the action (dominant). Conflict tag rides the chip in neutral. */}
              <ClassificationChip classification={level.classification} confidence={level.confidence} level={level} />
            </div>

            {tier !== 3 && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-text-muted whitespace-nowrap" style={{ minWidth: '64px', flexShrink: 0 }}>Dark Pool</span>
                <div className="h-1.5 bg-bg-elevated rounded relative overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-text-disabled z-10" />
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
                <span className="text-xs font-price text-text-secondary" style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}>
                  {level.dark_pool?.toFixed(3)}
                </span>
              </div>
            )}

            {tier === 1 && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-text-muted whitespace-nowrap" style={{ minWidth: '64px', flexShrink: 0 }}>Score</span>
                <div className="h-1.5 bg-bg-elevated rounded overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
                  <div className={`h-full ${
                    level.classification === 'sell_resistance' ? 'bg-signal-resistance'
                      : level.classification === 'buy_support' ? 'bg-signal-support'
                      : 'bg-signal-neutral'
                  }`} style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
                </div>
                <span className="text-xs font-price text-text-secondary" style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}>
                  {level.score || 0}/100
                </span>
              </div>
            )}

            {!compact && tier !== 3 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedLevel(expandedLevel === level.id ? null : level.id) }}
                className="w-full text-center text-xs text-text-muted hover:text-text-secondary mt-1.5 pt-1.5 border-t border-border-subtle/50 transition-colors"
              >
                {expandedLevel === level.id ? '▲ less' : '▼ more'}
              </button>
            )}

            {expandedLevel === level.id && !compact && (
              <div className="pt-2 space-y-1.5">
                <p className="text-xs text-text-tertiary italic">{LEVEL_DESCRIPTIONS[level.classification] || ''}</p>

                <div className="flex items-center gap-3 text-xs text-text-secondary flex-wrap">
                  <span style={{ color: colors.text }}>
                    {level.classification === 'buy_support'    ? 'BUY SUP'  :
                     level.classification === 'sell_resistance' ? 'SELL RES' :
                     level.classification === 'continuation'   ? 'CONT'     : 'NO EDGE'}
                    {' '}{level.score}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    level.confidence === 'high'   ? 'bg-signal-supportSoft text-signal-support'  :
                    level.confidence === 'medium' ? 'bg-state-exitSoft text-state-exit'          :
                    level.confidence === 'low'    ? 'bg-signal-resistanceSoft text-signal-resistance' :
                                                    'bg-bg-elevated text-text-tertiary'
                  }`}>
                    {(level.confidence || 'none').toUpperCase()}
                  </span>
                  <span>ETF {level.etf_direction === 'bullish' ? '↑' : level.etf_direction === 'bearish' ? '↓' : '—'}</span>
                  {level.conflict   && <span className="text-state-cascadeWatch">⚠ conflict</span>}
                  {level.boundary   && <span className="text-accent-price">⚡ boundary</span>}
                  {level.lower_high && <span className="text-accent-ai">↙ lower high</span>}
                </div>

                {dpHistory[level.id]?.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted" style={{ minWidth: '64px', flexShrink: 0 }}>DP history</span>
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
                      <span className="text-text-muted font-normal ml-1">— {dc.sublabel}</span>
                      {mw.show && <span className={`ml-1 ${mw.color}`}>⚠ {mw.text}</span>}
                    </div>
                  )
                })()}

                {levelTouches[level.id] && (
                  <div className="flex items-center gap-2">
                    {levelTouches[level.id].total_touches > 0 && <span className="text-xs text-text-tertiary">touched {levelTouches[level.id].total_touches}×</span>}
                    {levelTouches[level.id].crosses > 0 && <span className="text-xs text-state-cascadeWatch">crossed {levelTouches[level.id].crosses}×</span>}
                  </div>
                )}

                {levelNarratives[level.id] && (
                  <div className="border-t border-border-default/50 pt-1.5">
                    <div className="flex items-center gap-1 mb-1 text-xs text-accent-ai">
                      <svg height="0.85em" width="0.85em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline">
                        <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="currentColor" fillRule="evenodd" />
                      </svg>
                      <span>Claude Analysis</span>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed italic border-l-2 border-accent-ai/50 pl-2">
                      {formatNarrative(stripMarkdown(levelNarratives[level.id]), activeSymbol)}
                    </p>
                  </div>
                )}

                {(() => {
                  const levels = result?.levels
                  const setup = calculateTradeSetup(level, levels, currentPrice, nqRatio)
                  if (!setup) return null
                  const rrColor = setup.quality === 'excellent' ? 'text-signal-support'
                    : setup.quality === 'good' ? 'text-signal-support'
                    : setup.quality === 'acceptable' ? 'text-state-exit'
                    : 'text-signal-resistance'
                  const dirColor = setup.direction === 'short' ? 'text-signal-resistance' : 'text-signal-support'
                  return (
                    <div className="border-t border-border-default/50 pt-2 mt-1">
                      <div className="text-micro text-text-tertiary uppercase tracking-wider mb-2">📍 Trade Setup</div>
                      <div className={`text-xs font-bold mb-2 ${dirColor}`}>
                        {setup.direction.toUpperCase()} from {setup.entry.level}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-muted w-12">Entry</span>
                          <span className="text-text-primary font-price">
                            {activeSymbol === 'NQ'
                              ? (setup.entry.nq ? `NQ ${setup.entry.nq.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')
                              : `$${setup.entry.qqq?.toFixed(2)}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-muted w-12">Target</span>
                          <span className="text-signal-support font-price">
                            {activeSymbol === 'NQ'
                              ? (setup.target.nq ? `NQ ${setup.target.nq.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')
                              : `$${setup.target.qqq?.toFixed(2)}`}
                          </span>
                          <span className="text-text-muted">← {setup.target.level}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-muted w-12">Stop</span>
                          <span className="text-signal-resistance font-price">
                            {activeSymbol === 'NQ'
                              ? (setup.stop.nq ? `NQ ${setup.stop.nq.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')
                              : `$${setup.stop.qqq?.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-default/50 text-xs">
                        <div className="text-text-muted">Move <span className="text-text-secondary font-price">
                          {activeSymbol === 'NQ' ? (setup.move.nq ? `${setup.move.nq} NQ` : '—') : `$${setup.move.qqq}`}
                        </span></div>
                        <div className="text-text-muted">Risk <span className="text-text-secondary font-price">
                          {activeSymbol === 'NQ' ? (setup.risk.nq ? `${setup.risk.nq} NQ` : '—') : `$${setup.risk.qqq}`}
                        </span></div>
                        <div className={`font-price font-bold ${rrColor}`}>{setup.rr}:1</div>
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
                            <div key={i} className="text-xs text-text-muted">{f}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {scoredAt && (
                  <div className="flex justify-end">
                    <span className="text-text-muted text-xs font-price">{formatTime(scoredAt)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedLevel === level.id && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-1.5 z-10">
              <div className="w-3 h-3 bg-signal-continuation rounded-full opacity-80"/>
            </div>
          )}
          </div>

          {nextLevel && cp != null && !isNaN(cp) && cp < level.price && cp > nextLevel.price && (
            <div className="flex items-center gap-2 px-2 py-0.5">
              <div className="flex-1 h-px bg-accent-price/60" />
              <span className="text-xs text-accent-price font-price font-bold shrink-0 bg-accent-price/10 px-2 py-0.5 rounded">
                {activeSymbol === 'NQ' && nqRatio
                  ? `▶ $${(Math.round(cp * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `▶ $${cp.toFixed(2)}`}
              </span>
              <div className="flex-1 h-px bg-accent-price/60" />
            </div>
          )}

          </Fragment>
        )
      })}

      {cp != null && !isNaN(cp) && sorted.length > 0 && cp < sorted[sorted.length - 1].price && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 h-px bg-accent-price/60" />
          <span className="text-xs text-accent-price font-price font-bold shrink-0 animate-pulse bg-accent-price/10 px-2 py-0.5 rounded">
            {activeSymbol === 'NQ' && nqRatio
              ? `▶ $${(Math.round(cp * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — below structure`
              : `▶ $${cp.toFixed(2)} — below structure`}
          </span>
          <div className="flex-1 h-px bg-accent-price/60" />
        </div>
      )}

      {currentPrice != null && (() => {
        const cp = Number(currentPrice)
        if (isNaN(cp)) return null
        const nearest = sorted.length > 0
          ? sorted.reduce((a, b) => Math.abs(cp - a.price) < Math.abs(cp - b.price) ? a : b)
          : null
        const nearDist = nearest ? (cp - nearest.price).toFixed(2) : null
        return (
          <div className="border border-accent-price/30 rounded-lg px-3 py-2 bg-accent-price/5 mt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-accent-price font-price font-bold text-sm">
                {activeSymbol === 'NQ' && nqRatio
                  ? `▶ $${(Math.round(cp * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `▶ $${cp?.toFixed(2) ?? '—'}`}
              </span>
              {nearest && nearDist !== null && (
                <span className="text-accent-price/80 text-xs font-price">
                  {(() => {
                    const d = parseFloat(nearDist)
                    const sign = d >= 0 ? '+' : '-'
                    const val = activeSymbol === 'NQ' && nqRatio
                      ? Math.round(Math.abs(d) * nqRatio * 4) / 4
                      : Math.abs(d)
                    return `${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from ${nearest.id}`
                  })()}
                </span>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
})
