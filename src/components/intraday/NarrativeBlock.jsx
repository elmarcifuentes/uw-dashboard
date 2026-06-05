import { memo } from 'react'
export default memo(function NarrativeBlock({ narrative, lastUpdate, compact, narrativeMode }) {
  console.log('[narrative] rendering:', narrative?.length, 'lines, mode:', narrativeMode, '| line 1:', narrative?.[0])
  if (!narrative || narrative.length === 0) return null

  const time = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'America/New_York',
      }) + ' ET'
    : null

  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Session Read</span>
        <div className="flex items-center gap-2">
          {narrativeMode === 'claude' && (
            <span className="text-xs text-purple-400 font-medium">🤖 Claude+MCP</span>
          )}
          {time && <span className="text-xs text-gray-600 font-mono">{time}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {narrative.map((line, i) => {
          const isCascade   = line.includes('CASCADE')
          const isWarning   = line.startsWith('⚠') && !isCascade
          const isFullStack = line.includes('FULL STACK') || line.includes('★')
          const isPassive   = line.includes('Passive target')
          const textColor   =
            isCascade   ? 'text-red-300'    :
            isWarning   ? 'text-amber-300'  :
            isFullStack ? 'text-yellow-300' :
            isPassive   ? 'text-teal-300'   :
            'text-gray-300'
          return (
            <p key={i} className={`text-xs leading-relaxed ${textColor}`}>{line}</p>
          )
        })}
      </div>
    </div>
  )
})