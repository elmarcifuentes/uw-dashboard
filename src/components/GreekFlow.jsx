import { useState, useEffect } from 'react'

const fmtM = n => (n >= 0 ? '+' : '') + (n / 1e6).toFixed(1) + 'M'
const signColor = n => n > 0 ? 'text-green-400' : 'text-red-400'
const barColor  = n => n > 0 ? 'bg-green-500'   : 'bg-red-500'

const BIAS_COLORS = { bullish: 'text-green-400', bearish: 'text-red-400', mixed: 'text-text-secondary' }

export default function GreekFlow({ apiUrl }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/greek-flow`)
      .then(r => r.json())
      .then(json => {
        const rows = json.data || []
        if (!rows.length) { setLoading(false); return }

        const totals = rows.reduce((acc, row) => ({
          dirDelta:    acc.dirDelta    + parseFloat(row.dir_delta_flow     || 0),
          dirVega:     acc.dirVega     + parseFloat(row.dir_vega_flow      || 0),
          otmDirDelta: acc.otmDirDelta + parseFloat(row.otm_dir_delta_flow || 0),
          otmDirVega:  acc.otmDirVega  + parseFloat(row.otm_dir_vega_flow  || 0),
          totalDelta:  acc.totalDelta  + parseFloat(row.total_delta_flow   || 0),
          totalVega:   acc.totalVega   + parseFloat(row.total_vega_flow    || 0),
        }), { dirDelta: 0, dirVega: 0, otmDirDelta: 0, otmDirVega: 0, totalDelta: 0, totalVega: 0 })

        const bullishSignals = [totals.dirDelta > 0, totals.dirVega > 0, totals.otmDirDelta > 0].filter(Boolean).length
        const bias = bullishSignals >= 2 ? 'bullish' : bullishSignals === 0 ? 'bearish' : 'mixed'
        const context = {
          bullish: 'Dealer hedging flow bullish — delta + vega confirm upside',
          bearish: 'Dealer hedging flow bearish — delta + vega confirm downside',
          mixed:   'Mixed greek flow — no clear directional conviction',
        }[bias]

        setData({ totals, bullishSignals, bias, context, barCount: rows.length })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiUrl])

  const skeleton = (
    <div className="bg-bg-card2/60 rounded border border-border-default p-3 animate-pulse">
      <div className="h-2.5 bg-bg-elevated rounded w-24 mb-2" />
      <div className="h-2 bg-bg-elevated rounded w-full mb-1.5" />
      <div className="h-2 bg-bg-elevated rounded w-3/4" />
    </div>
  )

  if (loading) return skeleton
  if (!data || !data.totals) return null

  const { totals } = data
  const maxAbs = Math.max(Math.abs(totals.dirDelta), Math.abs(totals.dirVega), Math.abs(totals.otmDirDelta)) || 1
  const pct = n => Math.max(2, Math.round((Math.abs(n) / maxAbs) * 100))

  const rows = [
    { label: 'Dir Delta', value: totals.dirDelta,    desc: 'Dealer stock hedging' },
    { label: 'Dir Vega',  value: totals.dirVega,     desc: 'IV pressure direction' },
    { label: 'OTM Delta', value: totals.otmDirDelta, desc: 'Speculative positioning' },
  ]

  return (
    <div className="bg-bg-card2/60 rounded border border-border-default p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-tertiary uppercase tracking-wider">Greek Flow — Intraday</span>
        <span className={`text-xs font-bold ${BIAS_COLORS[data.bias]}`}>{data.bias.toUpperCase()}</span>
      </div>

      <div className="flex flex-col gap-1.5 mb-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span style={{ minWidth: '80px', flexShrink: 0 }}
                  className="text-xs text-text-tertiary whitespace-nowrap">
              {row.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}
                 className="bg-bg-elevated rounded-full h-1.5 overflow-hidden">
              <div className={`h-full rounded-full ${barColor(row.value)}`} style={{ width: `${pct(row.value)}%` }} />
            </div>
            <span style={{ minWidth: '64px', flexShrink: 0, textAlign: 'right' }}
                  className={`text-xs font-mono whitespace-nowrap ${signColor(row.value)}`}>
              {fmtM(row.value)}
            </span>
          </div>
        ))}
      </div>

      <p className={`text-xs ${BIAS_COLORS[data.bias]}`}>{data.context}</p>
      <p className="text-xs text-text-muted mt-0.5">{data.bullishSignals}/3 bullish signals · {data.barCount} bars</p>
    </div>
  )
}
