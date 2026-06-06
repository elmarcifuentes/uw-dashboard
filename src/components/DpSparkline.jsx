export default function DpSparkline({ history }) {
  if (!history?.length || history.length < 2) return null

  const values = history.map(h => h.value ?? 0)
  const min    = Math.min(...values, -1.0)
  const max    = Math.max(...values, 0.5)
  const range  = max - min || 1

  const W = 60, H = 20
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const trend = values[values.length - 1] - values[0]
  const color = trend < -0.05 ? '#f87171' : trend > 0.05 ? '#4ade80' : '#94a3b8'

  const thresholdY = H - ((-0.700 - min) / range) * H
  const [lx, ly] = pts.split(' ').pop().split(',')

  return (
    <svg width={W} height={H} className="inline-block overflow-visible">
      <line x1="0" y1={thresholdY.toFixed(1)} x2={W} y2={thresholdY.toFixed(1)}
            stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  )
}
