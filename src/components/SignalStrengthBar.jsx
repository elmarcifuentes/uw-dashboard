export default function SignalStrengthBar({ levels }) {
  if (!levels?.length) return null

  const sellCount = levels.filter(l => l.classification === 'sell_resistance').length
  const buyCount  = levels.filter(l => l.classification === 'buy_support').length
  const sellPct   = (sellCount / 5) * 100
  const buyPct    = (buyCount  / 5) * 100
  const neutralPct = 100 - sellPct - buyPct

  return (
    <div className="bg-bg-elevated rounded p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-red-400">{sellCount} SELL</span>
        <span className="text-xs text-text-tertiary uppercase tracking-wide">Signal Strength</span>
        <span className="text-xs text-green-400">{buyCount} BUY</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden">
        <div className="bg-red-500 transition-all duration-500"   style={{ width: `${sellPct}%` }} />
        <div className="bg-bg-card2 transition-all duration-500" style={{ width: `${neutralPct}%` }} />
        <div className="bg-green-500 transition-all duration-500" style={{ width: `${buyPct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-text-muted">bearish</span>
        <span className="text-xs text-text-muted">bullish</span>
      </div>
    </div>
  )
}
