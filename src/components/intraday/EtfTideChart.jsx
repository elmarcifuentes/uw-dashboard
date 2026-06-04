import { memo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'

const fmt = v => `$${(Math.abs(v) / 1e6).toFixed(2)}M`

export default memo(function EtfTideChart({ history, compact }) {
  const rescores = history.filter(e => e.type === 'rescore')

  const chartData = [...rescores].reverse().map(e => {
    const levels = e.result?.levels
    const etfDir = levels?.[0]?.etf_direction || 'neutral'
    return {
      time: new Date(e.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false
      }),
      direction: etfDir === 'bullish' ? 1 : etfDir === 'bearish' ? -1 : 0,
    }
  })

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Waiting for rescore data…
      </div>
    )
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">
        ETF tide direction per rescore (+1 bullish / 0 neutral / −1 bearish)
      </div>
      <div style={{ height: compact ? 256 : 384 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0D1B2A', border: '1px solid #374151', fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={v => v === 1 ? 'BULLISH' : v === -1 ? 'BEARISH' : 'NEUTRAL'}
            />
            <ReferenceLine y={0} stroke="#374151" />
            <defs>
              <linearGradient id="etfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area type="stepAfter" dataKey="direction"
              stroke="#38bdf8" fill="url(#etfGrad)"
              strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
})