import AlertBadge from './AlertBadge'
import { TriangleAlert } from 'lucide-react'

export default function ImmediateRiskCard({ cascade, levels, structureBreak }) {
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool ?? 0
  const gap    = Math.abs(-0.700 - midDp)
  const isHigh = cascade?.active || structureBreak?.active
  const isMed  = !isHigh && midDp <= -0.500

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

      <div className="space-y-1.5 mt-3">
        {[
          { label: 'MID dp ≤ -0.700', met: cascade?.conditions?.[0] },
          { label: 'S1 zero/artifact', met: cascade?.conditions?.[1] },
          { label: 'S2 structural void', met: cascade?.conditions?.[2] },
        ].map((c, i) => (
          <div key={i} className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${
            c.met ? 'bg-state-stopSoft border border-state-stop/40' : 'bg-bg-card2/40 border border-border-subtle/40'
          }`}>
            <span className={`text-sm font-bold leading-none ${c.met ? 'text-state-stop' : 'text-text-disabled'}`}>
              {c.met ? '✓' : '○'}
            </span>
            <span className={`text-xs ${c.met ? 'text-state-stop/80 font-medium' : 'text-text-muted'}`}>
              {c.label}
            </span>
            {c.met && <span className="ml-auto text-xs text-state-stop font-bold">MET</span>}
          </div>
        ))}
      </div>

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
