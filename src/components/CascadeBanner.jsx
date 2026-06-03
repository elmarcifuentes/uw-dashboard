export default function CascadeBanner({ cascade }) {
  if (!cascade) return null

  const active     = cascade.active
  const midDp      = cascade.mid_dp ?? null
  const conditions = cascade.conditions ?? [false, false, false]

  if (!active) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-green-900/40 border border-green-700">
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 inline-block" />
        <span className="text-green-400 text-sm font-medium">✓ CASCADE INACTIVE</span>
        <span className="text-gray-400 text-xs">
          Institutional support present at key levels — structure intact
        </span>
      </div>
    )
  }

  return (
    <div className="rounded bg-red-900/60 border border-red-500 p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 inline-block" />
        <span className="text-red-200 font-bold text-sm">⚠ CASCADE ACTIVE</span>
      </div>
      <p className="text-red-300 text-xs mb-3 leading-relaxed">
        If price breaks below MID there is no institutional support at S1 or S2.
        GEX provides mechanical friction only.
        Do not hold longs through a MID break in this configuration.
      </p>
      <div className="space-y-1">
        {[
          'MID dark pool below -0.700 threshold' + (midDp !== null ? ` (${midDp.toFixed(3)})` : ''),
          'S1 has no institutional prints',
          'S2 is a structural void',
        ].map((label, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={conditions[i] ? 'text-red-400' : 'text-gray-600'}>
              {conditions[i] ? '●' : '○'}
            </span>
            <span className={conditions[i] ? 'text-red-300' : 'text-gray-600'}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
