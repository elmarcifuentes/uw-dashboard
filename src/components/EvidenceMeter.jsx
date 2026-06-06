export default function EvidenceMeter({ levels, etfDirection }) {
  if (!levels?.length) return null

  const buyCount  = levels.filter(l => l.classification === 'buy_support').length
  const sellCount = levels.filter(l => l.classification === 'sell_resistance').length
  const avgDp     = levels.reduce((s, l) => s + (l.dark_pool || 0), 0) / levels.length
  const flowBias  = (buyCount - sellCount) / levels.length

  const dpPct  = Math.round(((avgDp + 1) / 2) * 100)
  const flPct  = Math.round(((flowBias + 1) / 2) * 100)
  const etfPct = etfDirection === 'bullish' ? 65 : etfDirection === 'bearish' ? 35 : 50

  const meters = [
    { label: 'Dark Pool', pct: dpPct,  value: avgDp.toFixed(3) },
    { label: 'Flow',      pct: flPct,  value: `${buyCount}B/${sellCount}S` },
    { label: 'ETF Tide',  pct: etfPct, value: etfDirection || 'neutral' },
  ]

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Signal Evidence</div>
      <div className="space-y-2">
        {meters.map(m => {
          const isBull = m.pct > 55, isBear = m.pct < 45
          const barColor = isBull ? 'bg-green-500' : isBear ? 'bg-red-500' : 'bg-gray-500'
          return (
            <div key={m.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-20 shrink-0">{m.label}</span>
              <div className="flex-1 relative h-1.5 bg-gray-800 rounded">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
                {m.pct >= 50
                  ? <div className={`absolute top-0 bottom-0 left-1/2 rounded-r ${barColor}`} style={{ width: `${(m.pct - 50) * 2}%` }} />
                  : <div className={`absolute top-0 bottom-0 right-1/2 rounded-l ${barColor}`} style={{ width: `${(50 - m.pct) * 2}%` }} />
                }
              </div>
              <span className="text-xs font-mono text-gray-500 w-16 text-right shrink-0">{m.value}</span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-xs text-red-600">← Bearish</span>
        <span className="text-xs text-green-600">Bullish →</span>
      </div>
    </div>
  )
}
