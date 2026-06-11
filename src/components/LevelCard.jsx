import { useState } from 'react'
import { getLevelProximity, getProximityStyles } from '../utils/proximity'
import DpSparkline from './DpSparkline'
import { stripMarkdown } from '../utils/stripMarkdown'
import { calculateTradeSetup } from '../utils/tradeSetup'
import { formatNarrative } from '../utils/formatNarrative'
import { levelNq } from '../utils/levelNq'

const CLASS_COLOR = {
  sell_resistance: 'text-signal-resistance',
  buy_support:     'text-signal-support',
  no_edge:         'text-text-tertiary',
  continuation:    'text-signal-continuation',
}

const CLASS_BORDER = {
  sell_resistance: 'border-signal-resistance/30',
  buy_support:     'border-signal-support/30',
  no_edge:         'border-border-subtle',
  continuation:    'border-signal-continuation/30',
}

const TIER1_BORDER_COLOR = {
  sell_resistance: '#ff6b6b',
  buy_support:     '#2fd47a',
  continuation:    '#5ba7ff',
  no_edge:         '#7b8ba8',
}

function getLevelTier(level) {
  if (level.classification === 'no_edge') return 3
  const conf = (level.confidence || '').toLowerCase()
  if (level.full_stack || conf === 'high') return 1
  if (conf === 'medium' || (level.score || 0) >= 60) return 2
  return 3
}

