export default function HoldExitGuide({ evaluation }) {
  if (!evaluation) return null

  const { verdict, verdictColor, verdictLabel, holdSignals, exitSignals, convictionSignals, exitConditions } = evaluation

  const borderColor = verdictColor === 'green' ? 'border-green-900/50'
    : verdictColor === 'amber' ? 'border-amber-900/50'
    : 'border-red-900/50'

  const bgColor = verdictColor === 'green' ? 'bg-green-950/10'
    : verdictColor === 'amber' ? 'bg-amber-950/10'
    : 'bg-red-950/10'

  const labelColor = verdictColor === 'green' ? 'text-green-400'
    : verdictColor === 'amber' ? 'text-amber-400'
    : 'text-red-400'

  return (
    <div className={`border rounded-lg p-3 ${borderColor} ${bgColor}`}>
      <div className={`text-sm font-bold mb-3 ${labelColor}`}>{verdictLabel}</div>

      {convictionSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {convictionSignals.map((s, i) => (
            <div key={i} className="text-xs text-purple-400 flex items-start gap-1">
              <span className="shrink-0">⚡</span><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {holdSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {holdSignals.map((s, i) => (
            <div key={i} className="text-xs text-green-400 flex items-start gap-1">
              <span className="shrink-0">✓</span><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {exitSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {exitSignals.map((s, i) => (
            <div key={i} className="text-xs text-amber-400 flex items-start gap-1">
              <span className="shrink-0">⚠</span><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {exitConditions.length > 0 && (
        <div className="border-t border-gray-800 pt-2 mt-2">
          <div className="text-xs text-gray-600 mb-1">Exit if:</div>
          {exitConditions.map((c, i) => (
            <div key={i} className="text-xs text-gray-500 flex items-start gap-1">
              <span className="shrink-0">•</span><span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
