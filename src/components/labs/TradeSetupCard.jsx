import { calculateTradeSetup } from '../../utils/tradeSetup'

export default function TradeSetupCard({ level, allLevels, currentPrice, nqRatio }) {
  const setup = calculateTradeSetup(level, allLevels, currentPrice, nqRatio)
  if (!setup) return null

  const rrColor     = setup.quality === 'excellent' ? 'text-green-400' : setup.quality === 'good' ? 'text-green-500' : setup.quality === 'acceptable' ? 'text-amber-400' : 'text-red-400'
  const dirColor    = setup.direction === 'short' ? 'text-red-400' : 'text-green-400'
  const borderColor = level.classification === 'sell_resistance' ? 'border-red-900/50' : 'border-green-900/50'

  return (
    <div className={`bg-[#111827] border rounded-lg p-4 ${borderColor}`}>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${dirColor}`}>{level.id}</span>
          <span className={`text-xs font-bold uppercase ${dirColor}`}>{setup.direction}</span>
          <span className="text-gray-600 text-xs">
            {level.classification?.replace('_', ' ')} · {level.confidence}
          </span>
        </div>
        <span className={`text-sm font-bold font-mono ${rrColor}`}>
          {setup.rr}:1
          <span className="text-xs font-normal ml-1">{setup.quality}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-xs text-gray-600 mb-1">Entry</div>
          <div className="text-sm font-mono font-bold text-white">${setup.entry.qqq?.toFixed(2)}</div>
          {setup.entry.nq && <div className="text-xs text-gray-500 font-mono">NQ {setup.entry.nq.toLocaleString()}</div>}
          <div className="text-xs text-gray-700 mt-0.5">{setup.entry.level}</div>
        </div>

        <div className="bg-green-950/30 border border-green-900/30 rounded p-2">
          <div className="text-xs text-gray-600 mb-1">Target</div>
          <div className="text-sm font-mono font-bold text-green-400">${setup.target.qqq?.toFixed(2)}</div>
          {setup.target.nq && <div className="text-xs text-green-600 font-mono">NQ {setup.target.nq.toLocaleString()}</div>}
          <div className="text-xs text-gray-700 mt-0.5">{setup.target.level}</div>
        </div>

        <div className="bg-red-950/30 border border-red-900/30 rounded p-2">
          <div className="text-xs text-gray-600 mb-1">Stop</div>
          <div className="text-sm font-mono font-bold text-red-400">${setup.stop.qqq?.toFixed(2)}</div>
          {setup.stop.nq && <div className="text-xs text-red-600 font-mono">NQ {setup.stop.nq.toLocaleString()}</div>}
        </div>
      </div>

      <div className="flex gap-4 text-xs border-t border-gray-800 pt-2">
        <div>
          <span className="text-gray-600">Move </span>
          <span className="text-white font-mono">
            ${setup.move.qqq}{setup.move.nq ? ` / ${setup.move.nq} NQ` : ''}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Risk </span>
          <span className="text-white font-mono">
            ${setup.risk.qqq}{setup.risk.nq ? ` / ${setup.risk.nq} NQ` : ''}
          </span>
        </div>
      </div>

      {setup.flags.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800 space-y-0.5">
          {setup.flags.map((f, i) => (
            <div key={i} className="text-xs text-gray-500">{f}</div>
          ))}
        </div>
      )}
    </div>
  )
}
