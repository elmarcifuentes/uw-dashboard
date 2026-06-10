import { useState, useEffect } from 'react'

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

  const isNQ       = activeSymbol === 'NQ'
  const prefix     = isNQ ? 'NQ ' : '$'
  const inputClass = 'w-full bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1.5 font-mono focus:border-indigo-500 focus:outline-none'
  const labelClass = 'text-xs text-gray-500 mb-0.5'

  // Quick-fill from level list
  const levelOptions = (levels || []).sort((a, b) => b.price - a.price)
  const toDisplay = (p) => isNQ
    ? (Math.round(p * (nqRatio || 41.14) * 4) / 4).toFixed(2)
    : p.toFixed(2)

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Manual Entry</div>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 text-xs">✕ cancel</button>
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
                    : 'bg-gray-700 text-gray-500 hover:text-gray-300'
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
                  className="px-2 py-0.5 rounded bg-gray-700 text-gray-400 text-xs hover:bg-gray-600 hover:text-white font-mono"
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

        {/* R:R preview */}
        {entry && target && stop && (() => {
          const e = parseFloat(entry), t = parseFloat(target), s = parseFloat(stop)
          if (!e || !t || !s) return null
          const move = Math.abs(t - e)
          const risk = Math.abs(s - e)
          const rr   = risk > 0 ? (move / risk).toFixed(2) : '—'
          return (
            <div className="flex gap-4 text-xs text-gray-500 bg-gray-900/50 rounded px-3 py-2">
              <span>Move <span className="text-gray-300 font-mono">{move.toFixed(2)}</span></span>
              <span>Risk <span className="text-gray-300 font-mono">{risk.toFixed(2)}</span></span>
              <span className={`font-bold font-mono ${parseFloat(rr) >= 2 ? 'text-green-400' : parseFloat(rr) >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                {rr}:1
              </span>
            </div>
          )
        })()}

        <button
          type="submit"
          disabled={!entry || !target || !stop}
          className="w-full py-2 rounded text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          → Enter Trade
        </button>
      </form>
    </div>
  )
}
