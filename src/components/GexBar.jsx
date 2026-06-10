export default function GexBar({ value, sessionMax }) {
  const abs = Math.abs(value ?? 0)
  const max = Math.max(Math.abs(sessionMax ?? 1), 1)
  const pct = Math.min(100, (abs / max) * 100)
  const pinning = (value ?? 0) > 0

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[8px] w-24 bg-bg-elevated rounded overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded ${pinning ? 'bg-blue-400' : 'bg-orange-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs ${pinning ? 'text-blue-400' : 'text-orange-400'}`}>
        {pinning ? 'pin' : 'exp'}
      </span>
    </div>
  )
}
