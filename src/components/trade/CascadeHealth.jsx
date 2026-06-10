export default function CascadeHealth({ cascade, levels, trade }) {
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool || 0
  const gap    = Math.abs(-0.700 - midDp)
  const isShort = trade?.direction === 'short'

  const statusColor = cascade?.active
    ? (isShort ? 'text-green-400' : 'text-red-400')
    : midDp <= -0.500
    ? 'text-amber-400'
    : 'text-gray-500'

  const statusLabel = cascade?.active
    ? (isShort ? '⚡ CASCADE — adds conviction' : '⚡ CASCADE — against trade')
    : midDp <= -0.500
    ? `Approaching — ${gap.toFixed(3)} from trigger`
    : 'Cascade safe'

  const THRESHOLD = -0.700
  const thresholdPct = ((THRESHOLD + 1) / 2) * 100
  const currentPct   = ((midDp + 1) / 2) * 100

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Cascade Health</div>

      <div className={`text-xs font-bold mb-2 ${statusColor}`}>{statusLabel}</div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 w-10 shrink-0">MID</span>
        <div style={{ flex: 1, minWidth: 0 }} className="h-2 bg-gray-800 rounded relative overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 ${
              midDp <= -0.700 ? 'bg-red-500' : midDp <= -0.500 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${currentPct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-red-500 opacity-80"
            style={{ left: `${thresholdPct}%` }}
          />
        </div>
        <span
          style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
          className={`text-xs font-mono ${
            midDp <= -0.700 ? 'text-red-400' : midDp <= -0.500 ? 'text-amber-400' : 'text-gray-400'
          }`}
        >
          {midDp.toFixed(3)}
        </span>
      </div>

      {/* Cascade conditions */}
      <div className="flex flex-wrap gap-2 mt-2">
        {[
          { label: 'MID ≤ -0.700', met: cascade?.conditions?.[0] || midDp <= -0.700 },
          { label: 'S1 art',       met: cascade?.conditions?.[1] },
          { label: 'S2 void',      met: cascade?.conditions?.[2] },
        ].map((c, i) => (
          <span
            key={i}
            className={`text-xs px-1.5 py-0.5 rounded ${
              c.met ? 'bg-red-950 text-red-400' : 'bg-gray-800 text-gray-600'
            }`}
          >
            {c.met ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
