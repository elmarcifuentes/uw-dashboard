import { Zap, CircleCheck, TriangleAlert } from 'lucide-react'

export default function HoldExitGuide({ evaluation }) {
  if (!evaluation) return null

  const { verdictColor, verdictLabel, holdSignals, exitSignals, convictionSignals, exitConditions } = evaluation

  const borderColor = verdictColor === 'green' ? 'border-state-hold/30'
    : verdictColor === 'amber' ? 'border-state-exit/30'
    : 'border-state-stop/30'

  const bgColor = verdictColor === 'green' ? 'bg-state-holdSoft'
    : verdictColor === 'amber' ? 'bg-state-exitSoft'
    : 'bg-state-stopSoft'

  const labelColor = verdictColor === 'green' ? 'text-state-hold'
    : verdictColor === 'amber' ? 'text-state-exit'
    : 'text-state-stop'

  return (
    <div className={`border rounded-lg p-3 ${borderColor} ${bgColor}`}>
      <div className={`text-sm font-bold mb-3 ${labelColor}`}>{verdictLabel}</div>

      {convictionSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {convictionSignals.map((s, i) => (
            <div key={i} className="text-xs text-accent-ai flex items-start gap-1">
              <Zap className="w-3 h-3 shrink-0 mt-0.5" /><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {holdSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {holdSignals.map((s, i) => (
            <div key={i} className="text-xs text-state-hold flex items-start gap-1">
              <CircleCheck className="w-3 h-3 shrink-0 mt-0.5" /><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {exitSignals.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {exitSignals.map((s, i) => (
            <div key={i} className="text-xs text-state-exit flex items-start gap-1">
              <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" /><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {exitConditions.length > 0 && (
        <div className="border-t border-border-subtle pt-2 mt-2">
          <div className="text-xs text-text-muted mb-1">Exit if:</div>
          {exitConditions.map((c, i) => (
            <div key={i} className="text-xs text-text-tertiary flex items-start gap-1">
              <span className="shrink-0">•</span><span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
