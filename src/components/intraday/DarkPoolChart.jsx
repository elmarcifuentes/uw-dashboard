import { memo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const LEVEL_COLORS = {
  R2: '#1A7A4A', R1: '#4ade80',
  MID: '#38bdf8',
  S1: '#f87171', S2: '#C0392B',
}

export default memo(function DarkPoolChart({ history, compact }) {
  const rescores = history.filter(e => e.type === 'rescore')

  const chartData = [...rescores].reverse().map(e => ({
    time: new Date(e.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }),
    R2:  e.result?.levels?.find(l => l.id === 'R2')?.dark_pool  ?? null,
    R1:  e.result?.levels?.find(l => l.id === 'R1')?.dark_pool  ?? null,
    MID: e.result?.levels?.find(l => l.id === 'MID')?.dark_pool ?? null,
    S1:  e.result?.levels?.find(l => l.id === 'S1')?.dark_pool  ?? null,
    S2:  e.result?.levels?.find(l => l.id === 'S2')?.dark_pool  ?? null,
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary text-sm">
        Waiting for rescore data…
      </div>
    )
  }

  return (
    <div>
      <div className="text-xs text-text-tertiary mb-2">
        Dark pool strength per level — red dashed = cascade threshold (−0.700)
      </div>
      <div style={{ height: compact ? 256 : 384 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0D1B2A', border: '1px solid #374151', fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={-0.700} stroke="#ef4444" strokeDasharray="4 4"
              label={{ value: 'cascade', fill: '#ef4444', fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine y={0} stroke="#374151" />
            {Object.entries(LEVEL_COLORS).map(([key, color]) => (
              <Line key={key} type="monotone" dataKey={key}
                stroke={color} dot={false} strokeWidth={2}
                connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
})