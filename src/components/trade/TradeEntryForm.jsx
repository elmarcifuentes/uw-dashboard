import { useState, useEffect, useMemo } from 'react'
import { getInstrument } from '../../utils/pnl'

export default function TradeEntryForm({
  levels, currentPrice, nqRatio, activeSymbol,
  instrument, contracts, prefill, onEnter, onCancel,
}) {
  const [direction, setDirection] = useState(prefill?.direction || 'short')
  const [entry,  setEntry]  = useState('')
  const [target, setTarget] = useState('')
  const [stop,   setStop]   = useState('')

  // Pre-fill from Scout when prefill arrives
  useEffect(() => {
    if (prefill) {
      if (prefill.direction) setDirection(prefill.direction)
      if (prefill.entry  != null) setEntry(String(prefill.entry))
      if (prefill.target != null) setTarget(String(prefill.target))
      if (prefill.stop   != null) setStop(String(prefill.stop))
    }
  }, [prefill])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!entry || !target || !stop) return
    onEnter({
      direction,
      entry:       parseFloat(entry),
      target:      parseFloat(target),
      stop:        parseFloat(stop),
      entryLevel:  prefill?.entryLevel  || null,
      targetLevel: prefill?.targetLevel || null,
      priceUnit:   activeSymbol,
    })
  }

  const preview = useMemo(() => {
    const e = parseFloat(entry)
    const t = parseFloat(target)
    const s = parseFloat(stop)
    const c = parseInt(contracts) || 1
    const inst = getInstrument(instrument)
    if (!e || !t || !s || !inst) return null
    const riskPoints = Math.abs(e - s)
    const gainPoints = Math.abs(t - e)
    if (riskPoints === 0) return null
    const rr = gainPoints / riskPoints
    const riskDollars = riskPoints * inst.pointValue * c
    const gainDollars = gainPoints * inst.pointValue * c
    const quality = rr >= 3 ? 'excellent' : rr >= 2 ? 'good' : rr >= 1.5 ? 'acceptable' : 'poor'
    return {
      riskPoints:  parseFloat(riskPoints.toFixed(2)),
      gainPoints:  parseFloat(gainPoints.toFixed(2)),
      riskDollars: parseFloat(riskDollars.toFixed(2)),
      gainDollars: parseFloat(gainDollars.toFixed(2)),
      rr:          parseFloat(rr.toFixed(1)),
      quality,
      instrument:  inst,
    }
  }, [entry, target, stop, contracts, instrument])

  const isNQ       = activeSymbol === 'NQ'
  const prefix     = isNQ ? 'NQ ' : '$'
  const inputClass = 'w-full bg-bg-elevated border border-border-strong text-text-primary text-xs rounded px-2 py-1.5 font-mono focus:border-indigo-500 focus:outline-none'
  const labelClass = 'text-xs text-text-tertiary mb-0.5'

  // Quick-fill from level list
  const levelOptions = (levels || []).sort((a, b) => b.price - a.price)
  const toDisplay = (p) => isNQ
    ? (Math.round(p * (nqRatio || 41.14) * 4) / 4).toFixed(2)
    : p.toFixed(2)

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-text-secondary font-bold uppercase tracking-wide">Manual Entry</div>
        <button onClick={onCancel} className="text-text-muted hover:text-text-secondary text-xs">✕ cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Direction toggle */}
        <div>
          <div className={labelClass}>Direction</div>
          <div className="flex gap-2">
            {['long', 'short'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  direction === d
                    ? d === 'long'
                      ? 'bg-green-800 text-green-300'
                      : 'bg-red-800 text-red-300'
                    : 'bg-bg-elevated text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {d === 'long' ? '↑ Long' : '↓ Short'}
              </button>
            ))}
          </div>
        </div>

        {/* Quick-fill level buttons */}
        {levelOptions.length > 0 && (
          <div>
            <div className={labelClass}>Quick-fill from level</div>
            <div className="flex flex-wrap gap-1">
              {levelOptions.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setEntry(toDisplay(l.price))}
                  className="px-2 py-0.5 rounded bg-bg-elevated text-text-secondary text-xs hover:bg-bg-card2 hover:text-text-primary font-mono"
                >
                  {l.id} {toDisplay(l.price)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Price fields */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className={labelClass}>Entry ({prefix})</div>
            <input
              type="number" step={isNQ ? '0.25' : '0.01'} value={entry}
              onChange={e => setEntry(e.target.value)}
              placeholder={isNQ ? '29000.00' : '700.00'}
              className={inputClass}
              required
            />
          </div>
          <div>
            <div className={`${labelClass} text-green-600`}>Target ({prefix})</div>
            <input
              type="number" step={isNQ ? '0.25' : '0.01'} value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={isNQ ? '29000.00' : '700.00'}
              className={`${inputClass} border-green-900/50`}
              required
            />
          </div>
          <div>
            <div className={`${labelClass} text-red-600`}>Stop ({prefix})</div>
            <input
              type="number" step={isNQ ? '0.25' : '0.01'} value={stop}
              onChange={e => setStop(e.target.value)}
              placeholder={isNQ ? '29000.00' : '700.00'}
              className={`${inputClass} border-red-900/50`}
              required
            />
          </div>
        </div>

        {/* Trade preview panel */}
        {preview && (
          <div className={`border rounded-lg p-3 ${
            preview.quality === 'excellent' || preview.quality === 'good'
              ? 'border-green-900/50 bg-green-950/10'
              : preview.quality === 'acceptable'
              ? 'border-amber-900/50 bg-amber-950/10'
              : 'border-red-900/50 bg-red-950/10'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-tertiary uppercase tracking-wider">Trade Preview</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                preview.quality === 'excellent' ? 'bg-green-900 text-green-300'
                  : preview.quality === 'good'  ? 'bg-green-900/70 text-green-400'
                  : preview.quality === 'acceptable' ? 'bg-amber-900 text-amber-300'
                  : 'bg-red-900 text-red-300'
              }`}>
                {preview.rr}:1 R/R
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-border-subtle">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs text-text-tertiary">Max Loss</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-red-400 font-mono font-bold">
                  -${preview.riskDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {preview.instrument.type === 'futures' && (
                  <span className="text-xs text-text-muted font-mono ml-2">{preview.riskPoints} pts</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-text-tertiary">Max Gain</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-green-400 font-mono font-bold">
                  +${preview.gainDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {preview.instrument.type === 'futures' && (
                  <span className="text-xs text-text-muted font-mono ml-2">{preview.gainPoints} pts</span>
                )}
              </div>
            </div>

            {contracts > 1 && (
              <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                <div className="text-xs text-text-muted">
                  Per contract: -${(preview.riskDollars / contracts).toFixed(2)} risk · +${(preview.gainDollars / contracts).toFixed(2)} gain
                </div>
              </div>
            )}

            {preview.quality === 'poor' && (
              <div className="mt-1.5 text-xs text-red-400">⚠ Poor R/R — consider adjusting target or stop</div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!entry || !target || !stop}
          className="w-full py-2 rounded text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-text-primary transition-colors disabled:bg-bg-elevated disabled:text-text-tertiary disabled:cursor-not-allowed"
        >
          → Enter Trade
        </button>
      </form>
    </div>
  )
}
