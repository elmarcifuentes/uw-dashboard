import { memo } from 'react'
export default memo(function CascadeProximityGauge({ cascade, midDpHistory }) {
  if (!cascade || cascade.mid_dp === null || cascade.mid_dp === undefined) return null

  const midDp        = cascade.mid_dp
  const active       = cascade.active
  const CASCADE_THRESHOLD = -0.700

  // Gauge: +1.0 (left=0%) to -1.0 (right=100%)
  const pct          = Math.min(100, Math.max(0, ((1.0 - midDp) / 2.0) * 100))
  const thresholdPct = ((1.0 - CASCADE_THRESHOLD) / 2.0) * 100  // = 85%

  // Gap to threshold — calculated locally, not from server
  const gap = midDp > CASCADE_THRESHOLD
    ? Math.abs(CASCADE_THRESHOLD - midDp)
    : null

  const barColor = midDp <= CASCADE_THRESHOLD
    ? 'bg-red-500'
    : midDp <= -0.500
    ? 'bg-amber-500'
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
      <div className="relative w-full h-3 rounded-full mb-1.5 overflow-hidden">
        {/* Color zone backgrounds: safe(75%) | approaching(10%) | danger(15%) */}
        <div className="absolute inset-0 flex">
          <div className="bg-green-950" style={{ width: '75%' }} />
          <div className="bg-amber-950" style={{ width: '10%' }} />
          <div className="bg-red-950"   style={{ width: '15%' }} />
        </div>
        {/* Fill bar on top */}
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-500 opacity-80 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        {/* Threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${thresholdPct}%` }}
          title="-0.700 cascade threshold"
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-xs text-gray-600 mb-2">
        <span>+1.0</span>
        <span className="text-red-500/70 text-xs">−0.700</span>
        <span>−1.0</span>
      </div>

      {/* Condition dots */}
      <div className="flex flex-col gap-1.5 mt-2">
        {['MID dp ≤ −0.700', 'S1 zero/artifact', 'S2 structural void'].map((label, i) => {
          const met = cascade.conditions?.[i]
          return (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${
              met ? 'bg-red-500 ring-2 ring-red-400' : 'bg-gray-600'
            }`} />
            <span className={`text-xs ${met ? 'text-red-300 font-medium' : 'text-gray-500'}`}>
              {label}
            </span>
            <span className={`text-xs ml-auto ${met ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
              {met ? '✓ MET' : '✗'}
            </span>
          </div>
          )
        })}
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
          <span className="text-gray-600">
            {gap.toFixed(3)} remaining to cascade threshold
          </span>
        ) : (
          <span className="text-amber-400 animate-pulse">
            ⚠ Past cascade threshold — waiting for S1/S2 conditions
          </span>
        )}
      </div>
    </div>
  )
})