import { useState } from 'react'
import DpSparkline from './DpSparkline'
import { stripMarkdown } from '../utils/stripMarkdown'
import { levelNq } from '../utils/levelNq'
import { formatNarrative } from '../utils/formatNarrative'

const CLS_COLOR  = { sell_resistance: 'text-red-400',   buy_support: 'text-green-400',  no_edge: 'text-text-secondary',  continuation: 'text-blue-400'  }
const CLS_BORDER = { sell_resistance: 'border-red-900',  buy_support: 'border-green-900', no_edge: 'border-border-subtle', continuation: 'border-blue-900' }

export default function SmartLevelCard({ level, currentPrice, nqRatio, narrative, dpHistory, variant = 'standard', label, touches, activeSymbol = 'NQ' }) {
  const [expanded, setExpanded] = useState(false)

  if (!level) return (
    <div className="bg-bg-card border border-border-subtle/50 rounded-lg p-4">
      {label && (
        <div className="text-xs text-text-muted uppercase tracking-wider mb-3">
          {label}
        </div>
      )}
      <div className="flex items-center gap-2 py-2">
        <span className="w-2 h-2 rounded-full bg-bg-elevated" />
        <span className="text-xs text-text-disabled">No active level</span>
      </div>
    </div>
  )

  const nq        = levelNq(level, nqRatio)
  const dist      = currentPrice != null ? (currentPrice - level.price) : null
  const distStr   = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
  const distNq    = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio * 4) / 4 : null
  const clsCls    = level.classification || 'no_edge'
  const textColor = CLS_COLOR[clsCls]  || CLS_COLOR.no_edge
  const borderCls = CLS_BORDER[clsCls] || CLS_BORDER.no_edge

  if (variant === 'compact') return (
    <div className={`border rounded-lg p-3 bg-bg-card ${borderCls}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${textColor}`}>{level.id}</span>
        <span className="text-xs font-mono text-text-primary">
          {activeSymbol === 'NQ'
            ? (nq != null ? '$' + nq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
            : (level.price != null ? '$' + level.price.toFixed(2) : '—')}
        </span>
      </div>
      <div className="text-xs text-text-tertiary mt-0.5">{clsCls.replace('_', ' ').toUpperCase()}</div>
      {(() => {
        if (activeSymbol === 'NQ') {
          if (distNq == null) return null
          const sign = dist >= 0 ? '+' : '-'
          return <div className="text-xs text-text-muted mt-1">{sign}${distNq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        } else {
          if (dist == null) return null
          const sign = dist >= 0 ? '+' : '-'
          return <div className="text-xs text-text-muted mt-1">{sign}${Math.abs(dist).toFixed(2)}</div>
        }
      })()}
    </div>
  )

  return (
    <div className={`border rounded-lg bg-bg-card ${borderCls} overflow-hidden`}>

      {/* Label badge */}
      {label && (
        <div className="px-4 pt-3 pb-0">
          <span className="text-xs text-text-muted uppercase tracking-wider">
            {label}
          </span>
        </div>
      )}

      {/* Header — level ID + price + distance */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${textColor}`}>{level.id}</span>
            <span className="text-text-primary font-mono font-semibold text-lg">
              {activeSymbol === 'NQ'
                ? (nq != null ? '$' + nq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
                : (level.price != null ? '$' + level.price.toFixed(2) : '—')}
            </span>
          </div>
          <div className={`text-xs font-medium mt-1 ${textColor}`}>
            {level.classification?.replace('_', ' ').toUpperCase()}
            {level.confidence && level.confidence.toLowerCase() !== 'none' && (
              <span className="text-text-tertiary font-normal ml-1.5">
                {level.confidence.toLowerCase()}
              </span>
            )}
          </div>
        </div>

        {/* Distance — right side */}
        <div className="text-right shrink-0">
          {(() => {
            if (activeSymbol === 'NQ') {
              if (distNq == null) return null
              const sign = dist >= 0 ? '+' : '-'
              return <div className="text-base font-mono font-bold text-text-secondary">{sign}${distNq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            } else {
              if (dist == null) return null
              const sign = dist >= 0 ? '+' : '-'
              return <div className="text-base font-mono font-bold text-text-secondary">{sign}${Math.abs(dist).toFixed(2)}</div>
            }
          })()}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-border-subtle/60" />

      {/* Evidence bars */}
      <div className="px-4 py-3 space-y-2">

        {/* Dark Pool row */}
        <div className="flex items-center gap-2 mb-2">
          <span style={{ minWidth: '64px', flexShrink: 0 }}
                className="text-xs text-text-muted whitespace-nowrap">
            Dark Pool
          </span>
          <div style={{ flex: 1, minWidth: 0 }}
               className="h-1.5 bg-bg-elevated rounded overflow-hidden relative">
            <div className="absolute inset-y-0 left-1/2 w-px bg-bg-elevated z-10" />
            {(() => {
              const dp  = level.dark_pool || 0
              const pct = ((dp + 1) / 2) * 100
              return pct >= 50 ? (
                <div className="absolute inset-y-0 left-1/2 bg-green-500 rounded-r"
                     style={{ width: `${(pct - 50) * 2}%` }} />
              ) : (
                <div className="absolute inset-y-0 right-1/2 bg-red-500 rounded-l"
                     style={{ width: `${(50 - pct) * 2}%` }} />
              )
            })()}
          </div>
          <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                className="text-xs font-mono text-text-secondary whitespace-nowrap">
            {level.dark_pool?.toFixed(3)}
          </span>
        </div>

        {/* Score row */}
        <div className="flex items-center gap-2">
          <span style={{ minWidth: '64px', flexShrink: 0 }}
                className="text-xs text-text-muted whitespace-nowrap">
            Score
          </span>
          <div style={{ flex: 1, minWidth: 0 }}
               className="h-1.5 bg-bg-elevated rounded overflow-hidden">
            <div className={`h-full rounded ${
              level.classification === 'sell_resistance' ? 'bg-red-500'
                : level.classification === 'buy_support' ? 'bg-green-500'
                : 'bg-bg-card2'
            }`}
                 style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
          </div>
          <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                className="text-xs font-mono text-text-secondary whitespace-nowrap">
            {level.score || 0}/100
          </span>
        </div>

        {/* Sparkline on its own row — not competing for flex space */}
        {dpHistory?.[level.id]?.length > 1 && (
          <div className="mt-1.5" style={{ marginLeft: '72px' }}>
            <DpSparkline history={dpHistory[level.id]} />
          </div>
        )}
      </div>

      {/* dp_condition label */}
      {level.dp_condition && (
        <div className="px-4 pb-2">
          <span className={`text-xs ${
            level.classification === 'sell_resistance' ? 'text-red-400'
              : level.classification === 'buy_support' ? 'text-green-400'
              : 'text-text-tertiary'
          }`}>
            {level.dp_condition}
          </span>
        </div>
      )}

      {/* Full stack flag */}
      {level.full_stack && (
        <div className="px-4 pb-2">
          <span className="text-xs text-yellow-400 font-bold">★ FULL STACK</span>
        </div>
      )}

      {/* Touch counter */}
      {touches?.total_touches > 0 && (
        <div className="px-4 pb-2 flex gap-3">
          <span className="text-xs text-text-muted">touched {touches.total_touches}×</span>
          {touches.crosses > 0 && (
            <span className="text-xs text-amber-600">crossed {touches.crosses}×</span>
          )}
        </div>
      )}

      {/* Claude Analysis expander */}
      {narrative && (
        <div className="border-t border-border-subtle/50 px-4 py-2.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-400 transition-colors w-full"
          >
            <span className="text-purple-600">{expanded ? '▼' : '▶'}</span>
            <span>🤖 Claude Analysis</span>
          </button>
          {expanded && (
            <p className="text-xs text-text-secondary mt-2 leading-relaxed italic border-l-2 border-purple-900 pl-2">
              {formatNarrative(stripMarkdown(narrative), activeSymbol)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
