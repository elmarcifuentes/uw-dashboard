export default function ScenarioCards({
  assistantRead, levels, cascade, currentPrice, nqRatio, activeSymbol = 'NQ'
}) {
  if (!assistantRead) return null

  const sellLevels = levels?.filter(l =>
    l.classification === 'sell_resistance'
  ).sort((a, b) => a.price - b.price)

  const buyLevels = levels?.filter(l =>
    l.classification === 'buy_support'
  ).sort((a, b) => b.price - a.price)

  const fmtLvl = (l) => {
    if (!l) return ''
    const val = activeSymbol === 'NQ' && nqRatio ? Math.round(l.price * nqRatio * 4) / 4 : l.price
    return '$' + (val?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—')
  }

  const bullishTarget = sellLevels?.[0]
    ? `Break and hold above ${sellLevels[0].id} ${fmtLvl(sellLevels[0])} opens path to next resistance.`
    : assistantRead.next

  const bearishTrigger = cascade?.conditions?.[0]
    ? 'Cascade threshold met — MID dark pool past -0.700. S1 and S2 conditions determine floor.'
    : buyLevels?.[0]
    ? `Failure at ${buyLevels[0].id} ${fmtLvl(buyLevels[0])} opens downside. Watch for structural void.`
    : assistantRead.risk

  const noTrade = assistantRead.invalidation

  const scenarios = [
    {
      label: 'BULLISH PATH',
      border: 'border-border-subtle',
      bg:     'bg-bg-card',
      labelColor: 'text-signal-support',
      icon: '↑',
      content: bullishTarget,
      sub: buyLevels?.length > 0
        ? `Support: ${buyLevels.map(l => `${l.id} ${fmtLvl(l)}`).join(', ')}`
        : 'No classified support active',
    },
    {
      label: 'BEARISH PATH',
      border: 'border-border-subtle',
      bg:     'bg-bg-card',
      labelColor: 'text-signal-resistance',
      icon: '↓',
      content: bearishTrigger,
      sub: sellLevels?.length > 0
        ? `Resistance: ${sellLevels.map(l => `${l.id} ${fmtLvl(l)}`).join(', ')}`
        : 'No classified resistance active',
    },
    {
      label: 'INVALIDATION',
      border: 'border-border-default',
      bg:     'bg-bg-card',
      labelColor: 'text-text-secondary',
      icon: '✕',
      content: noTrade,
      sub: 'Condition that changes the entire read',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {scenarios.map(s => (
        <div key={s.label} className={`border rounded-lg p-4 ${s.border} ${s.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${s.labelColor}`}>{s.icon}</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${s.labelColor}`}>
              {s.label}
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mb-2">
            {s.content || '—'}
          </p>
          <p className="text-xs text-text-muted border-t border-border-subtle pt-2">
            {s.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
