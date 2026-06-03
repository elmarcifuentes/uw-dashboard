export default function CascadeBanner({ cascade }) {
  if (!cascade) return null
  const active = cascade.active

  if (!active) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-green-900/40 border border-green-700 text-green-400 text-sm font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        CASCADE: INACTIVE
      </div>
    )
  }

  const midDp = cascade.mid_dp ?? null

  return (
    <div className="px-3 py-2 rounded bg-red-900/60 border border-red-500 text-red-300 text-sm font-medium animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
        <span className="font-bold text-red-200">⚠ CASCADE ACTIVE — no floor below MID</span>
      </div>
      <div className="space-y-0.5 text-xs text-red-300 pl-4">
        <div className="flex items-center gap-1">
          <span className="text-green-400">✓</span>
          MID dp {midDp !== null ? midDp.toFixed(3) : '?'} ≤ -0.700
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-400">✓</span>
          S1 artifact/zero
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-400">✓</span>
          S2 structural void
        </div>
      </div>
    </div>
  )
}
