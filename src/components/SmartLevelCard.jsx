import { useState } from 'react'
import DpSparkline from './DpSparkline'

const CLS_COLOR  = { sell_resistance: 'text-red-400',   buy_support: 'text-green-400',  no_edge: 'text-gray-400',  continuation: 'text-blue-400'  }
const CLS_BORDER = { sell_resistance: 'border-red-900',  buy_support: 'border-green-900', no_edge: 'border-gray-800', continuation: 'border-blue-900' }
const CLS_BAR    = { sell_resistance: 'bg-red-500',      buy_support: 'bg-green-500',     no_edge: 'bg-gray-500',    continuation: 'bg-blue-500'    }

export default function SmartLevelCard({ level, currentPrice, nqRatio, narrative, dpHistory, variant = 'standard', label, touches }) {
  const [expanded, setExpanded] = useState(false)

  if (!level) return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
      <span className="text-xs text-gray-600">No {label?.toLowerCase() || 'level'} active</span>
    </div>
  )

  const nq        = nqRatio ? Math.round(level.price * nqRatio) : null
  const dist      = currentPrice != null ? (currentPrice - level.price) : null
  const distStr   = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
  const distNq    = dist != null && nqRatio ? Math.round(Math.abs(dist) * nqRatio) : null
  const clsCls    = level.classification || 'no_edge'
  const textColor = CLS_COLOR[clsCls]  || CLS_COLOR.no_edge
  const borderCls = CLS_BORDER[clsCls] || CLS_BORDER.no_edge
  const barCls    = CLS_BAR[clsCls]    || CLS_BAR.no_edge

  const dp        = level.dark_pool || 0
  const dpPct     = ((dp + 1) / 2) * 100
  const dpBull    = dpPct >= 50

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
      {label && <div className="px-4 pt-3 text-xs text-gray-600 uppercase tracking-wider">{label}</div>}

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-lg font-bold ${textColor}`}>{level.id}</span>
            <span className="text-white font-mono font-bold text-base">${level.price?.toFixed(2)}</span>
            {nq && <span className="text-gray-500 text-xs font-mono">NQ {nq.toLocaleString()}</span>}
          </div>
          <div className={`text-xs mt-0.5 ${textColor}`}>
            {clsCls.replace('_', ' ').toUpperCase()}
            {level.confidence && level.confidence !== 'none' && <span className="text-gray-500 ml-1">· {level.confidence}</span>}
          </div>
        </div>
        {distStr && (
          <div className="text-right shrink-0">
            <div className="text-sm font-mono font-bold text-gray-300">{distStr}</div>
            {distNq && <div className="text-xs text-gray-600">{distNq} NQ</div>}
          </div>
        )}
      </div>

      {/* Evidence bars */}
      <div className="px-4 pb-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-6">DP</span>
          <div className="flex-1 h-1 bg-gray-800 rounded relative">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-700" />
            {dpBull
              ? <div className="absolute top-0 bottom-0 left-1/2 bg-green-500 rounded-r" style={{ width: `${(dpPct - 50) * 2}%` }} />
              : <div className="absolute top-0 bottom-0 right-1/2 bg-red-500 rounded-l"   style={{ width: `${(50 - dpPct) * 2}%` }} />
            }
          </div>
          <span className="text-xs font-mono text-gray-500 w-14 text-right">{dp.toFixed(3)}</span>
          <DpSparkline history={dpHistory?.[level.id]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-6">SCR</span>
          <div className="flex-1 h-1 bg-gray-800 rounded">
            <div className={`h-1 rounded ${barCls}`} style={{ width: `${Math.min(level.score || 0, 100)}%` }} />
          </div>
          <span className="text-xs font-mono text-gray-500 w-14 text-right">{level.score || 0}</span>
        </div>
      </div>

      {/* Flags */}
      {(level.full_stack || (touches?.total_touches > 0)) && (
        <div className="px-4 pb-2 flex items-center gap-3">
          {level.full_stack && <span className="text-xs text-yellow-400 font-bold">★ FULL STACK</span>}
          {touches?.total_touches > 0 && <span className="text-xs text-gray-600">touched {touches.total_touches}×</span>}
          {touches?.crosses > 0 && <span className="text-xs text-amber-600">crossed {touches.crosses}×</span>}
        </div>
      )}

      {/* Claude analysis */}
      {narrative && (
        <div className="border-t border-gray-800/50 px-4 py-2">
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400">
            <span>{expanded ? '▼' : '▶'}</span>
            <svg height="0.8em" width="0.8em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline">
              <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
            </svg>
            <span>Analysis</span>
          </button>
          {expanded && <p className="text-xs text-gray-300 mt-2 leading-relaxed italic border-l-2 border-purple-900 pl-2">{narrative}</p>}
        </div>
      )}
    </div>
  )
}
