import { getInstrumentsForSymbol } from '../../utils/pnl'

export default function InstrumentSelector({ instrument, contracts, onInstrumentChange, onContractsChange, activeSymbol }) {
  const available = getInstrumentsForSymbol(activeSymbol)
  const current   = available.find(i => i.symbol === instrument)

  return (
    <div className="flex items-center gap-2">
      <select
        value={instrument}
        onChange={e => onInstrumentChange(e.target.value)}
        className="bg-bg-elevated text-text-primary text-xs rounded px-2 py-1.5 border border-border-strong focus:border-indigo-500 focus:outline-none"
      >
        {available.map(inst => (
          <option key={inst.symbol} value={inst.symbol}>
            {inst.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onContractsChange(Math.max(1, contracts - 1))}
          className="w-6 h-6 rounded bg-bg-elevated text-text-secondary text-xs hover:bg-bg-card2 flex items-center justify-center"
        >−</button>
        <span className="text-xs text-text-primary font-mono w-6 text-center">{contracts}</span>
        <button
          onClick={() => onContractsChange(contracts + 1)}
          className="w-6 h-6 rounded bg-bg-elevated text-text-secondary text-xs hover:bg-bg-card2 flex items-center justify-center"
        >+</button>
        <span className="text-xs text-text-muted">
          {current?.shareUnit ? 'shares' : `contract${contracts > 1 ? 's' : ''}`}
        </span>
      </div>

      {current && (
        <span className="text-xs text-text-disabled">${current.pointValue}/pt</span>
      )}
    </div>
  )
}
