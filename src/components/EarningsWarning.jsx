import { useState, useEffect } from 'react'

const QQQ_MAJOR_HOLDINGS = new Set([
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG',
  'TSLA','AVGO','COST','NFLX','AMD','ADBE','INTC','QCOM',
  'TXN','AMAT','MU','INTU','PYPL','CSCO','HON','TMUS',
  'BKNG','REGN','ISRG','MRNA','KLAC','LRCX',
])

export default function EarningsWarning({ apiUrl }) {
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/earnings-premarket`)
      .then(r => r.json())
      .then(data => {
        const all = data.data || []
        const major = all.filter(e => QQQ_MAJOR_HOLDINGS.has(e.symbol?.toUpperCase()))
        setEarnings(major)
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
  if (earnings.length === 0) return null

  return (
    <div className="bg-amber-950 border border-amber-500 rounded p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-400 text-sm font-bold">⚠ QQQ COMPONENT EARNINGS TODAY</span>
        <span className="text-amber-300 text-xs">— gap risk pre-market</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {earnings.map((e, i) => {
          const movePct = e.expected_move_perc
            ? `±${(parseFloat(e.expected_move_perc) * 100).toFixed(1)}%`
            : null
          return (
            <div key={i} className="flex items-center gap-3 flex-wrap">
              <span className="text-amber-400 font-bold font-mono text-sm w-16 shrink-0">{e.symbol}</span>
              <span className="text-text-secondary text-xs shrink-0">{e.full_name}</span>
              <span className="text-text-tertiary text-xs shrink-0">
                {e.report_time === 'premarket' ? '🌅 Pre-mkt' : '🌆 AH'}
              </span>
              {e.street_mean_est && (
                <span className="text-text-tertiary text-xs">EPS est: {e.street_mean_est}</span>
              )}
              {movePct && (
                <span className="text-amber-600 text-xs font-mono ml-auto shrink-0">{movePct} expected</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-amber-700 text-xs mt-2 italic">
        Major component earnings can cause gap opens and unusual dark pool activity.
        Verify level validity after open.
      </p>
    </div>
  )
}
