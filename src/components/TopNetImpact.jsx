import { useState, useEffect } from 'react'

const fmt = v => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`
  return `$${(abs / 1e3).toFixed(0)}K`
}

export default function TopNetImpact({ apiUrl }) {
  const [impacts, setImpacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/top-net-impact`)
      .then(r => r.json())
      .then(data => {
        const all = data.data || []
        // Sort by absolute net_premium descending, take top 5
        const top5 = [...all]
          .sort((a, b) => Math.abs(b.net_premium) - Math.abs(a.net_premium))
          .slice(0, 5)
        setImpacts(top5)
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

  const bullish = impacts.filter(s => s.net_premium > 0).length
  const bearish  = impacts.filter(s => s.net_premium < 0).length

  return (
    <div className="bg-bg-card2/60 rounded border border-border-default p-3">
      <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Top Movers</div>
      <div className="flex flex-col gap-1">
        {impacts.map((s, i) => {
          const up = s.net_premium > 0
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`text-xs font-mono w-4 ${up ? 'text-green-400' : 'text-red-400'}`}>
                {up ? '↑' : '↓'}
              </span>
              <span className="text-xs font-mono font-bold text-text-primary w-12">{s.ticker}</span>
              <span className={`text-xs font-mono ${up ? 'text-green-400' : 'text-red-400'}`}>
                {up ? '+' : '-'}{fmt(s.net_premium)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-text-muted mt-2">
        Bullish: <span className="text-green-400">{bullish}</span>
        {' · '}
        Bearish: <span className="text-red-400">{bearish}</span>
        {' · '}
        <span className={bullish > bearish ? 'text-green-400' : 'text-red-400'}>
          {bullish > bearish ? 'Net Bullish' : 'Net Bearish'}
        </span>
      </div>
    </div>
  )
}
