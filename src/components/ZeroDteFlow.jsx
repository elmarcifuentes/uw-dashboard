import { useState, useEffect } from 'react'

const fmtM = n => '$' + (n / 1e6).toFixed(1) + 'M'
const fmtK = n => (n / 1e3).toFixed(0) + 'K'
const ratioColor = r => r > 1.2 ? 'text-green-400' : r < 0.83 ? 'text-red-400' : 'text-text-secondary'

const BIAS_COLORS = {
  bullish: { bg: 'bg-green-950', border: 'border-green-700', text: 'text-green-400', badge: 'bg-green-800 text-green-300' },
  bearish: { bg: 'bg-red-950',   border: 'border-red-700',   text: 'text-red-400',   badge: 'bg-red-800 text-red-300'   },
  mixed:   { bg: 'bg-bg-elevated',  border: 'border-border-strong',  text: 'text-text-secondary',  badge: 'bg-bg-elevated text-text-secondary' },
}

export default function ZeroDteFlow({ apiUrl }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/flow-expiry`)
      .then(r => r.json())
      .then(json => {
        const rows   = json.data || []
        // Use ET timezone date — markets trade on ET date, not UTC
        const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        const zdte  = rows.find(r => r.expiry === todayET) || rows.find(r => r.expiry === rows[0]?.date)

        if (!zdte) { setData({ noZdte: true }); setLoading(false); return }

        const callPrem    = parseFloat(zdte.call_premium)
        const putPrem     = parseFloat(zdte.put_premium)
        const callAggPrem = parseFloat(zdte.call_premium_ask_side)
        const putAggPrem  = parseFloat(zdte.put_premium_ask_side)
        const callOtmPrem = parseFloat(zdte.call_otm_premium)
        const putOtmPrem  = parseFloat(zdte.put_otm_premium)
        const callVol     = parseInt(zdte.call_volume)
        const putVol      = parseInt(zdte.put_volume)
        const callAggVol  = parseInt(zdte.call_volume_ask_side)
        const putAggVol   = parseInt(zdte.put_volume_ask_side)

        const premRatio = putPrem  > 0 ? callPrem    / putPrem    : 0
        const aggRatio  = putAggPrem > 0 ? callAggPrem / putAggPrem : 0
        const otmRatio  = putOtmPrem > 0 ? callOtmPrem / putOtmPrem : 0

        const bullishSignals = [premRatio > 1.2, aggRatio > 1.2, otmRatio > 1.2].filter(Boolean).length
        const bearishSignals = [premRatio < 0.83, aggRatio < 0.83, otmRatio < 0.83].filter(Boolean).length
        const bias = bullishSignals >= 2 ? 'bullish' : bearishSignals >= 2 ? 'bearish' : 'mixed'

        const context = {
          bullish: 'Aggressive call buying dominant — 0DTE flow favors upside',
          bearish: 'Aggressive put buying dominant — 0DTE flow favors downside',
          mixed:   'Mixed 0DTE positioning — no strong directional conviction',
        }[bias]

        setData({ expiry: zdte.expiry, callPrem, putPrem, premRatio, callAggPrem, putAggPrem, aggRatio, callOtmPrem, putOtmPrem, otmRatio, callVol, putVol, callAggVol, putAggVol, bullishSignals, bearishSignals, bias, context, noZdte: false })
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

  if (data.noZdte) return (
    <div className="bg-bg-elevated border border-border-default rounded p-3">
      <span className="text-xs text-text-tertiary">No 0DTE expiry today</span>
    </div>
  )

  const c = BIAS_COLORS[data.bias]

  return (
    <div className={`border rounded p-3 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-secondary uppercase tracking-wide">0DTE Flow — {data.expiry}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.badge}`}>{data.bias.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        {[
          { label: 'Total Premium', ratio: data.premRatio, call: data.callPrem, put: data.putPrem },
          { label: 'Aggressive Buy', ratio: data.aggRatio, call: data.callAggPrem, put: data.putAggPrem },
          { label: 'OTM Speculative', ratio: data.otmRatio, call: data.callOtmPrem, put: data.putOtmPrem },
        ].map(({ label, ratio, call, put }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-text-tertiary mb-1">{label}</div>
            <div className={`text-xs font-mono font-bold ${ratioColor(ratio)}`}>{ratio.toFixed(2)}:1</div>
            <div className="text-xs text-text-muted">C {fmtM(call)} / P {fmtM(put)}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mb-2 text-xs text-text-tertiary">
        <span>Vol: C {fmtK(data.callVol)} / P {fmtK(data.putVol)}</span>
        <span>Aggr: C {fmtK(data.callAggVol)} / P {fmtK(data.putAggVol)}</span>
      </div>

      <p className={`text-xs ${c.text}`}>{data.context}</p>
      <p className="text-xs text-text-muted mt-0.5">{data.bullishSignals}/3 bullish · {data.bearishSignals}/3 bearish signals</p>
    </div>
  )
}
