import { useState, useEffect } from 'react'

const fmt = v => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`
  return `$${(abs / 1e3).toFixed(0)}K`
}

export default function ZeroDteFlow({ apiUrl }) {
  const [zdte, setZdte] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/flow-expiry`)
      .then(r => r.json())
      .then(d => {
        const today = new Date().toISOString().split('T')[0]
        const entry = (d.data || []).find(e => e.expiry === today)
        setZdte(entry || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiUrl])

  if (loading) return null

  if (!zdte) {
    return (
      <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">0DTE Flow</div>
        <div className="text-xs text-gray-600">No 0DTE expiry today</div>
      </div>
    )
  }

  const callPrem = parseFloat(zdte.call_premium || 0)
  const putPrem  = parseFloat(zdte.put_premium  || 0)
  const total    = callPrem + putPrem || 1
  const callPct  = (callPrem / total) * 100
  const putPct   = (putPrem  / total) * 100
  const ratio    = putPrem > 0 ? callPrem / putPrem : 0

  let context    = 'Mixed 0DTE flow — no strong directional read'
  let ctxColor   = 'text-gray-500'
  if (ratio > 1.5)  { context = 'Strong 0DTE call buying — intraday bullish conviction';  ctxColor = 'text-green-400' }
  else if (ratio < 0.67) { context = 'Strong 0DTE put buying — intraday bearish conviction'; ctxColor = 'text-red-400' }

  const barCall = Math.max(2, Math.round(callPct))
  const barPut  = Math.max(2, Math.round(putPct))

  return (
    <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">0DTE Flow — Today</div>
      <div className="flex flex-col gap-1.5 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400 w-10 shrink-0">Calls</span>
          <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${barCall}%` }} />
          </div>
          <span className="text-xs font-mono text-green-400 w-16 text-right">{fmt(callPrem)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400 w-10 shrink-0">Puts</span>
          <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${barPut}%` }} />
          </div>
          <span className="text-xs font-mono text-red-400 w-16 text-right">{fmt(putPrem)}</span>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-1 font-mono">
        Ratio: {ratio.toFixed(2)}:1 call/put
        {' · '}vol {(zdte.call_volume + zdte.put_volume).toLocaleString()}
      </div>
      <div className={`text-xs italic ${ctxColor}`}>{context}</div>
    </div>
  )
}
