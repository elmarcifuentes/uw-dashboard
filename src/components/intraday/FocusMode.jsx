import { formatNarrative } from '../../utils/formatNarrative'

function VelocityIndicator({ velocity }) {
  if (velocity == null) return null
  const abs = Math.abs(velocity)
  const up  = velocity > 0
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

function DpBar({ value }) {
  const dp  = value || 0
  const pct = ((dp + 1) / 2) * 100
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-xs text-gray-600 shrink-0" style={{ minWidth: '56px' }}>Dark Pool</span>
      <div className="h-1.5 bg-gray-800 rounded relative overflow-hidden flex-1">
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700 z-10" />
        {pct >= 50 ? (
          <div className="absolute inset-y-0 left-1/2 bg-green-500" style={{ width: `${(pct - 50) * 2}%` }} />
        ) : (
          <div className="absolute inset-y-0 right-1/2 bg-red-500" style={{ width: `${(50 - pct) * 2}%` }} />
        )}
      </div>
      <span className="text-xs font-mono text-gray-500 shrink-0" style={{ minWidth: '40px', textAlign: 'right' }}>
        {dp.toFixed(3)}
      </span>
    </div>
  )
}

export default function FocusMode({
  connected, currentPrice, nqPrice,
  priceVelocity, sentiment,
  assistantRead, cascade, levels,
  nqRatio, onExit, activeSymbol = 'NQ',
  activeTrade, evaluation, pnl, dpHistory, onExitTrade,
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
    return Math.abs((currentPrice || 0) - l.price) < Math.abs((currentPrice || 0) - n.price) ? l : n
  }, null)

  const isNQ = activeSymbol === 'NQ'

  const fmtPrice = (p) => {
    if (p == null) return '—'
    const val = isNQ && nqRatio ? Math.round(p * nqRatio * 4) / 4 : p
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const fmtAbsDist = (d) => {
    if (d == null) return '—'
    const val = isNQ && nqRatio ? Math.round(Math.abs(d) * nqRatio * 4) / 4 : Math.abs(d)
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const displayPrice = isNQ
    ? (nqPrice != null ? '$' + nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
    : (currentPrice != null ? '$' + currentPrice.toFixed(2) : '—')

  return (
    <div className="fixed inset-0 bg-[#0a0f1e] z-50 flex flex-col overflow-hidden">

      {/* Row 1 — Live bar */}
      <div className="border-b border-gray-800 bg-[#0d1424] px-4 py-2.5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500 uppercase tracking-wider">LIVE</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white font-mono tabular-nums">{displayPrice}</span>
          <VelocityIndicator velocity={priceVelocity} />
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
        {activeTrade && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold bg-indigo-950 text-indigo-400 border border-indigo-900">
            ● {activeTrade.direction?.toUpperCase()} {activeTrade.instrument || activeSymbol}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              { key: 'now',          label: 'NOW',      color: 'text-white',     border: 'border-gray-700' },
              { key: 'next',         label: 'NEXT',     color: 'text-blue-200',  border: 'border-blue-900/50' },
              { key: 'risk',         label: 'RISK',     color: 'text-amber-200', border: 'border-amber-900/50' },
              { key: 'invalidation', label: 'IF WRONG', color: 'text-gray-400',  border: 'border-gray-800' },
            ].map(f => (
              <div key={f.key} className={`border rounded-lg px-3 py-2 ${f.border} bg-[#111827]/50`}>
                <div className="text-xs font-bold text-gray-600 tracking-wider mb-1">{f.label}</div>
                <p className={`text-xs leading-relaxed ${f.color}`}>
                  {formatNarrative(assistantRead[f.key], activeSymbol) || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — Cascade bar + verdict badge */}
      <div className={`px-4 py-2.5 border-b ${
        cascade?.active ? 'bg-red-950/40 border-red-800'
          : midDp <= -0.500 ? 'bg-amber-950/20 border-amber-900/50'
          : 'bg-[#111827] border-gray-800'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
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
          <span className="text-xs text-gray-600 font-mono">MID dp {midDp.toFixed(3)}</span>
          <span className={`text-xs font-mono hidden sm:inline ${midDp <= -0.500 ? 'text-amber-600' : 'text-gray-700'}`}>
            {gap.toFixed(3)} from -0.700
          </span>
          <div className="flex-1" />
          {evaluation && (
            <div className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${
              evaluation.verdictColor === 'red'   ? 'bg-red-950/60 border-red-800 text-red-400'
              : evaluation.verdictColor === 'amber' ? 'bg-amber-950/60 border-amber-800 text-amber-400'
              : 'bg-green-950/60 border-green-800 text-green-400'
            }`}>
              {evaluation.verdictLabel}
            </div>
          )}
        </div>
        <div className="mt-2 h-1.5 bg-gray-800 rounded relative overflow-hidden">
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
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-3">

          {resistance ? (
            <div className="border border-red-900/50 bg-red-950/10 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-red-500 font-bold uppercase tracking-wider">
                    {resistance.id} — Resistance
                  </span>
                  <div className="text-lg font-bold text-white font-mono mt-0.5">{fmtPrice(resistance.price)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">above by</div>
                  <div className="text-lg font-mono font-bold text-red-400">
                    +{fmtAbsDist(resistance.price - (currentPrice || 0))}
                  </div>
                </div>
              </div>
              <DpBar value={resistance.dark_pool} />
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg px-4 py-3 text-center">
              <span className="text-xs text-gray-600">No resistance classified above</span>
            </div>
          )}

          <div className="border-2 border-yellow-400/50 bg-yellow-400/5 rounded-lg px-4 py-4 text-center">
            <div className="text-xs text-yellow-500 uppercase tracking-wider mb-1">▶ Current Price</div>
            <div className="text-3xl sm:text-4xl font-bold text-white font-mono tabular-nums">{displayPrice}</div>
            {nearest && (
              <div className="text-xs text-gray-600 mt-2">
                {fmtAbsDist((currentPrice || 0) - nearest.price)} from {nearest.id}
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
                  <div className="text-lg font-bold text-white font-mono mt-0.5">{fmtPrice(support.price)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">below by</div>
                  <div className="text-lg font-mono font-bold text-green-400">
                    -{fmtAbsDist((currentPrice || 0) - support.price)}
                  </div>
                </div>
              </div>
              <DpBar value={support.dark_pool} />
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg px-4 py-3 text-center">
              <span className="text-xs text-gray-600">No support classified below</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 5 — Trade details (only when active trade) */}
      {activeTrade && (
        <div className="border-t border-gray-800 bg-[#111827]/80 px-4 py-3">
          <div className="max-w-2xl mx-auto w-full">
            {pnl && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider shrink-0">P&L</span>
                <span className={`text-xl font-bold font-mono ${pnl.isProfit ? 'text-green-400' : 'text-red-400'}`}>
                  {pnl.dollarsStr}
                </span>
                <span className={`text-xs font-mono ${pnl.isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {pnl.pointsStr}
                </span>
                <span className="text-xs text-gray-600 ml-auto">
                  {activeTrade.contracts || 1}× {activeTrade.instrument || activeSymbol}
                </span>
              </div>
            )}
            {evaluation && (
              <div className="space-y-0.5 mb-2">
                {evaluation.holdSignals.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-green-400">
                    <span>✓</span><span>{s}</span>
                  </div>
                ))}
                {evaluation.exitSignals.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-red-400">
                    <span>⚠</span><span>{s}</span>
                  </div>
                ))}
                {evaluation.convictionSignals.slice(0, 1).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-amber-400">
                    <span>⚡</span><span>{s}</span>
                  </div>
                ))}
              </div>
            )}
            {evaluation && (
              <div>
                <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>To target</span>
                  <span>{evaluation.progressPct}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${activeTrade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${evaluation.progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 6 — Action bar */}
      <div className="border-t border-gray-800 bg-[#0d1424] px-4 py-3 flex items-center gap-2">
        {activeTrade && onExitTrade ? (
          <>
            <button
              onClick={() => onExitTrade('manual')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors font-bold"
            >
              ✓ Close
            </button>
            <button
              onClick={() => onExitTrade('stop')}
              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs rounded transition-colors font-bold"
            >
              ✗ Stop Out
            </button>
          </>
        ) : (
          <button onClick={onExit}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">
            ⊞ Full View
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-600">Focus Mode — all signals active</span>
      </div>
    </div>
  )
}
