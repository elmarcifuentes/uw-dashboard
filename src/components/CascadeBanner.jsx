export default function CascadeBanner({ cascade, midPrice, nqRatio }) {
  if (!cascade) return null

  const active     = cascade.active
  const midDp      = cascade.mid_dp ?? null
  const midNq      = nqRatio && midPrice ? Math.round(midPrice * nqRatio).toLocaleString() : null

  if (!active) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-state-holdSoft border border-state-hold/40">
        <span className="w-2 h-2 rounded-full bg-state-hold shrink-0 inline-block" />
        <span className="text-state-hold text-sm font-medium">✓ CASCADE INACTIVE</span>
        <span className="text-text-secondary text-xs">
          Institutional support present at key levels — structure intact
        </span>
      </div>
    )
  }

  return (
    <div className="rounded bg-state-stopSoft border border-state-stop p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-state-stop shrink-0 inline-block" />
        <span className="text-state-stop/90 font-bold text-sm">⚠ CASCADE ACTIVE</span>
      </div>
      <p className="text-state-stop/70 text-xs mb-3 leading-relaxed">
        If price breaks below MID
        {midPrice && <> <span className="text-text-primary">${midPrice.toFixed(2)}</span>{midNq && <span className="text-text-secondary"> / NQ {midNq}</span>}</>}
        {' '}there is no institutional support at S1 or S2.
        GEX provides mechanical friction only.
        Do not hold longs through a MID break in this configuration.
      </p>
      <div className="space-y-1">
        {/* When ACTIVE, all three cascade conditions hold by definition (active = cond1∧cond2∧cond3). */}
        {[
          'MID dark pool below -0.700 threshold' + (midDp !== null ? ` (${midDp.toFixed(3)})` : ''),
          'S1 has no institutional prints',
          'S2 is a structural void',
        ].map((label, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-state-stop">●</span>
            <span className="text-state-stop/80">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
