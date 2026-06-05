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
    <div className={`rounded p-3 ${isClaudeMode ? 'border border-purple-900 bg-purple-950/30' : 'bg-gray-900/80 border border-gray-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Session Read</span>
          {isClaudeMode && (
            <span className="inline-flex items-center gap-1 text-xs bg-purple-950 text-purple-400 px-1.5 py-0.5 rounded font-medium">
              <svg height="1em" width="1em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
              </svg>
              Claude
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
            (i === 0 ? 'text-gray-200' : 'text-gray-300')
          return (
            <p key={i} className={`text-xs leading-relaxed ${i > 0 ? 'mt-1' : ''} ${textColor}`}>{line}</p>
          )
        })}
      </div>
    </div>
  )
})