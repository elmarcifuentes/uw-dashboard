export default function ScenarioCards({
  assistantRead, levels, cascade, currentPrice, nqRatio
}) {
  if (!assistantRead) return null

  const sellLevels = levels?.filter(l =>
    l.classification === 'sell_resistance'
  ).sort((a, b) => a.price - b.price)

  const buyLevels = levels?.filter(l =>
    l.classification === 'buy_support'
  ).sort((a, b) => b.price - a.price)

  const nq = (p) => nqRatio
    ? ` (NQ ${Math.round(p * nqRatio).toLocaleString()})`
    : ''

  const bullishTarget = sellLevels?.[0]
    ? `Break and hold above ${sellLevels[0].id} $${sellLevels[0].price?.toFixed(2)}${nq(sellLevels[0].price)} opens path to next resistance.`
    : assistantRead.next

  const bearishTrigger = cascade?.conditions?.[0]
    ? 'Cascade threshold met — MID dark pool past -0.700. S1 and S2 conditions determine floor.'
    : buyLevels?.[0]
    ? `Failure at ${buyLevels[0].id} $${buyLevels[0].price?.toFixed(2)}${nq(buyLevels[0].price)} opens downside. Watch for structural void.`
    : assistantRead.risk

  const noTrade = assistantRead.invalidation

  const scenarios = [
    {
      label: 'BULLISH PATH',
      border: 'border-green-900/50',
      bg: 'bg-green-950/10',
      labelColor: 'text-green-400',
      icon: '↑',
      content: bullishTarget,
      sub: buyLevels?.length > 0
        ? `Support: ${buyLevels.map(l => `${l.id} $${l.price?.toFixed(2)}`).join(', ')}`
        : 'No classified support active',
    },
    {
      label: 'BEARISH PATH',
      border: 'border-red-900/50',
      bg: 'bg-red-950/10',
      labelColor: 'text-red-400',
      icon: '↓',
      content: bearishTrigger,
      sub: sellLevels?.length > 0
        ? `Resistance: ${sellLevels.map(l => `${l.id} $${l.price?.toFixed(2)}`).join(', ')}`
        : 'No classified resistance active',
    },
    {
      label: 'INVALIDATION',
      border: 'border-gray-700',
      bg: 'bg-gray-900/30',
      labelColor: 'text-gray-400',
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
          <p className="text-xs text-gray-300 leading-relaxed mb-2">
            {s.content || '—'}
          </p>
          <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">
            {s.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
