import { useState, useEffect } from 'react'

function bucket(entries) {
  const today = [], thisWeek = [], nextWeek = [], later = []
  entries.forEach(e => {
    const dte = e.dte ?? 0
    if (dte === 0)       today.push(e)
    else if (dte <= 7)   thisWeek.push(e)
    else if (dte <= 14)  nextWeek.push(e)
    else                 later.push(e)
  })
  return { today, thisWeek, nextWeek, later }
}

function netGex(entries) {
  return entries.reduce((sum, e) =>
    sum + parseFloat(e.call_gex || 0) + parseFloat(e.put_gex || 0), 0)
}

const BARS = [
  { key: 'today',    label: 'Today (0DTE)', color: 'bg-amber-500' },
  { key: 'thisWeek', label: 'This week',    color: 'bg-teal-500'  },
  { key: 'nextWeek', label: 'Next week',    color: 'bg-blue-500'  },
  { key: 'later',    label: 'Monthly+',     color: 'bg-gray-500'  },
]

const fmtK = v => {
  const abs = Math.abs(v)
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${(v / 1e3).toFixed(0)}K`
}

export default function GexByExpiry({ apiUrl }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/gex-expiry`)
      .then(r => r.json())
      .then(d => { setData(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [apiUrl])

  if (loading || !data) return null

  const buckets  = bucket(data)
  const gexVals  = { today: netGex(buckets.today), thisWeek: netGex(buckets.thisWeek), nextWeek: netGex(buckets.nextWeek), later: netGex(buckets.later) }
  const absVals  = Object.fromEntries(Object.entries(gexVals).map(([k, v]) => [k, Math.abs(v)]))
  const total    = Object.values(absVals).reduce((s, v) => s + v, 0) || 1
  const pcts     = Object.fromEntries(Object.entries(absVals).map(([k, v]) => [k, v / total * 100]))
  const todayPct = pcts.today

  let warning = '✓ Low expiry — GEX cage stable through the week'
  let warnColor = 'text-gray-500'
  if (todayPct >= 40) { warning = '⚠ High expiry today — levels less reliable after close'; warnColor = 'text-amber-400' }
  else if (todayPct >= 20) { warning = 'Moderate expiry today — watch level quality into close'; warnColor = 'text-yellow-400' }

  return (
    <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">GEX by Expiry</div>
      <div className="flex flex-col gap-1.5 mb-2">
        {BARS.map(({ key, label, color }) => {
          const pct = pcts[key] ?? 0
          const val = gexVals[key] ?? 0
          const barW = Math.max(2, Math.round(pct))
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${barW}%` }} />
              </div>
              <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
              <span className="text-xs font-mono text-gray-500 w-16 text-right">{fmtK(val)}</span>
            </div>
          )
        })}
      </div>
      <div className={`text-xs italic ${warnColor}`}>{warning}</div>
    </div>
  )
}
