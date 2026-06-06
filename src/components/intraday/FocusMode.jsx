function VelocityIndicator({ velocity }) {
  if (velocity == null) return null
  const abs = Math.abs(velocity)
  const up = velocity > 0
  const arrow = abs > 0.05 ? (up ? '↑↑' : '↓↓')
    : abs > 0.02 ? (up ? '↑' : '↓')
    : abs > 0.005 ? (up ? '↑' : '↓')
    : '→'
  const color = abs > 0.05 ? (up ? 'text-green-400 animate-pulse' : 'text-red-400 animate-pulse')
    : abs > 0.02 ? (up ? 'text-green-500' : 'text-red-500')
    : abs > 0.005 ? (up ? 'text-green-700' : 'text-red-700')
    : 'text-gray-600'
  return <span className={`text-sm font-bold ${color}`}>{arrow}</span>
}

export default function FocusMode({
  connected, currentPrice, nqPrice,
  priceVelocity, sentiment,
  assistantRead, cascade, levels,
  nqRatio, onExit
}) {
  const mid   = levels?.find(l => l.id === 'MID')
  const midDp = mid?.dark_pool || 0
  const gap   = Math.abs(-0.700 - midDp)

  const resistance = levels
    ?.filter(l => l.price > (currentPrice || 0) && l.classification === 'sell_resistance')
    .sort((a, b) => a.price - b.price)[0]

  const support = levels
    ?.filter(l => l.price < (currentPrice || 0) && l.classification === 'buy_support')
    .sort((a, b) => b.price - a.price)[0]

  const nearest = levels?.reduce((n, l) => {
    if (!n) return l
    return Math.abs((currentPrice || 0) - l.price) < Math.abs((currentPrice || 0) - n.price)
      ? l : n
  }, null)

  const nq = p => nqRatio ? Math.round(p * nqRatio).toLocaleString() : null

  return (
    <div className="fixed inset-0 bg-[#0a0f1e] z-50 flex flex-col overflow-hidden">

      {/* Row 1 — Live bar */}
      <div className="border-b border-gray-800 bg-[#0d1424] px-4 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'} ${connected && !cascade?.active ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-500 uppercase tracking-wider">LIVE</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white font-mono tabular-nums">
            ${currentPrice?.toFixed(2)}
          </span>
          <VelocityIndicator velocity={priceVelocity} />
          <span className="text-sm text-gray-500 font-mono">/ NQ {nqPrice?.toLocaleString()}</span>
        </div>
        {sentiment?.state && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold ${
            sentiment.color === 'green' ? 'bg-green-950 text-green-400'
              : sentiment.color === 'red' ? 'bg-red-950 text-red-400'
              : 'bg-amber-950 text-amber-400'
          }`}>
            {sentiment.state}
          </div>
        )}
        <div className="flex-1" />
        <button onClick={onExit}
          className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1 border border-gray-700 rounded">
          ✕ Exit Focus
        </button>
      </div>

      {/* Row 2 — Assistant strip */}
      {assistantRead && (
        <div className="border-b border-gray-800 bg-[#0d1424] px-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: 'now',          label: 'NOW',      color: 'text-white',     border: 'border-gray-700' },
              { key: 'next',         label: 'NEXT',     color: 'text-blue-200',  border: 'border-blue-900/50' },
              { key: 'risk',         label: 'RISK',     color: 'text-amber-200', border: 'border-amber-900/50' },
              { key: 'invalidation', label: 'IF WRONG', color: 'text-gray-400',  border: 'border-gray-800' },
            ].map(f => (
              <div key={f.key} className={`border rounded-lg px-3 py-2 ${f.border} bg-[#111827]/50`}>
                <div className="text-xs font-bold text-gray-600 tracking-wider mb-1">{f.label}</div>
                <p className={`text-xs leading-relaxed ${f.color}`}>
                  {assistantRead[f.key] || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — Cascade status */}
      <div className={`px-4 py-3 border-b ${
        cascade?.active ? 'bg-red-950/40 border-red-800'
          : midDp <= -0.500 ? 'bg-amber-950/20 border-amber-900/50'
          : 'bg-[#111827] border-gray-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${
              cascade?.active ? 'bg-red-500 animate-pulse'
                : midDp <= -0.500 ? 'bg-amber-500'
                : 'bg-green-500'
            }`} />
            <span className={`text-sm font-bold ${
              cascade?.active ? 'text-red-400'
                : midDp <= -0.500 ? 'text-amber-400'
                : 'text-green-400'
            }`}>
              {cascade?.active ? 'CASCADE ACTIVE' : midDp <= -0.500 ? 'APPROACHING CASCADE' : 'CASCADE SAFE'}
            </span>
            <span className="text-xs text-gray-500 font-mono">MID dp {midDp.toFixed(3)}</span>
          </div>
          {!cascade?.active && (
            <span className={`text-sm font-mono font-bold ${midDp <= -0.500 ? 'text-amber-400' : 'text-gray-600'}`}>
              {gap.toFixed(3)} from -0.700
            </span>
          )}
        </div>
        <div className="mt-2 h-2 bg-gray-800 rounded relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded transition-all duration-500"
            style={{
              width: `${Math.max(0, Math.min(100, ((midDp + 1) / 1.5) * 100))}%`,
              backgroundColor: cascade?.active ? '#ef4444' : midDp <= -0.500 ? '#f59e0b' : '#22c55e',
            }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-red-500"
               style={{ left: `${((-0.700 + 1) / 1.5) * 100}%` }} />
        </div>
      </div>

      {/* Row 4 — Price between levels */}
      <div className="flex-1 flex flex-col justify-center px-4 py-4 max-w-2xl mx-auto w-full">

        {resistance ? (
          <div className="border border-red-900/50 bg-red-950/10 rounded-lg px-4 py-3 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-red-500 font-bold uppercase tracking-wider">
                  {resistance.id} — Resistance
                </span>
                <div className="text-lg font-bold text-white font-mono mt-0.5">
                  ${resistance.price?.toFixed(2)}
                  {nq(resistance.price) && (
                    <span className="text-sm text-gray-500 ml-2">NQ {nq(resistance.price)}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">above</div>
                <div className="text-lg font-mono font-bold text-red-400">
                  +${(resistance.price - currentPrice)?.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-gray-800 rounded-lg px-4 py-3 mb-3 text-center">
            <span className="text-xs text-gray-600">No resistance classified above</span>
          </div>
        )}

        <div className="border-2 border-yellow-400/50 bg-yellow-400/5 rounded-lg px-4 py-4 mb-3 text-center">
          <div className="text-xs text-yellow-500 uppercase tracking-wider mb-1">▶ Current Price</div>
          <div className="text-4xl font-bold text-white font-mono tabular-nums">
            ${currentPrice?.toFixed(2)}
          </div>
          <div className="text-lg text-yellow-500/70 font-mono mt-1">
            NQ {nqPrice?.toLocaleString()}
          </div>
          {nearest && (
            <div className="text-xs text-gray-600 mt-2">
              {Math.abs(currentPrice - nearest.price).toFixed(2)} from {nearest.id}
            </div>
          )}
        </div>

        {support ? (
          <div className="border border-green-900/50 bg-green-950/10 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-green-500 font-bold uppercase tracking-wider">
                  {support.id} — Support
                </span>
                <div className="text-lg font-bold text-white font-mono mt-0.5">
                  ${support.price?.toFixed(2)}
                  {nq(support.price) && (
                    <span className="text-sm text-gray-500 ml-2">NQ {nq(support.price)}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">below</div>
                <div className="text-lg font-mono font-bold text-green-400">
                  -${(currentPrice - support.price)?.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-gray-800 rounded-lg px-4 py-3 text-center">
            <span className="text-xs text-gray-600">No support classified below</span>
          </div>
        )}
      </div>

      {/* Row 5 — Action bar */}
      <div className="border-t border-gray-800 bg-[#0d1424] px-4 py-3 flex items-center gap-3">
        <button onClick={onExit}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">
          ⊞ Full View
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-600">Focus Mode — all signals active</span>
      </div>
    </div>
  )
}
