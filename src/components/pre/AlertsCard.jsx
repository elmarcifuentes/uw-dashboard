import AlertBadge from '../AlertBadge'

const CONDITIONS = [
  'MID dp ≤ -0.700',
  'S1 zero/artifact',
  'S2 structural void',
]

export default function AlertsCard({ cascade, structureBreak, levels, currentPrice }) {
  const mid   = levels?.find(l => l.id === 'MID')
  const midDp = mid?.dark_pool ?? 0
  const gap   = Math.abs(-0.700 - midDp).toFixed(3)

  const isHighRisk = cascade?.active || structureBreak?.active
  const isCaution  = !isHighRisk && midDp <= -0.500

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${
      isHighRisk ? 'border-red-700 bg-red-950/20'
        : isCaution ? 'border-amber-700 bg-amber-950/10'
        : 'border-gray-800 bg-[#111827]'
    }`}>
      <div className="text-xs text-gray-500 uppercase tracking-wider">Alerts</div>

      {/* Cascade status */}
      {cascade?.active ? (
        <AlertBadge
          type="critical"
          label="CASCADE ACTIVE"
          detail={`MID dp ${midDp.toFixed(3)} — threshold crossed`}
        />
      ) : isCaution ? (
        <AlertBadge
          type="watch"
          label="APPROACHING THRESHOLD"
          detail={`MID dp ${midDp.toFixed(3)} — ${gap} from -0.700`}
        />
      ) : (
        <AlertBadge
          type="info"
          label="CASCADE SAFE"
          detail={`MID dp ${midDp.toFixed(3)} — structure intact`}
        />
      )}

      {/* Cascade conditions */}
      <div className="space-y-1">
        {CONDITIONS.map((label, i) => {
          const met = cascade?.conditions?.[i]
          return (
            <div key={i} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
              met ? 'bg-red-950/50 border border-red-900/50' : 'bg-gray-900/30'
            }`}>
              <span className={met ? 'text-red-400 font-bold' : 'text-gray-700'}>
                {met ? '✓' : '○'}
              </span>
              <span className={met ? 'text-red-300' : 'text-gray-600'}>{label}</span>
              {met && <span className="ml-auto text-red-500 font-bold text-xs">MET</span>}
            </div>
          )
        })}
      </div>

      {/* Structure break */}
      {structureBreak?.active && (
        <div className="border-t border-gray-800 pt-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-xs text-amber-400 font-medium">
              Structure break {structureBreak.direction?.toUpperCase()}
            </span>
          </div>
          {structureBreak.r3 && currentPrice != null && (
            <div className="text-xs text-gray-600 mt-1 font-mono ml-3">
              S3 ${structureBreak.r3?.toFixed(2)} — ${Math.abs(Number(currentPrice) - structureBreak.r3).toFixed(2)} away
            </div>
          )}
        </div>
      )}

      {/* Imminent break (not active but close) */}
      {!structureBreak?.active && (
        (() => {
          const toR2 = structureBreak?.distance_to_r2
          const toS2 = structureBreak?.distance_to_s2
          const imminent = (toR2 != null && toR2 <= 0.50) || (toS2 != null && toS2 <= 0.50)
          if (!imminent) return null
          const label = toR2 != null && toR2 <= 0.50 ? `R2 $${toR2.toFixed(2)}` : `S2 $${toS2.toFixed(2)}`
          return (
            <div className="border-t border-gray-800 pt-2">
              <span className="text-xs text-amber-400">⚠ {label} — break imminent</span>
            </div>
          )
        })()
      )}
    </div>
  )
}
