import { useState, memo } from 'react'
import { formatNarrative } from '../../utils/formatNarrative'

export default memo(function NarrativeBlock({ narrative, result, lastUpdate, compact, narrativeMode, tacticalBrief, activeSymbol = 'NQ' }) {
  const [expanded, setExpanded] = useState(true)
  const isClaudeMode = narrativeMode === 'claude'

  const time = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'America/New_York',
      }) + ' ET'
    : null

  // Build display content — Claude tactical brief takes priority
  let displayLines = []
  if (isClaudeMode && tacticalBrief) {
    displayLines = [tacticalBrief]
  } else if (narrative?.length > 0) {
    displayLines = narrative
  } else if (result?.current_price) {
    displayLines = [
      `Price $${result.current_price.toFixed(2)} — last scored ${
        time ?? '—'
      }`,
      result.cascade?.active
        ? '⚠ CASCADE ACTIVE — no institutional floor below MID'
        : result.structure_break?.active
        ? `⚠ STRUCTURE BREAK ${result.structure_break.direction?.toUpperCase()} — GEX extension active`
        : 'Structure intact — levels valid',
    ]
  }

  if (!displayLines.length) return null

  const borderClass = isClaudeMode
    ? 'border border-purple-900/50 bg-purple-950/20'
    : 'border border-gray-700 bg-gray-900/80'

  return (
    <div className={`rounded-lg ${borderClass}`}>

      {/* Header — always visible, click to toggle */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none hover:bg-white/5 rounded-t-lg transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Session Read</span>
          {isClaudeMode && (
            <span className="text-xs bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded">
              🤖 Claude
            </span>
          )}
          {!isClaudeMode && narrativeMode === 'template' && (
            <span className="text-xs text-gray-600">📋 template</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {time && <span className="text-xs text-gray-600 font-mono">{time}</span>}
          <span className="text-gray-500 text-sm font-bold leading-none">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-3 pb-3">
          {isClaudeMode && tacticalBrief ? (
            <p className="text-xs text-gray-200 leading-relaxed">{formatNarrative(tacticalBrief, activeSymbol)}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {displayLines.map((line, i) => {
                const isCascade   = line.includes('CASCADE')
                const isWarning   = line.startsWith('⚠') && !isCascade
                const isFullStack = line.includes('FULL STACK') || line.includes('★')
                const textColor   =
                  isCascade   ? 'text-red-300'    :
                  isWarning   ? 'text-amber-300'  :
                  isFullStack ? 'text-yellow-300' :
                  (i === 0 ? 'text-gray-200' : 'text-gray-300')
                return (
                  <p key={i} className={`text-xs leading-relaxed ${i > 0 ? 'mt-1' : ''} ${textColor}`}>
                    {formatNarrative(line, activeSymbol)}
                  </p>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
