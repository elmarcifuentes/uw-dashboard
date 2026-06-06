import AlertBadge from './AlertBadge'

export default function ImmediateRiskCard({ cascade, levels, structureBreak }) {
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool ?? 0
  const gap    = Math.abs(-0.700 - midDp)
  const isHigh = cascade?.active || structureBreak?.active
  const isMed  = !isHigh && midDp <= -0.500

  const border = isHigh ? 'border-red-600' : isMed ? 'border-amber-600' : 'border-gray-800'
  const bg     = isHigh ? 'bg-red-950/30'  : isMed ? 'bg-amber-950/20'  : 'bg-[#111827]'

  return (
    <div className={`border rounded-lg p-4 ${border} ${bg}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Immediate Risk</div>

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
            c.met ? 'bg-red-950/60 border border-red-800/60' : 'bg-gray-900/40 border border-gray-800/40'
          }`}>
            <span className={`text-sm font-bold leading-none ${c.met ? 'text-red-400' : 'text-gray-700'}`}>
              {c.met ? '✓' : '○'}
            </span>
            <span className={`text-xs ${c.met ? 'text-red-300 font-medium' : 'text-gray-600'}`}>
              {c.label}
            </span>
            {c.met && <span className="ml-auto text-xs text-red-500 font-bold">MET</span>}
          </div>
        ))}
      </div>

      {structureBreak?.active && (
        <div className="mt-2 text-xs text-amber-400">⚠ Structure break {structureBreak.direction}</div>
      )}
      {levels?.length > 0 && levels.every(l => l.classification === 'no_edge') && !cascade?.active && (
        <div className="text-xs text-gray-600 mt-2 border-t border-gray-800 pt-2">
          ○ All levels no_edge — no institutional edge today
        </div>
      )}
    </div>
  )
}
