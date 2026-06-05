import { memo } from 'react'
export default memo(function NarrativeBlock({ narrative, result, lastUpdate, compact, narrativeMode }) {
  const displayNarrative = narrative?.length > 0
    ? narrative
    : result?.current_price ? [
        `Price $${result.current_price.toFixed(2)} — last scored ${
          lastUpdate
            ? new Date(lastUpdate).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
              }) + ' ET'
            : '—'
        }`,
        result.cascade?.active
          ? '⚠ CASCADE ACTIVE — no institutional floor below MID'
          : result.structure_break?.active
          ? `⚠ STRUCTURE BREAK ${result.structure_break.direction?.toUpperCase()} — GEX extension active`
          : 'Structure intact — levels valid',
      ]
    : []

  console.log('[narrative] rendering:', displayNarrative?.length, 'lines, mode:', narrativeMode, '| line 1:', displayNarrative?.[0])

  if (!displayNarrative.length) return null

  const isClaudeMode = narrativeMode === 'claude'

  const time = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'America/New_York',
      }) + ' ET'
    : null

  return (
    <div className={`rounded p-3 ${isClaudeMode ? 'border border-purple-600 bg-purple-950' : 'bg-gray-900/80 border border-gray-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Session Read</span>
          {isClaudeMode && (
            <span className="text-xs bg-purple-800 text-purple-300 px-1.5 py-0.5 rounded font-medium">
              🤖 Claude
            </span>
          )}
          {!isClaudeMode && narrativeMode === 'template' && (
            <span className="text-xs text-gray-600">📋 template</span>
          )}
        </div>
        {time && <span className="text-xs text-gray-600 font-mono">{time}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {displayNarrative.map((line, i) => {
          const isCascade   = line.includes('CASCADE')
          const isWarning   = line.startsWith('⚠') && !isCascade
          const isFullStack = line.includes('FULL STACK') || line.includes('★')
          const textColor   =
            isCascade   ? 'text-red-300'    :
            isWarning   ? 'text-amber-300'  :
            isFullStack ? 'text-yellow-300' :
            isClaudeMode ? (i === 0 ? 'text-purple-200' : 'text-purple-300') :
            (i === 0 ? 'text-gray-300' : 'text-gray-400')
          return (
            <p key={i} className={`text-xs leading-relaxed ${i > 0 ? 'mt-1' : ''} ${textColor}`}>{line}</p>
          )
        })}
      </div>
    </div>
  )
})