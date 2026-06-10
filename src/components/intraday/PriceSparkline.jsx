export default function PriceSparkline({ history, levels }) {
  if (!history || history.length < 2) return (
    <div className="h-8 bg-bg-card2 rounded mb-2 flex items-center justify-center">
      <span className="text-xs text-text-disabled">Price history building…</span>
    </div>
  )

  const W = 600, H = 60
  const prices    = history.map(h => h.price)
  const allPrices = [...prices, ...(levels?.map(l => l.price) || [])]
  const min   = Math.min(...allPrices) - 0.5
  const max   = Math.max(...allPrices) + 0.5
  const range = max - min || 1

  const toY = p  => H - ((p - min) / range) * H
  const toX = (i, len) => len > 1 ? (i / (len - 1)) * W : W / 2

  const pts  = prices.map((p, i) => `${toX(i, prices.length).toFixed(1)},${toY(p).toFixed(1)}`).join(' ')
  const last = prices[prices.length - 1]

  const CLASS_COLORS = {
    sell_resistance: '#f87171', buy_support: '#4ade80',
    no_edge: '#6b7280', continuation: '#60a5fa',
  }

  return (
    <div className="bg-bg-card2 rounded overflow-hidden mb-2 px-1">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {levels?.map(level => {
          const y     = toY(level.price)
          const color = CLASS_COLORS[level.classification] || '#6b7280'
          return (
            <g key={level.id}>
              <line x1="0" y1={y.toFixed(1)} x2={W} y2={y.toFixed(1)}
                    stroke={color} strokeWidth="0.5" strokeDasharray="4,4" opacity="0.6" />
              <text x="4" y={Math.max(10, y - 2).toFixed(1)} fill={color} fontSize="8" opacity="0.8">
                {level.id}
              </text>
            </g>
          )
        })}
        <polyline points={pts} fill="none" stroke="#fbbf24" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={W} cy={toY(last).toFixed(1)} r="3" fill="#fbbf24" />
      </svg>
    </div>
  )
}
