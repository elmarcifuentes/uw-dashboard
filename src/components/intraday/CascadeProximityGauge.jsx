import { memo } from 'react'
import AlertBadge from '../AlertBadge'
import { CASCADE_TRIGGER, CASCADE_WATCH } from '../../utils/cascade'

function CascadeThermometer({ midDp }) {
  const clamped       = Math.max(-1.0, Math.min(0.5, midDp ?? 0))
  const H = 60, W = 12
  const pct           = ((clamped - (-1.0)) / 1.5) * 100
  const thresholdPct  = ((CASCADE_TRIGGER - (-1.0)) / 1.5) * 100
  const fillH         = (pct / 100) * H
  const thresholdY    = H - (thresholdPct / 100) * H
  const color = midDp <= CASCADE_TRIGGER ? '#ff4d5e' : midDp <= CASCADE_WATCH ? '#ffb020' : '#20c997'
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span className="text-xs text-text-muted">dp</span>
      <svg width={W} height={H}>
        <rect x="2" y="0" width={W - 4} height={H} rx="3" fill="#17253f" />
        <rect x="2" y={H - fillH} width={W - 4} height={fillH} rx="3" fill={color} opacity="0.8" />
        <line x1="0" y1={thresholdY.toFixed(1)} x2={W} y2={thresholdY.toFixed(1)}
              stroke="#ff4d5e" strokeWidth="1.5" strokeDasharray="2,1" />
      </svg>
      <span className="text-xs font-price" style={{ color }}>{midDp?.toFixed(2)}</span>
    </div>
  )
}

export default memo(function CascadeProximityGauge({ cascade, midDpHistory }) {
  if (!cascade || cascade.mid_dp === null || cascade.mid_dp === undefined) return null

  const midDp        = cascade.mid_dp
  const active       = cascade.active

  const pct          = Math.min(100, Math.max(0, ((1.0 - midDp) / 2.0) * 100))
  const thresholdPct = ((1.0 - CASCADE_TRIGGER) / 2.0) * 100

  const gap = midDp > CASCADE_TRIGGER
    ? Math.abs(CASCADE_TRIGGER - midDp)
    : null

  const barColor = midDp <= CASCADE_TRIGGER
    ? 'bg-state-stop'
    : midDp <= CASCADE_WATCH
    ? 'bg-state-cascadeWatch'
    : 'bg-state-hold'

  const valueColor = active
    ? 'text-state-stop'
    : midDp <= CASCADE_WATCH ? 'text-state-cascadeWatch'
    : midDp <= -0.300 ? 'text-state-cascadeWatch/70'
    : 'text-text-secondary'

  const trend = midDpHistory && midDpHistory.length >= 2
    ? midDpHistory[midDpHistory.length - 1].value - midDpHistory[midDpHistory.length - 2].value
    : null

  return (
    <div className="bg-bg-card2/60 rounded border border-border-default p-3">
      <div className="flex items-start gap-3">
      <div className="flex-1">

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary uppercase tracking-wide">Cascade Proximity</span>
          {active && (
            <span className="text-xs text-state-stop font-bold animate-pulse">● ACTIVE</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {trend !== null && (
            <span className={trend < 0 ? 'text-state-stop text-xs' : 'text-state-hold text-xs'}>
              {trend < 0 ? '↓' : '↑'}
            </span>
          )}
          <span className={`text-xs font-price font-bold ${valueColor}`}>
            MID dp {midDp?.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="relative w-full h-3 rounded-full mb-1.5 overflow-hidden">
        <div className="absolute inset-0 flex">
          <div className="bg-state-holdSoft" style={{ width: '75%' }} />
          <div className="bg-state-cascadeWatchSoft" style={{ width: '10%' }} />
          <div className="bg-state-stopSoft"   style={{ width: '15%' }} />
        </div>
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-500 opacity-80 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-state-stop z-10"
          style={{ left: `${thresholdPct}%` }}
          title="-0.700 cascade threshold"
        />
      </div>

      <div className="flex justify-between text-xs text-text-muted mb-2">
        <span>+1.0</span>
        <span className="text-state-stop/70 text-xs">−0.700</span>
        <span>−1.0</span>
      </div>

      <div className="flex flex-col gap-1.5 mt-2">
        {['MID dp ≤ −0.700', 'S1 zero/artifact', 'S2 structural void'].map((label, i) => {
          // cascade.conditions (S1/S2 states) was never emitted (FLAG-5). Derive condition 1 from
          // the live MID dp; 2–3 only resolve when the full cascade is active. TASK-CASCADE-WATCH.
          const met = i === 0 ? (cascade.mid_dp ?? 0) <= CASCADE_TRIGGER: cascade.active
          return (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${
              met ? 'bg-state-cascadeWatch ring-2 ring-state-cascadeWatch/60' : 'bg-text-disabled'
            }`} />
            <span className={`text-xs ${met ? 'text-state-cascadeWatch font-medium' : 'text-text-tertiary'}`}>
              {label}
            </span>
            <span className={`text-xs ml-auto ${met ? 'text-state-cascadeWatch font-bold' : 'text-text-muted'}`}>
              {met ? '✓ MET' : '✗'}
            </span>
          </div>
          )
        })}
      </div>

      {midDpHistory && midDpHistory.length > 1 && (
        <div className="mt-2 flex items-center gap-1 text-xs font-price flex-wrap">
          <span className="text-text-muted">MID trend:</span>
          {midDpHistory.slice(-3).map((reading, i, arr) => (
            <span key={i}>
              <span className={
                reading.value <= CASCADE_TRIGGER? 'text-state-stop' :
                reading.value <= -0.300 ? 'text-state-cascadeWatch' :
                reading.value >= 0.300  ? 'text-state-hold' :
                'text-text-secondary'
              }>
                {reading.value.toFixed(3)}
              </span>
              {i < arr.length - 1 && <span className="text-text-muted"> → </span>}
            </span>
          ))}
          {trend !== null && (
            <span className={trend < 0 ? 'text-state-stop ml-1' : 'text-state-hold ml-1'}>
              {trend < 0 ? '↓' : '↑'}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5">
        {active ? (
          <AlertBadge type="critical" label="CASCADE ACTIVE" detail="Unimpeded downside — no floor below MID" />
        ) : gap !== null ? (
          <span className="text-xs text-text-muted">{gap.toFixed(3)} remaining to cascade threshold</span>
        ) : (
          <AlertBadge type="watch" label="Past threshold" detail="Waiting for S1/S2 conditions" />
        )}
      </div>

      </div>
      <CascadeThermometer midDp={midDp} />
      </div>
    </div>
  )
})
