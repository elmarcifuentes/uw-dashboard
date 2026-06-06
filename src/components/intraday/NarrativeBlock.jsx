import { useState, memo } from 'react'

export default memo(function NarrativeBlock({ narrative, result, lastUpdate, compact, narrativeMode, tacticalBrief }) {
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
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Session Read</span>
          {isClaudeMode && (
            <span className="inline-flex items-center gap-1 text-xs bg-purple-950 text-purple-400 px-1.5 py-0.5 rounded font-medium">
              <svg height="0.85em" width="0.85em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
              </svg>
              Claude
            </span>
          )}
          {!isClaudeMode && narrativeMode === 'template' && (
            <span className="text-xs text-gray-600">📋 template</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {time && <span className="text-xs text-gray-600 font-mono">{time}</span>}
          <span className="text-xs text-gray-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-3 pb-3">
          {isClaudeMode && tacticalBrief ? (
            <p className="text-xs text-gray-200 leading-relaxed">{tacticalBrief}</p>
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
                    {line}
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
