export default function DpBar({ value }) {
  const clamped = Math.max(-1, Math.min(1, value ?? 0))
  const pct     = Math.abs(clamped) * 50
  const bullish = clamped >= 0

  return (
    <div className="flex items-center gap-1">
      <span className="text-red-400 text-xs shrink-0">SUPPLY</span>
      <div className="relative flex-1 h-[10px] bg-gray-800 rounded overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-gray-600" />
        {bullish ? (
          <div className="absolute top-0 h-full bg-green-500 rounded" style={{ left: '50%', width: `${pct}%` }} />
        ) : (
          <div className="absolute top-0 h-full bg-red-500 rounded"   style={{ right: '50%', width: `${pct}%` }} />
        )}
      </div>
      <span className="text-green-400 text-xs shrink-0">ABSORB</span>
    </div>
  )
}
