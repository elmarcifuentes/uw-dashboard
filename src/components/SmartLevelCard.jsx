import { useState } from 'react'
import DpSparkline from './DpSparkline'
import { stripMarkdown } from '../utils/stripMarkdown'

const CLS_COLOR  = { sell_resistance: 'text-red-400',   buy_support: 'text-green-400',  no_edge: 'text-gray-400',  continuation: 'text-blue-400'  }
const CLS_BORDER = { sell_resistance: 'border-red-900',  buy_support: 'border-green-900', no_edge: 'border-gray-800', continuation: 'border-blue-900' }

export default function SmartLevelCard({ level, currentPrice, nqRatio, narrative, dpHistory, variant = 'standard', label, touches }) {
  const [expanded, setExpanded] = useState(false)

  if (!level) return (
    <div className="bg-[#111827] border border-gray-800/50 rounded-lg p-4">
      {label && (
        <div className="text-xs text-gray-600 uppercase tracking-wider mb-3">
          {label}
        </div>
      )}
      <div className="flex items-center gap-2 py-2">
        <span className="w-2 h-2 rounded-full bg-gray-800" />
        <span className="text-xs text-gray-700">No active level</span>
      </div>
    </div>
  )

  const nq        = nqRatio ? Math.round(level.price * nqRatio) : null
  const dist      = currentPrice != null ? (currentPrice - level.price) : null
  const distStr   = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
  const distNq    = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio) : null
  const clsCls    = level.classification || 'no_edge'
  const textColor = CLS_COLOR[clsCls]  || CLS_COLOR.no_edge
  const borderCls = CLS_BORDER[clsCls] || CLS_BORDER.no_edge

  if (variant === 'compact') return (
    <div className={`border rounded-lg p-3 bg-[#111827] ${borderCls}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${textColor}`}>{level.id}</span>
        <span className="text-xs font-mono text-white">${level.price?.toFixed(2)}</span>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{clsCls.replace('_', ' ').toUpperCase()}</div>
      {distStr && <div className="text-xs text-gray-600 mt-1">{distStr}{distNq ? ` / ${distNq} NQ` : ''}</div>}
    </div>
  )

  return (
    <div className={`border rounded-lg bg-[#111827] ${borderCls} overflow-hidden`}>

      {/* Label badge */}
      {label && (
        <div className="px-4 pt-3 pb-0">
          <span className="text-xs text-gray-600 uppercase tracking-wider">
            {label}
          </span>
        </div>
      )}

      {/* Header — level ID + price + distance */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${textColor}`}>{level.id}</span>
            <span className="text-white font-mono font-semibold text-lg">
              ${level.price?.toFixed(2)}
            </span>
          </div>
          {nq && (
            <div className="text-xs text-gray-500 font-mono mt-0.5">
              NQ {nq.toLocaleString()}
            </div>
          )}
          <div className={`text-xs font-medium mt-1 ${textColor}`}>
            {level.classification?.replace('_', ' ').toUpperCase()}
            {level.confidence && level.confidence.toLowerCase() !== 'none' && (
              <span className="text-gray-500 font-normal ml-1.5">
                {level.confidence.toLowerCase()}
              </span>
            )}
          </div>
        </div>

        {/* Distance — right side */}
        {distStr && (
          <div className="text-right shrink-0">
            <div className="text-base font-mono font-bold text-gray-300">{distStr}</div>
            {distNq && (
              <div className="text-xs text-gray-600 font-mono">{distNq} NQ</div>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-gray-800/60" />

      {/* Evidence bars */}
      <div className="px-4 py-3 space-y-2">

        {/* Dark Pool row */}
        <div className="flex items-center gap-2 mb-2">
          <span style={{ minWidth: '64px', flexShrink: 0 }}
                className="text-xs text-gray-600 whitespace-nowrap">
            Dark Pool
          </span>
          <div style={{ flex: 1, minWidth: 0 }}
               className="h-1.5 bg-gray-800 rounded overflow-hidden relative">
            <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700 z-10" />
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
                className="text-xs font-mono text-gray-400 whitespace-nowrap">
            {level.dark_pool?.toFixed(3)}
          </span>
        </div>

        {/* Score row */}
        <div className="flex items-center gap-2">
          <span style={{ minWidth: '64px', flexShrink: 0 }}
                className="text-xs text-gray-600 whitespace-nowrap">
            Score
          </span>
          <div style={{ flex: 1, minWidth: 0 }}
               className="h-1.5 bg-gray-800 rounded overflow-hidden">
            <div className={`h-full rounded ${
              level.classification === 'sell_resistance' ? 'bg-red-500'
                : level.classification === 'buy_support' ? 'bg-green-500'
                : 'bg-gray-600'
            }`}
                 style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
          </div>
          <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                className="text-xs font-mono text-gray-400 whitespace-nowrap">
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
              : 'text-gray-500'
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
          <span className="text-xs text-gray-600">touched {touches.total_touches}×</span>
          {touches.crosses > 0 && (
            <span className="text-xs text-amber-600">crossed {touches.crosses}×</span>
          )}
        </div>
      )}

      {/* Claude Analysis expander */}
      {narrative && (
        <div className="border-t border-gray-800/50 px-4 py-2.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-400 transition-colors w-full"
          >
            <span className="text-purple-600">{expanded ? '▼' : '▶'}</span>
            <span>🤖 Claude Analysis</span>
          </button>
          {expanded && (
            <p className="text-xs text-gray-300 mt-2 leading-relaxed italic border-l-2 border-purple-900 pl-2">
              {stripMarkdown(narrative)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
