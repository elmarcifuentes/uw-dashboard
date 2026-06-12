import AlertBadge from './AlertBadge'
import { TriangleAlert } from 'lucide-react'
import { CASCADE_TRIGGER, CASCADE_WATCH } from '../utils/cascade'

export default function ImmediateRiskCard({ cascade, levels, structureBreak }) {
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool ?? 0
  const gap    = Math.abs(CASCADE_TRIGGER - midDp)
  const isHigh = cascade?.active || structureBreak?.active
  const isMed  = !isHigh && midDp <= CASCADE_WATCH

  const border = isHigh ? 'border-state-stop' : isMed ? 'border-state-cascadeWatch' : 'border-border-subtle'
  const bg     = isHigh ? 'bg-state-stopSoft'  : isMed ? 'bg-state-cascadeWatchSoft'  : 'bg-bg-card'

  return (
    <div className={`border rounded-lg p-4 ${border} ${bg}`}>
      <div className="text-micro text-text-tertiary uppercase tracking-wider mb-2">Immediate Risk</div>

      <div className="mb-3">
        {cascade?.active ? (
          <AlertBadge type="critical" label="CASCADE ACTIVE" detail="No institutional floor below MID" />
        ) : structureBreak?.active ? (
          <AlertBadge type="critical" label={`STRUCTURE BREAK ${structureBreak.direction?.toUpperCase() ?? ''}`} detail="Price outside GEX range" />
        ) : isMed ? (
          <AlertBadge type="watch" label="APPROACHING CASCADE" detail={`${gap.toFixed(3)} from -0.700 trigger`} />
        ) : (
          <AlertBadge type="info" label="STRUCTURE INTACT" detail={`MID dp ${midDp.toFixed(3)} — all clear`} />
        )}
      </div>

      {/* The 3-condition checklist was removed (FLAG-5): cascade.conditions for S1/S2 was never
          emitted, so conditions 2–3 had no data. The AlertBadge above is the live read
          (cascade.active + MID dp). Trade-aware cascade-watch is TASK-CASCADE-WATCH. */}

      {structureBreak?.active && (
        <div className="mt-2 text-xs text-state-cascadeWatch flex items-center gap-1">
          <TriangleAlert className="w-3 h-3 shrink-0" />
          Structure break {structureBreak.direction}
        </div>
      )}
      {levels?.length > 0 && levels.every(l => l.classification === 'no_edge') && !cascade?.active && (
        <div className="text-xs text-text-muted mt-2 border-t border-border-subtle pt-2">
          ○ All levels no_edge — no institutional edge today
        </div>
      )}
    </div>
  )
}
