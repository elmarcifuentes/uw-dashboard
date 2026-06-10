export default function TradePriceLadder({ levels, currentPrice, nqRatio, activeSymbol, activeTrade }) {
  const isNQ = activeSymbol === 'NQ'
  const r    = nqRatio || 41.14

  const fmt = (qqq) => {
    if (isNQ) return (Math.round(qqq * r * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2 })
    return `$${qqq?.toFixed(2)}`
  }

  const fmtTrade = (price) => price != null
    ? (isNQ
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2 })
      : `$${price.toFixed(2)}`)
    : '—'

  // Convert trade prices to QQQ for comparison with levels
  const toQqq = (p) => isNQ ? p / r : p

  const tradeEntry  = activeTrade ? toQqq(activeTrade.entry)  : null
  const tradeTarget = activeTrade ? toQqq(activeTrade.target) : null
  const tradeStop   = activeTrade ? toQqq(activeTrade.stop)   : null

  const sorted = [...(levels || [])].sort((a, b) => b.price - a.price)

  const CLASS_TEXT = {
    sell_resistance: 'text-red-400',
    buy_support:     'text-green-400',
    no_edge:         'text-gray-500',
    continuation:    'text-blue-400',
  }

  // All price points to show crosshairs for
  const pricesToMark = [
    currentPrice != null && { price: currentPrice, label: '▶ NOW', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    activeTrade && tradeEntry  != null && { price: tradeEntry,  label: '● ENTRY',  color: 'text-white',  bg: 'bg-white/5'  },
    activeTrade && tradeTarget != null && { price: tradeTarget, label: '◎ TARGET', color: 'text-green-400', bg: 'bg-green-950/30' },
    activeTrade && tradeStop   != null && { price: tradeStop,   label: '⊗ STOP',   color: 'text-red-400', bg: 'bg-red-950/30' },
  ].filter(Boolean)

  // Merge levels and price markers into a single sorted list
  const allItems = [
    ...sorted.map(l => ({ type: 'level', price: l.price, level: l })),
    ...pricesToMark.map(m => ({ type: 'marker', price: m.price, marker: m })),
  ].sort((a, b) => b.price - a.price)

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Live Levels</div>
      <div className="space-y-0.5 font-mono text-xs">
        {allItems.map((item, i) => {
          if (item.type === 'marker') {
            const m = item.marker
            return (
              <div key={`marker-${i}`} className={`flex items-center gap-2 px-2 py-1 rounded ${m.bg}`}>
                <span className={`font-bold ${m.color}`}>{m.label}</span>
                <div className="flex-1 h-px bg-current opacity-20" />
                <span className={`font-bold ${m.color}`}>{fmtTrade(item.price)}</span>
              </div>
            )
          }

          const level = item.level
          const clsCls = CLASS_TEXT[level.classification] || 'text-gray-500'

          return (
            <div key={level.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/30">
              <span className={`w-8 shrink-0 font-bold ${clsCls}`}>{level.id}</span>
              <span className="text-white w-24 shrink-0">{fmt(level.price)}</span>
              <div className="flex-1 h-2 bg-gray-900 rounded overflow-hidden">
                <div
                  className={`h-full rounded ${
                    level.classification === 'sell_resistance' ? 'bg-red-500'
                      : level.classification === 'buy_support' ? 'bg-green-500'
                      : 'bg-gray-700'
                  }`}
                  style={{ width: `${Math.max(15, Math.min(100, level.score || 0))}%`, opacity: 0.7 }}
                />
              </div>
              <span className="w-10 text-right text-gray-600 shrink-0">{level.score || '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
