import { useState } from 'react'
import { RefreshCw, Minimize2, Maximize2, Target } from 'lucide-react'

export default function LiveHeader({
  connected, price, nqPrice, velocity,
  sentiment, onCompact, compact, onFocus, cascadeActive,
  activeSymbol = 'NQ',
}) {
  const [showOverflow, setShowOverflow] = useState(false)
  const abs = velocity != null ? Math.abs(velocity) : 0
  const up  = velocity > 0
  const arrow = abs > 0.05 ? (up ? '↑↑' : '↓↓') : abs > 0.02 ? (up ? '↑' : '↓') : abs > 0.005 ? (up ? '↑' : '↓') : '→'
  const arrowColor = abs > 0.05
    ? (up ? 'text-signal-support animate-pulse' : 'text-signal-resistance animate-pulse')
    : abs > 0.02 ? (up ? 'text-signal-support' : 'text-signal-resistance')
    : abs > 0.005 ? (up ? 'text-signal-support/60' : 'text-signal-resistance/60')
    : 'text-text-muted'

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg px-4 py-2.5 flex items-center gap-4 flex-wrap relative">

      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-state-hold' : 'bg-state-stop'} ${connected && !cascadeActive ? 'animate-pulse' : ''}`} />
        <span className="text-micro font-bold text-text-secondary uppercase tracking-wider hidden sm:inline">
          {connected ? 'Live' : 'Off'}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl2 font-bold text-text-primary font-price tabular-nums">
          {activeSymbol === 'NQ'
            ? (nqPrice != null ? '$' + nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
            : (price != null ? '$' + price.toFixed(2) : '—')}
        </span>
        {velocity != null && (
          <span className={`text-xs font-bold ${arrowColor}`}>{arrow}</span>
        )}
      </div>

      {sentiment?.state && (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold shrink-0 ${
          sentiment.color === 'green' ? 'bg-state-holdSoft text-state-hold'
            : sentiment.color === 'red' ? 'bg-state-stopSoft text-state-stop'
            : 'bg-state-cascadeWatchSoft text-state-cascadeWatch'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            sentiment.color === 'green' ? 'bg-state-hold'
              : sentiment.color === 'red' ? 'bg-state-stop'
              : 'bg-state-cascadeWatch'
          } ${sentiment.state === 'HIGH_RISK' && !cascadeActive ? 'animate-pulse' : ''}`} />
          {sentiment.state}
        </div>
      )}

      <div className="flex-1" />

      <div className="hidden lg:flex items-center gap-2 shrink-0">
        {onFocus && (
          <button onClick={onFocus} className="text-xs text-text-tertiary hover:text-text-primary px-2 py-1 border border-border-default rounded transition-colors flex items-center gap-1">
            <Target className="w-3 h-3" /> Focus
          </button>
        )}
        <button onClick={onCompact} className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1 border border-border-default rounded transition-colors">
          {compact ? <Maximize2 className="w-3 h-3 inline" /> : <Minimize2 className="w-3 h-3 inline" />}
          <span className="ml-1">{compact ? 'Full' : 'Compact'}</span>
        </button>
      </div>

      <div className="flex lg:hidden items-center gap-2 shrink-0">
        <button onClick={onCompact} className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1 border border-border-default rounded transition-colors">
          {compact ? '⊞ Full' : '⊡ Compact'}
        </button>
        <button
          onClick={() => setShowOverflow(!showOverflow)}
          className="text-text-tertiary hover:text-text-secondary px-2 py-1 border border-border-default rounded text-xs transition-colors"
        >
          ⋯
        </button>
        {showOverflow && (
          <div className="absolute top-full mt-1 right-0 z-50 bg-bg-card border border-border-subtle rounded-lg p-2 space-y-1 shadow-elevated">
            {onFocus && (
              <button onClick={() => { onFocus(); setShowOverflow(false) }} className="block w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded">
                ⊡ Focus Mode
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
