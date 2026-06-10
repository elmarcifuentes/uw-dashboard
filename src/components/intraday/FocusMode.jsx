import { formatNarrative } from '../../utils/formatNarrative'
import { CircleCheck, TriangleAlert, Zap, DoorOpen } from 'lucide-react'

function VelocityIndicator({ velocity }) {
  if (velocity == null) return null
  const abs = Math.abs(velocity)
  const up  = velocity > 0
  const arrow = abs > 0.05 ? (up ? '↑↑' : '↓↓')
    : abs > 0.02 ? (up ? '↑' : '↓')
    : abs > 0.005 ? (up ? '↑' : '↓')
    : '→'
  const color = abs > 0.05 ? (up ? 'text-signal-support animate-pulse' : 'text-signal-resistance animate-pulse')
    : abs > 0.02 ? (up ? 'text-signal-support' : 'text-signal-resistance')
    : abs > 0.005 ? (up ? 'text-signal-support/60' : 'text-signal-resistance/60')
    : 'text-text-muted'
  return <span className={`text-sm font-bold ${color}`}>{arrow}</span>
}

function DpBar({ value }) {
  const dp  = value || 0
  const pct = ((dp + 1) / 2) * 100
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-xs text-text-muted shrink-0" style={{ minWidth: '56px' }}>Dark Pool</span>
      <div className="h-1.5 bg-bg-elevated rounded relative overflow-hidden flex-1">
        <div className="absolute inset-y-0 left-1/2 w-px bg-text-disabled z-10" />
        {pct >= 50 ? (
          <div className="absolute inset-y-0 left-1/2 bg-signal-support" style={{ width: `${(pct - 50) * 2}%` }} />
        ) : (
          <div className="absolute inset-y-0 right-1/2 bg-signal-resistance" style={{ width: `${(50 - pct) * 2}%` }} />
        )}
      </div>
      <span className="text-xs font-price text-text-tertiary shrink-0" style={{ minWidth: '40px', textAlign: 'right' }}>
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

  const cascadeBg = cascade?.active
    ? 'bg-state-stopSoft border-state-stop'
    : midDp <= -0.500
    ? 'bg-state-cascadeWatchSoft border-state-cascadeWatch/50'
    : 'bg-bg-card border-border-subtle'

  return (
    <div className="fixed inset-0 bg-bg-base z-50 flex flex-col overflow-hidden">

      {/* Row 1 — Live bar */}
      <div className="border-b border-border-subtle bg-bg-subtle px-4 py-2.5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-state-hold animate-pulse' : 'bg-state-stop'}`} />
          <span className="text-micro text-text-tertiary uppercase tracking-wider">LIVE</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-hero font-price tabular-nums text-text-primary">{displayPrice}</span>
          <VelocityIndicator velocity={priceVelocity} />
        </div>
        {sentiment?.state && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold ${
            sentiment.color === 'green' ? 'bg-state-holdSoft text-state-hold'
              : sentiment.color === 'red' ? 'bg-state-stopSoft text-state-stop'
              : 'bg-state-cascadeWatchSoft text-state-cascadeWatch'
          }`}>
            {sentiment.state}
          </div>
        )}
        {activeTrade && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold bg-accent-aiSoft text-accent-ai border border-accent-ai/30">
            ● {activeTrade.direction?.toUpperCase()} {activeTrade.instrument || activeSymbol}
          </div>
        )}
        <div className="flex-1" />
        <button onClick={onExit}
          className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1 border border-border-default rounded transition-colors flex items-center gap-1">
          <DoorOpen className="w-3 h-3" /> Exit Focus
        </button>
      </div>

      {/* Row 2 — Assistant strip */}
      {assistantRead && (
        <div className="border-b border-border-subtle bg-bg-subtle px-4 py-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              { key: 'now',          label: 'NOW',      color: 'text-text-primary',   border: 'border-border-default',          labelColor: 'text-text-tertiary'        },
              { key: 'next',         label: 'NEXT',     color: 'text-text-secondary', border: 'border-signal-continuation/30',  labelColor: 'text-signal-continuation'  },
              { key: 'risk',         label: 'RISK',     color: 'text-text-secondary', border: 'border-state-exit/30',           labelColor: 'text-state-exit'           },
              { key: 'invalidation', label: 'IF WRONG', color: 'text-text-secondary', border: 'border-border-subtle',           labelColor: 'text-text-muted'           },
            ].map(f => (
              <div key={f.key} className={`border rounded-lg px-3 py-2 ${f.border} bg-bg-card/50`}>
                <div className={`text-micro font-bold uppercase tracking-wider mb-1 ${f.labelColor}`}>{f.label}</div>
                <p className={`text-sm2 leading-relaxed ${f.color}`}>
                  {formatNarrative(assistantRead[f.key], activeSymbol) || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — Cascade bar + verdict badge */}
      <div className={`px-4 py-2.5 border-b ${cascadeBg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            cascade?.active ? 'bg-state-stop animate-pulse'
              : midDp <= -0.500 ? 'bg-state-cascadeWatch'
              : 'bg-state-hold'
          }`} />
          <span className={`text-sm font-bold ${
            cascade?.active ? 'text-state-stop'
              : midDp <= -0.500 ? 'text-state-cascadeWatch'
              : 'text-state-hold'
          }`}>
            {cascade?.active ? 'CASCADE ACTIVE' : midDp <= -0.500 ? 'APPROACHING CASCADE' : 'CASCADE SAFE'}
          </span>
          <span className="text-xs text-text-muted font-price">MID dp {midDp.toFixed(3)}</span>
          <span className={`text-xs font-price hidden sm:inline ${midDp <= -0.500 ? 'text-state-cascadeWatch/80' : 'text-text-disabled'}`}>
            {gap.toFixed(3)} from -0.700
          </span>
          <div className="flex-1" />
          {evaluation && (
            <div className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${
              evaluation.verdictColor === 'red'   ? 'bg-state-stopSoft border-state-stop text-state-stop'
              : evaluation.verdictColor === 'amber' ? 'bg-state-cascadeWatchSoft border-state-cascadeWatch text-state-cascadeWatch'
              : 'bg-state-holdSoft border-state-hold text-state-hold'
            }`}>
              {evaluation.verdictLabel}
            </div>
          )}
        </div>
        <div className="mt-2 h-1.5 bg-bg-elevated rounded relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded transition-all duration-500"
            style={{
              width: `${Math.max(0, Math.min(100, ((midDp + 1) / 1.5) * 100))}%`,
              backgroundColor: cascade?.active ? '#ff4d5e' : midDp <= -0.500 ? '#ffb020' : '#20c997',
            }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-state-stop"
               style={{ left: `${((-0.700 + 1) / 1.5) * 100}%` }} />
        </div>
      </div>

      {/* Row 4 — Price between levels */}
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-3 px-4 py-4 overflow-hidden max-w-2xl mx-auto w-full">

        {resistance ? (
          <div className="border border-signal-resistance/30 bg-signal-resistanceSoft rounded-lg px-4 py-3 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-micro text-signal-resistance font-bold uppercase tracking-wider">
                  {resistance.id} — Resistance
                </span>
                <div className="text-lg2 font-bold text-text-primary font-price mt-0.5">{fmtPrice(resistance.price)}</div>
              </div>
              <div className="text-right">
                <div className="text-micro text-text-tertiary uppercase">above by</div>
                <div className="text-lg2 font-price font-bold text-signal-resistance">
                  +{fmtAbsDist(resistance.price - (currentPrice || 0))}
                </div>
              </div>
            </div>
            <DpBar value={resistance.dark_pool} />
          </div>
        ) : (
          <div className="border border-border-subtle rounded-lg px-4 py-3 text-center">
            <span className="text-xs text-text-muted">No resistance classified above</span>
          </div>
        )}

        <div className="border-2 border-accent-price/50 bg-accent-price/5 rounded-lg px-4 py-4 text-center shadow-elevated">
          <div className="text-micro text-accent-price uppercase tracking-wider mb-1">▶ Current Price</div>
          <div className="text-hero font-price tabular-nums text-text-primary">{displayPrice}</div>
        </div>

        {support ? (
          <div className="border border-signal-support/30 bg-signal-supportSoft rounded-lg px-4 py-3 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-micro text-signal-support font-bold uppercase tracking-wider">
                  {support.id} — Support
                </span>
                <div className="text-lg2 font-bold text-text-primary font-price mt-0.5">{fmtPrice(support.price)}</div>
              </div>
              <div className="text-right">
                <div className="text-micro text-text-tertiary uppercase">below by</div>
                <div className="text-lg2 font-price font-bold text-signal-support">
                  -{fmtAbsDist((currentPrice || 0) - support.price)}
                </div>
              </div>
            </div>
            <DpBar value={support.dark_pool} />
          </div>
        ) : (
          <div className="border border-border-subtle rounded-lg px-4 py-3 text-center">
            <span className="text-xs text-text-muted">No support classified below</span>
          </div>
        )}

      </div>

      {/* Row 5 — Trade details (only when active trade) */}
      {activeTrade && (
        <div className="border-t border-border-subtle bg-bg-card/80 px-4 py-3">
          <div className="max-w-2xl mx-auto w-full">
            {pnl && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-micro text-text-tertiary uppercase tracking-wider shrink-0">P&L</span>
                <span className={`text-xl2 font-bold font-price ${pnl.isProfit ? 'text-state-hold' : 'text-state-stop'}`}>
                  {pnl.dollarsStr}
                </span>
                <span className={`text-sm2 font-price ${pnl.isProfit ? 'text-state-hold/70' : 'text-state-stop/70'}`}>
                  {pnl.pointsStr}
                </span>
                <span className="text-xs text-text-muted ml-auto">
                  {activeTrade.contracts || 1}× {activeTrade.instrument || activeSymbol}
                </span>
              </div>
            )}
            {evaluation && (
              <div className="space-y-0.5 mb-2">
                {evaluation.holdSignals.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-state-hold">
                    <CircleCheck className="w-3 h-3 shrink-0" /><span>{s}</span>
                  </div>
                ))}
                {evaluation.exitSignals.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-state-stop">
                    <TriangleAlert className="w-3 h-3 shrink-0" /><span>{s}</span>
                  </div>
                ))}
                {evaluation.convictionSignals.slice(0, 1).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-accent-ai">
                    <Zap className="w-3 h-3 shrink-0" /><span>{s}</span>
                  </div>
                ))}
              </div>
            )}
            {evaluation && (
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-0.5">
                  <span>To target</span>
                  <span>{evaluation.progressPct}%</span>
                </div>
                <div className="h-1.5 bg-bg-elevated rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${activeTrade.direction === 'long' ? 'bg-state-hold' : 'bg-state-stop'}`}
                    style={{ width: `${evaluation.progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 6 — Action bar */}
      <div className="border-t border-border-subtle bg-bg-subtle px-4 py-3 flex items-center gap-2">
        {activeTrade && onExitTrade ? (
          <>
            <button
              onClick={() => onExitTrade('manual')}
              className="px-4 py-2 bg-bg-elevated hover:bg-bg-card2 text-text-primary text-xs rounded transition-colors font-bold border border-border-default"
            >
              ✓ Close
            </button>
            <button
              onClick={() => onExitTrade('stop')}
              className="px-4 py-2 bg-state-stopSoft hover:bg-state-stop/30 text-state-stop text-xs rounded transition-colors font-bold border border-state-stop/60"
            >
              ✗ Stop Out
            </button>
          </>
        ) : (
          <button onClick={onExit}
            className="px-4 py-2 bg-bg-elevated hover:bg-bg-card2 text-text-primary text-xs rounded transition-colors border border-border-default">
            ⊞ Full View
          </button>
        )}
        <div className="flex-1" />
        <span className="text-micro text-text-muted uppercase tracking-wider">Focus Mode — all signals active</span>
      </div>
    </div>
  )
}
