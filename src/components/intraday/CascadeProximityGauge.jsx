export default function CascadeProximityGauge({ cascade, midDpHistory }) {
  if (!cascade || cascade.mid_dp === null || cascade.mid_dp === undefined) return null

  const midDp    = cascade.mid_dp
  const threshold = -0.700
  const active   = cascade.active
  const gap      = cascade.gap_to_trigger

  // Gauge: map -1.0 to +1.0 range onto 0–100%
  const pct          = Math.min(100, Math.max(0, ((midDp - 1.0) / (-2.0)) * 100))
  const thresholdPct = ((threshold - 1.0) / (-2.0)) * 100  // = 85%

  const barColor = active
    ? 'bg-red-500'
    : midDp <= -0.500 ? 'bg-amber-500'
    : midDp <= -0.300 ? 'bg-yellow-500'
    : 'bg-green-500'

  const valueColor = active
    ? 'text-red-400'
    : midDp <= -0.500 ? 'text-amber-400'
    : midDp <= -0.300 ? 'text-yellow-400'
    : 'text-gray-400'

  const trend = midDpHistory && midDpHistory.length >= 2
    ? midDpHistory[midDpHistory.length - 1].value - midDpHistory[midDpHistory.length - 2].value
    : null

  return (
    <div className="bg-gray-900/60 rounded border border-gray-700 p-3">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Cascade Proximity</span>
          {active && (
            <span className="text-xs text-red-400 font-bold animate-pulse">● ACTIVE</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {trend !== null && (
            <span className={trend < 0 ? 'text-red-400 text-xs' : 'text-green-400 text-xs'}>
              {trend < 0 ? '↓' : '↑'}
            </span>
          )}
          <span className={`text-xs font-mono font-bold ${valueColor}`}>
            MID dp {midDp?.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="relative w-full h-3 bg-gray-700 rounded-full mb-1.5 overflow-visible">
        {/* Threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 rounded"
          style={{ left: `${thresholdPct}%` }}
          title="-0.700 cascade threshold"
        />
        {/* Fill bar */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-xs text-gray-600 mb-2">
        <span>+1.0</span>
        <span className="text-red-500/70 text-xs">−0.700</span>
        <span>−1.0</span>
      </div>

      {/* Condition dots */}
      <div className="flex gap-4 flex-wrap">
        {['MID dp ≤ −0.700', 'S1 zero/artifact', 'S2 structural void'].map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              cascade.conditions?.[i] ? 'bg-red-500' : 'bg-gray-600'
            }`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* MID dp trajectory */}
      {midDpHistory && midDpHistory.length > 1 && (
        <div className="mt-2 flex items-center gap-1 text-xs font-mono flex-wrap">
          <span className="text-gray-600">MID trend:</span>
          {midDpHistory.slice(-3).map((reading, i, arr) => (
            <span key={i}>
              <span className={
                reading.value <= -0.700 ? 'text-red-400' :
                reading.value <= -0.300 ? 'text-amber-400' :
                reading.value >= 0.300  ? 'text-green-400' :
                'text-gray-400'
              }>
                {reading.value.toFixed(3)}
              </span>
              {i < arr.length - 1 && <span className="text-gray-600"> → </span>}
            </span>
          ))}
          {trend !== null && (
            <span className={trend < 0 ? 'text-red-400 ml-1' : 'text-green-400 ml-1'}>
              {trend < 0 ? '↓' : '↑'}
            </span>
          )}
        </div>
      )}

      {/* Status line */}
      <div className="mt-1.5 text-xs">
        {active ? (
          <span className="text-red-400 font-bold">
            All three conditions met — no institutional floor below MID
          </span>
        ) : gap !== null ? (
          gap < 0 ? (
            <span className="text-amber-400">
              ⚠ {Math.abs(gap).toFixed(3)} past threshold — conditions 2 or 3 blocking
            </span>
          ) : (
            <span className="text-gray-600">
              {gap.toFixed(3)} remaining to cascade threshold
            </span>
          )
        ) : null}
      </div>
    </div>
  )
}
