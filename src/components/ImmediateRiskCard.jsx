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

      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cascade?.active ? 'bg-red-500 animate-pulse' : isMed ? 'bg-amber-500' : 'bg-green-500'}`} />
        <span className={`text-sm font-bold ${cascade?.active ? 'text-red-400' : isMed ? 'text-amber-400' : 'text-green-400'}`}>
          {cascade?.active ? 'CASCADE ACTIVE' : isMed ? 'APPROACHING THRESHOLD' : 'STRUCTURE INTACT'}
        </span>
      </div>

      {!cascade?.active && (
        <div className="text-xs text-gray-400 mb-2">
          MID dp {midDp.toFixed(3)} —{' '}
          <span className={isMed ? 'text-amber-400' : 'text-gray-300'}>{gap.toFixed(3)} from -0.700</span>
        </div>
      )}

      <div className="space-y-1">
        {['MID dp ≤ −0.700', 'S1 zero/artifact', 'S2 structural void'].map((label, i) => {
          const met = cascade?.conditions?.[i]
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${met ? 'bg-red-500' : 'bg-gray-700'}`} />
              <span className={`text-xs ${met ? 'text-red-300' : 'text-gray-600'}`}>{label}</span>
            </div>
          )
        })}
      </div>

      {structureBreak?.active && (
        <div className="mt-2 text-xs text-amber-400">⚠ Structure break {structureBreak.direction}</div>
      )}
    </div>
  )
}
