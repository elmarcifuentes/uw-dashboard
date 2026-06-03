export default function DpBar({ value }) {
  // value: -1.0 to +1.0
  const clamped = Math.max(-1, Math.min(1, value ?? 0))
  const pct = Math.abs(clamped) * 50  // max 50% of bar width
  const bullish = clamped >= 0

  return (
    <div className="relative h-[10px] w-full bg-gray-800 rounded overflow-hidden">
      {/* center line */}
      <div className="absolute left-1/2 top-0 w-px h-full bg-gray-600" />
      {bullish ? (
        <div
          className="absolute top-0 h-full bg-green-500 rounded"
          style={{ left: '50%', width: `${pct}%` }}
        />
      ) : (
        <div
          className="absolute top-0 h-full bg-red-500 rounded"
          style={{ right: '50%', width: `${pct}%` }}
        />
      )}
    </div>
  )
}
