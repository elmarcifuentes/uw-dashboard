export default function CascadeHealth({ cascade, levels, trade }) {
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool || 0
  const gap    = Math.abs(-0.700 - midDp)
  const isShort = trade?.direction === 'short'

  const statusColor = cascade?.active
    ? (isShort ? 'text-state-hold' : 'text-state-stop')
    : midDp <= -0.500
    ? 'text-state-cascadeWatch'
    : 'text-text-tertiary'

  const statusLabel = cascade?.active
    ? (isShort ? '⚡ CASCADE — adds conviction' : '⚡ CASCADE — against trade')
    : midDp <= -0.500
    ? `Approaching — ${gap.toFixed(3)} from trigger`
    : 'Cascade safe'

  const THRESHOLD = -0.700
  const thresholdPct = ((THRESHOLD + 1) / 2) * 100
  const currentPct   = ((midDp + 1) / 2) * 100

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-3">
      <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Cascade Health</div>

      <div className={`text-xs font-bold mb-2 ${statusColor}`}>{statusLabel}</div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted w-10 shrink-0">MID</span>
        <div style={{ flex: 1, minWidth: 0 }} className="h-2 bg-bg-elevated rounded relative overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 ${
              midDp <= -0.700 ? 'bg-state-stop' : midDp <= -0.500 ? 'bg-state-cascadeWatch' : 'bg-state-hold'
            }`}
            style={{ width: `${currentPct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-state-stop opacity-80"
            style={{ left: `${thresholdPct}%` }}
          />
        </div>
        <span
          style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
          className={`text-xs font-price ${
            midDp <= -0.700 ? 'text-state-stop' : midDp <= -0.500 ? 'text-state-cascadeWatch' : 'text-text-secondary'
          }`}
        >
          {midDp.toFixed(3)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {[
          { label: 'MID ≤ -0.700', met: cascade?.conditions?.[0] || midDp <= -0.700 },
          { label: 'S1 art',       met: cascade?.conditions?.[1] },
          { label: 'S2 void',      met: cascade?.conditions?.[2] },
        ].map((c, i) => (
          <span
            key={i}
            className={`text-xs px-1.5 py-0.5 rounded ${
              c.met ? 'bg-state-stopSoft text-state-stop' : 'bg-bg-elevated text-text-muted'
            }`}
          >
            {c.met ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
