import { useState, useEffect } from 'react'

const FOCUS_TICKERS = ['SPY', 'QQQ', 'XLK', 'XLC', 'XLY', 'XLF', 'XLE']

export default function SectorETF({ apiUrl }) {
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/sector-etfs`)
      .then(r => r.json())
      .then(data => {
        const all = data.data || []
        // Compute change pct from last vs prev_close
        const withChange = all.map(s => ({
          ...s,
          changePct: s.prev_close && s.last
            ? (parseFloat(s.last) - parseFloat(s.prev_close)) / parseFloat(s.prev_close)
            : null,
        }))
        // Filter to focus tickers, preserve order
        const focused = FOCUS_TICKERS
          .map(t => withChange.find(s => s.ticker === t))
          .filter(Boolean)
        setSectors(focused)
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
  if (sectors.length === 0) return null

  const spy = sectors.find(s => s.ticker === 'SPY')
  const xlk = sectors.find(s => s.ticker === 'XLK')
  const qqq = sectors.find(s => s.ticker === 'QQQ')  // may not exist in this endpoint

  // Context line
  let context = 'Mixed sector flow — evaluate individually'
  const spyDown  = spy?.changePct != null && spy.changePct < -0.001
  const xlkDown  = xlk?.changePct != null && xlk.changePct < -0.001
  const spyUp    = spy?.changePct != null && spy.changePct > 0.001
  const xlkUp    = xlk?.changePct != null && xlk.changePct > 0.001

  if (xlkDown && spyDown)           context = '⚠ Broad market selloff — reduce position size'
  else if (xlkDown && spyUp)        context = 'Tech-specific weakness — broad market holding'
  else if (xlkUp && spyUp)          context = '✓ Tech leading — QQQ setups confirmed'
  else if (spyDown && !xlkDown)     context = 'Non-tech weakness — tech relatively resilient'

  return (
    <div className="bg-bg-card2/60 rounded border border-border-default p-3">
      <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Sector Flow</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {sectors.map(s => {
          const pct = s.changePct
          const isUp   = pct != null && pct > 0.001
          const isDown = pct != null && pct < -0.001
          const cls = isUp
            ? 'border-green-600 text-green-400'
            : isDown
            ? 'border-red-600 text-red-400'
            : 'border-border-strong text-text-secondary'
          return (
            <span key={s.ticker} className={`border rounded px-1.5 py-0.5 text-xs font-mono ${cls}`}>
              {s.ticker} {isUp ? '↑' : isDown ? '↓' : '→'}{' '}
              {pct != null ? `${(pct * 100).toFixed(1)}%` : '—'}
            </span>
          )
        })}
      </div>
      <div className={`text-xs italic ${
        context.startsWith('⚠') ? 'text-amber-400' :
        context.startsWith('✓') ? 'text-green-400' : 'text-text-tertiary'
      }`}>
        {context}
      </div>
    </div>
  )
}
