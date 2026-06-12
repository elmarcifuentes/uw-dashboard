export default function LevelComparison({
  autoLevels, currentLevels, lastCalculated, interval, onApply, applying, applyConfirm,
  activeSymbol = 'QQQ', nqRatio,
}) {
  const levelIds = ['R2', 'R1', 'MID', 'S1', 'S2']
  const ratio = nqRatio   // live ratio only; QQQ Equiv shows '—' if absent (no 41.14 fallback)

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-text-tertiary uppercase tracking-wider">NQ Predictive Ranges</div>
          {lastCalculated && (
            <div className="text-xs text-text-disabled mt-0.5">
              Calculated{' '}
              {new Date(lastCalculated).toLocaleString('en-US', {
                timeZone: 'America/New_York', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })} ET
            </div>
          )}
        </div>
        <button
          onClick={onApply}
          disabled={applying}
          title="Writes these NQ levels to active scoring and runs a full rescore (scores + narratives) — no separate Score Now needed"
          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
            applying
              ? 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
              : applyConfirm
                ? 'bg-emerald-800/60 text-emerald-200'
                : 'bg-indigo-700 hover:bg-indigo-600 text-text-primary'
          }`}
        >
          {applying ? '⟳ Applying & scoring…' : applyConfirm ? `✓ ${applyConfirm}` : 'Apply NQ Levels'}
        </button>
      </div>

      <div className="space-y-0">
        <div className="text-micro text-text-muted mb-1">structure — not scored bias</div>
        <div className="grid grid-cols-6 gap-1.5 text-xs text-text-muted pb-2 border-b border-border-subtle">
          <span>Level</span>
          <span className="text-right">NQ Native</span>
          <span className="text-right">QQQ Equiv</span>
          <span className="text-right">Active NQ</span>
          <span className="text-right">Active QQQ</span>
          <span className="text-right">Δ</span>
        </div>

        {levelIds.map(id => {
          const nqAuto     = autoLevels?.[id]
          const qqqEquiv   = nqAuto != null && ratio ? parseFloat((nqAuto / ratio).toFixed(2)) : null
          const activeEntry = currentLevels?.find(l => l.id === id)
          const activeNq   = activeEntry?.nq_price
          const activeQqq  = activeEntry?.qqq_price   // stored canonical QQQ (same value other tabs show)
          const rawDelta   = nqAuto != null && activeNq != null ? nqAuto - activeNq : null
          const moved      = rawDelta !== null && Math.abs(rawDelta) > 0.5
          // Unscored structure → neutral (MID keeps continuation anchor). Δ is a drift magnitude,
          // not scored bias, so it stays neutral too — never a red/green action read.
          const levelColor = id === 'MID' ? 'text-signal-continuation' : 'text-text-secondary'
          const deltaColor = !moved ? 'text-text-disabled' : 'text-text-secondary'

          return (
            <div key={id} className="grid grid-cols-6 gap-1.5 text-xs py-1.5 border-b border-border-subtle/50">
              <span className={`font-bold ${levelColor}`}>{id}</span>
              <span className="text-right text-text-primary font-mono">
                {nqAuto != null ? nqAuto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
              <span className="text-right text-text-tertiary font-mono">
                {qqqEquiv != null ? `$${qqqEquiv.toFixed(2)}` : '—'}
              </span>
              <span className="text-right text-text-secondary font-mono">
                {activeNq != null ? activeNq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
              <span className="text-right text-text-secondary font-mono">
                {activeQqq != null ? `$${Number(activeQqq).toFixed(2)}` : '—'}
              </span>
              <span className={`text-right font-mono ${deltaColor}`}>
                {moved ? `${rawDelta > 0 ? '+' : ''}${rawDelta.toFixed(0)}` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border-subtle">
        <div className="text-xs text-text-muted">
          Predictive Ranges · {interval || '5m'} bars · length=200 factor=6.0
          · NQ · ATR {autoLevels?.atr != null ? autoLevels.atr.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
        </div>
        <div className="text-xs text-text-disabled mt-1">
          Active = levels currently in scoring (NQ canonical, QQQ derived at lock) · Δ = NQ Native vs Active NQ · green = Labs higher
        </div>
      </div>
    </div>
  )
}
