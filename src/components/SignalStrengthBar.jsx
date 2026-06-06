export default function SignalStrengthBar({ levels }) {
  if (!levels?.length) return null

  const sellCount = levels.filter(l => l.classification === 'sell_resistance').length
  const buyCount  = levels.filter(l => l.classification === 'buy_support').length
  const sellPct   = (sellCount / 5) * 100
  const buyPct    = (buyCount  / 5) * 100
  const neutralPct = 100 - sellPct - buyPct

  return (
    <div className="bg-gray-800 rounded p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-red-400">{sellCount} SELL</span>
        <span className="text-xs text-gray-500 uppercase tracking-wide">Signal Strength</span>
        <span className="text-xs text-green-400">{buyCount} BUY</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden">
        <div className="bg-red-500 transition-all duration-500"   style={{ width: `${sellPct}%` }} />
        <div className="bg-gray-600 transition-all duration-500" style={{ width: `${neutralPct}%` }} />
        <div className="bg-green-500 transition-all duration-500" style={{ width: `${buyPct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-600">bearish</span>
        <span className="text-xs text-gray-600">bullish</span>
      </div>
    </div>
  )
}
