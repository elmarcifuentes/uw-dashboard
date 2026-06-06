export default function LiveHeader({
  connected, price, nqPrice, velocity,
  sentiment, drawing, drawResult, unlocked,
  onDrawQqq, onDrawBoth, onCompact, compact,
}) {
  const abs = velocity != null ? Math.abs(velocity) : 0
  const up  = velocity > 0
  const arrow = abs > 0.05 ? (up ? '↑↑' : '↓↓') : abs > 0.02 ? (up ? '↑' : '↓') : abs > 0.005 ? (up ? '↑' : '↓') : '→'
  const arrowColor = abs > 0.05
    ? (up ? 'text-green-400 animate-pulse' : 'text-red-400 animate-pulse')
    : abs > 0.02 ? (up ? 'text-green-500' : 'text-red-500')
    : abs > 0.005 ? (up ? 'text-green-700' : 'text-red-700')
    : 'text-gray-600'

  const btnBase = 'px-2 py-1 rounded text-xs font-medium transition-colors'
  const drawBtnClass = (type) => {
    if (!unlocked)                return `${btnBase} bg-gray-800 text-gray-600 cursor-not-allowed`
    if (drawing === type)         return `${btnBase} bg-gray-700 text-gray-400 cursor-wait`
    if (drawResult === 'success') return `${btnBase} bg-green-800 text-green-300`
    if (drawResult === 'error')   return `${btnBase} bg-red-800 text-red-300`
    return `${btnBase} bg-gray-700 text-gray-300 hover:bg-gray-600`
  }
  const drawLabel = (type) => {
    if (!unlocked)                return type === 'qqq' ? '🔒 Draw QQQ' : '🔒 Draw Both'
    if (drawing === type)         return '⟳ Drawing…'
    if (drawResult === 'success') return '✓ Done'
    if (drawResult === 'error')   return '✗ Failed'
    return type === 'qqq' ? '📊 Draw QQQ' : '📊 Draw Both'
  }

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg px-4 py-2.5 flex items-center gap-4 flex-wrap">

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {connected ? 'Live' : 'Off'}
        </span>
      </div>

      {/* Price hero */}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white font-mono tabular-nums">
          ${price?.toFixed(2) ?? '—'}
        </span>
        {velocity != null && (
          <span className={`text-xs font-bold ${arrowColor}`}>{arrow}</span>
        )}
        <span className="text-sm text-gray-500 font-mono">
          / NQ {nqPrice?.toLocaleString() ?? '—'}
        </span>
      </div>

      {/* Sentiment compact pill */}
      {sentiment?.state && (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold shrink-0 ${
          sentiment.color === 'green' ? 'bg-green-950 text-green-400'
            : sentiment.color === 'red' ? 'bg-red-950 text-red-400'
            : 'bg-amber-950 text-amber-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            sentiment.color === 'green' ? 'bg-green-500'
              : sentiment.color === 'red' ? 'bg-red-500'
              : 'bg-amber-500'
          } ${sentiment.state === 'HIGH_RISK' ? 'animate-pulse' : ''}`} />
          {sentiment.state}
        </div>
      )}

      <div className="flex-1" />

      {/* Draw buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onDrawQqq} disabled={!unlocked || !!drawing} className={drawBtnClass('qqq')}>
          {drawLabel('qqq')}
        </button>
        <button onClick={onDrawBoth} disabled={!unlocked || !!drawing} className={drawBtnClass('both')}>
          {drawLabel('both')}
        </button>
        <button
          onClick={onCompact}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded transition-colors"
        >
          {compact ? '⊞ Full' : '⊡ Compact'}
        </button>
      </div>
    </div>
  )
}