export default function LevelCard({
  level, allLevels, currentPrice, nqRatio,
  dpHistory, levelNarrative, levelTouches,
  onSelect, activeSymbol = 'NQ',
}) {
  const [expanded, setExpanded] = useState(false)

  const nq      = levelNq(level, nqRatio)
  const dist    = currentPrice != null ? (currentPrice - level.price) : null
  const distNq  = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio * 4) / 4 : null

  const classColor  = CLASS_COLOR[level.classification]  || 'text-text-tertiary'
  const borderColor = CLASS_BORDER[level.classification] || 'border-border-subtle'

  const proximity = getLevelProximity(currentPrice, level.price)
  const styles    = getProximityStyles(proximity, level.classification, level)

  const tier = getLevelTier(level)
  const tier1BorderColor = TIER1_BORDER_COLOR[level.classification] || '#7b8ba8'

  return (
    <div
      onClick={() => onSelect?.(level.id)}
      className={`border rounded-lg overflow-hidden transition-all duration-300 ${
        tier === 1 ? 'bg-bg-elevated shadow-elevated' : 'bg-bg-card'
      } ${tier === 3 ? 'opacity-60 hover:opacity-100' : ''} ${
        onSelect ? 'cursor-pointer' : ''
      } ${styles.border || borderColor} ${styles.glow || ''} ${styles.pulse ? 'animate-pulse' : ''}`}
      style={tier === 1 ? { borderLeftWidth: '4px', borderLeftColor: tier1BorderColor } : undefined}
    >
      {/* LAYER 1 — SCAN */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`text-base font-bold shrink-0 ${classColor}`}>{level.id}</span>
          <span className="text-text-primary font-price font-semibold text-sm tabular-nums">
            {activeSymbol === 'NQ'
              ? (nq != null ? '$' + nq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
              : (level.price != null ? '$' + level.price.toFixed(2) : '—')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold ${classColor}`}>
            {level.classification?.replace('_', ' ').toUpperCase()}
          </span>
          {level.confidence && level.confidence.toLowerCase() !== 'none' && (
            <span className="text-xs text-text-muted">· {level.confidence.toLowerCase()}</span>
          )}
        </div>

        <div className="text-right shrink-0">
          {(() => {
            if (activeSymbol === 'NQ') {
              if (distNq == null) return null
              const sign = dist >= 0 ? '+' : '-'
              return <div className="text-sm font-price font-bold text-text-secondary">{sign}${distNq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            } else {
              if (dist == null) return null
              const sign = dist >= 0 ? '+' : '-'
              return <div className="text-sm font-price font-bold text-text-secondary">{sign}${Math.abs(dist).toFixed(2)}</div>
            }
          })()}
        </div>
      </div>

      {/* LAYER 2 — DECISION */}
      <div className="px-4 pb-2.5">
        {styles.label && (
          <div className={`text-xs mb-1.5 ${styles.labelColor}`}>{styles.label}</div>
        )}

        {tier !== 3 && (
          <div className="flex items-center gap-2">
            <span style={{ minWidth: '20px', flexShrink: 0 }} className="text-xs text-text-muted">DP</span>
            <div style={{ flex: 1, minWidth: 0 }} className="h-1.5 bg-bg-elevated rounded relative overflow-hidden">
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
            <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                  className="text-xs font-price text-text-secondary">
              {level.dark_pool?.toFixed(3)}
            </span>
          </div>
        )}

        {tier === 1 && level.score != null && (
          <div className="flex items-center gap-2 mt-1.5">
            <span style={{ minWidth: '20px', flexShrink: 0 }} className="text-xs text-text-muted">SC</span>
            <div style={{ flex: 1, minWidth: 0 }} className="h-1.5 bg-bg-base rounded overflow-hidden">
              <div className={`h-full rounded ${
                level.classification === 'sell_resistance' ? 'bg-signal-resistance'
                  : level.classification === 'buy_support' ? 'bg-signal-support'
                  : 'bg-signal-neutral'
              }`} style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
            </div>
            <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                  className="text-xs font-price text-text-secondary">
              {level.score}/100
            </span>
          </div>
        )}

        {(level.full_stack || (level.net_gex || 0) < 0) && (
          <div className="flex gap-1.5 mt-1.5">
            {level.full_stack && (
              <span className="text-xs text-accent-price font-bold">★ FULL STACK</span>
            )}
            {(level.net_gex || 0) < 0 && (
              <span className="text-xs text-signal-resistance">⚡ EXP</span>
            )}
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <div
        className="border-t border-border-subtle/50 px-4 py-1.5 flex items-center justify-between"
        onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
      >
        <span className="text-xs text-text-disabled hover:text-text-tertiary cursor-pointer">
          {expanded ? '▲ less' : '▼ more'}
        </span>
        <div className="flex items-center gap-2">
          {levelTouches?.total_touches > 0 && (
            <span className="text-xs text-text-disabled">{levelTouches.total_touches}× today</span>
          )}
          {levelNarrative && <span className="text-xs text-accent-ai/60">🤖</span>}
        </div>
      </div>

      {/* LAYER 3 — EVIDENCE */}
      {expanded && (
        <div className="border-t border-border-subtle/50 px-4 py-3 space-y-2 bg-bg-subtle/50">

          {level.dp_condition && (
            <p className={`text-xs font-medium mb-2 ${classColor}`}>{level.dp_condition}</p>
          )}

          <div className="flex items-center gap-2">
            <span style={{ minWidth: '44px', flexShrink: 0 }} className="text-xs text-text-muted whitespace-nowrap">
              Score
            </span>
            <div style={{ flex: 1, minWidth: 0 }} className="h-1.5 bg-bg-elevated rounded overflow-hidden">
              <div className={`h-full rounded ${
                level.classification === 'sell_resistance' ? 'bg-signal-resistance'
                  : level.classification === 'buy_support' ? 'bg-signal-support'
                  : 'bg-signal-neutral'
              }`} style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
            </div>
            <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                  className="text-xs font-price text-text-secondary">
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
              <span className="text-xs bg-signal-supportSoft text-signal-support px-1.5 py-0.5 rounded">↑ ETF</span>
            )}
            {level.etf_direction === 'bearish' && (
              <span className="text-xs bg-signal-resistanceSoft text-signal-resistance px-1.5 py-0.5 rounded">↓ ETF</span>
            )}
            {level.lower_high && (
              <span className="text-xs bg-accent-priceSoft text-accent-price px-1.5 py-0.5 rounded">↘ LH</span>
            )}
          </div>

          {levelTouches?.total_touches > 0 && (
            <div className="flex gap-3 text-xs text-text-muted">
              <span>touched {levelTouches.total_touches}×</span>
              {levelTouches.crosses > 0 && (
                <span className="text-state-cascadeWatch/60">crossed {levelTouches.crosses}×</span>
              )}
            </div>
          )}

          {level.net_gex != null && (
            <div className="text-xs text-text-muted">
              GEX {level.net_gex?.toLocaleString()}
              {(level.net_gex || 0) < 0 ? ' — expansion' : ' — pinning'}
            </div>
          )}

          {levelNarrative && (
            <div className="border-t border-border-subtle pt-2">
              <div className="text-xs text-accent-ai mb-1">🤖 Claude Analysis</div>
              <p className="text-xs text-text-secondary leading-relaxed italic border-l-2 border-accent-ai/50 pl-2">
                {formatNarrative(stripMarkdown(levelNarrative), activeSymbol)}
              </p>
            </div>
          )}

          {(() => {
            const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
            if (!setup) return null
            const rrColor = setup.quality === 'excellent' || setup.quality === 'good'
              ? 'text-signal-support'
              : setup.quality === 'acceptable' ? 'text-state-exit'
              : 'text-signal-resistance'
            const dirColor = setup.direction === 'short' ? 'text-signal-resistance' : 'text-signal-support'
            return (
              <div className="border-t border-border-subtle pt-2 mt-1">
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
                    <span className={`font-price text-signal-support`}>
                      {activeSymbol === 'NQ'
                        ? (setup.target.nq ? `NQ ${setup.target.nq.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')
                        : `$${setup.target.qqq?.toFixed(2)}`}
                    </span>
                    <span className="text-text-muted">← {setup.target.level}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted w-12">Stop</span>
                    <span className={`font-price text-signal-resistance`}>
                      {activeSymbol === 'NQ'
                        ? (setup.stop.nq ? `NQ ${setup.stop.nq.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')
                        : `$${setup.stop.qqq?.toFixed(2)}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle text-xs">
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

          {level.timestamp && (
            <div className="text-xs text-text-disabled text-right">{level.timestamp}</div>
          )}
        </div>
      )}
    </div>
  )
}
