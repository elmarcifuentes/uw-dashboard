export default function DpBar({ value }) {
  const clamped = Math.max(-1, Math.min(1, value ?? 0))
  const pct     = Math.abs(clamped) * 50
  const bullish = clamped >= 0

  return (
    <div className="flex items-center gap-1">
      <span className="text-signal-resistance text-xs shrink-0">SUPPLY</span>
      <div className="relative flex-1 h-[10px] bg-bg-elevated rounded overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-text-disabled" />
        {bullish ? (
          <div className="absolute top-0 h-full bg-signal-support rounded" style={{ left: '50%', width: `${pct}%` }} />
        ) : (
          <div className="absolute top-0 h-full bg-signal-resistance rounded" style={{ right: '50%', width: `${pct}%` }} />
        )}
      </div>
      <span className="text-signal-support text-xs shrink-0">ABSORB</span>
    </div>
  )
}
