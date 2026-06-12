export default function EvidenceMeter({ levels }) {
  if (!levels?.length) return null

  const buyCount  = levels.filter(l => l.classification === 'buy_support').length
  const sellCount = levels.filter(l => l.classification === 'sell_resistance').length
  const avgDp     = levels.reduce((s, l) => s + (l.dark_pool || 0), 0) / levels.length
  const flowBias  = (buyCount - sellCount) / levels.length

  const dpPct = Math.round(((avgDp + 1) / 2) * 100)
  const flPct = Math.round(((flowBias + 1) / 2) * 100)

  const flowLabel = buyCount > sellCount ? `↑ ${buyCount} buy`
    : sellCount > buyCount ? `↓ ${sellCount} sell`
    : 'neutral'

  // ETF Tide row removed (FLAG-9/10): it rendered a faked 62/38/50 magnitude for a direction
  // already shown in the adjacent "ETF Tide" stat. Only categorical etf_direction is exposed
  // (no real magnitude), so there is nothing real to wire here without a server change.
  const meters = [
    { label: 'Dark Pool', pct: dpPct, value: avgDp.toFixed(3) },
    { label: 'Flow',      pct: flPct, value: flowLabel },
  ]

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
      <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">Signal Evidence</div>
      <div className="space-y-2">
        {meters.map(m => {
          const isBull = m.pct > 55, isBear = m.pct < 45
          const barColor = isBull ? 'bg-signal-support' : isBear ? 'bg-signal-resistance' : 'bg-signal-neutral'
          return (
            <div key={m.label} className="flex items-center gap-3">
              <span style={{ minWidth: '80px', flexShrink: 0 }}
                    className="text-xs text-text-tertiary whitespace-nowrap">
                {m.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}
                   className="relative h-1.5 bg-bg-elevated rounded overflow-hidden">
                <div className="absolute inset-y-0 left-1/2 w-px bg-bg-card2 z-10" />
                {m.pct >= 50
                  ? <div className={`absolute inset-y-0 left-1/2 rounded-r ${barColor}`} style={{ width: `${(m.pct - 50) * 2}%` }} />
                  : <div className={`absolute inset-y-0 right-1/2 rounded-l ${barColor}`} style={{ width: `${(50 - m.pct) * 2}%` }} />
                }
              </div>
              <span style={{ minWidth: '64px', flexShrink: 0, textAlign: 'right' }}
                    className="text-xs font-mono text-text-tertiary whitespace-nowrap">
                {m.value}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-xs text-signal-resistance/80">← Bearish</span>
        <span className="text-xs text-signal-support/80">Bullish →</span>
      </div>
    </div>
  )
}
