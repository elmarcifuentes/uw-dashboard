import { memo } from 'react'

const LivePrice = memo(function LivePrice({ priceData, nqRatio }) {
  const price   = priceData?.price
  const nqPrice = price && nqRatio
    ? Math.round(price * nqRatio).toLocaleString()
    : null

  if (!price) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono font-bold">
        QQQ ${Number(price)?.toFixed(2) ?? '—'}
      </span>
      {nqPrice && (
        <span className="text-gray-400 font-mono font-bold">
          / NQ {nqPrice}
        </span>
      )}
    </div>
  )
})

export default LivePrice
