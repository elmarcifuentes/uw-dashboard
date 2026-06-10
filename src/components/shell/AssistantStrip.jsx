import { formatNarrative } from '../../utils/formatNarrative'

const FIELDS = [
  { key: 'now',          label: 'NOW',      color: 'text-text-primary',         border: 'border-border-default',             labelColor: 'text-text-tertiary'              },
  { key: 'next',         label: 'NEXT',     color: 'text-text-secondary',        border: 'border-signal-continuation/30',     labelColor: 'text-signal-continuation'        },
  { key: 'risk',         label: 'RISK',     color: 'text-text-secondary',        border: 'border-state-exit/30',              labelColor: 'text-state-exit'                 },
  { key: 'invalidation', label: 'IF WRONG', color: 'text-text-secondary',        border: 'border-border-subtle',              labelColor: 'text-text-muted'                 },
]

export default function AssistantStrip({ assistantRead, activeSymbol = 'NQ' }) {
  return (
    <div className="border-b border-border-subtle bg-bg-subtle">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-2">
        {!assistantRead ? (
          <div className="text-sm2 text-text-disabled py-1">Initializing market read…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FIELDS.map(f => (
              <div key={f.key} className={`border rounded-lg px-2.5 py-2 ${f.border} bg-bg-card/50 min-h-[64px]`}>
                <div className={`text-micro font-bold tracking-wider uppercase mb-1 ${f.labelColor}`}>{f.label}</div>
                <p className={`text-sm2 leading-relaxed line-clamp-3 ${f.color}`}>
                  {formatNarrative(assistantRead[f.key], activeSymbol) || '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
