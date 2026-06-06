import { useState } from 'react'

export default function MarketStateCard({ sentiment, sessionBrief, narrativeMode }) {
  const [showBrief, setShowBrief] = useState(false)

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="text-xs text-gray-500 uppercase tracking-wider">Market State</div>

      {sentiment?.state ? (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold w-fit ${
          sentiment.color === 'green'
            ? 'bg-green-950 text-green-400 border border-green-800'
            : sentiment.color === 'red'
            ? 'bg-red-950 text-red-400 border border-red-800'
            : 'bg-amber-950 text-amber-400 border border-amber-800'
        }`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            sentiment.color === 'green' ? 'bg-green-500'
              : sentiment.color === 'red' ? 'bg-red-500'
              : 'bg-amber-500'
          } ${sentiment.state === 'HIGH_RISK' ? 'animate-pulse' : ''}`} />
          {sentiment.state}
        </div>
      ) : (
        <div className="text-xs text-gray-600">No sentiment data</div>
      )}

      {sentiment?.signals?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sentiment.signals.map((s, i) => (
            <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${
              s.bull ? 'bg-green-950 text-green-500' : 'bg-red-950 text-red-500'
            }`}>
              {s.bull ? '↑' : '↓'} {s.name}
            </span>
          ))}
        </div>
      )}

      {narrativeMode === 'claude' && sessionBrief && (
        <div className="border-t border-gray-800 pt-2">
          <button
            onClick={() => setShowBrief(!showBrief)}
            className="flex items-center justify-between w-full text-xs text-gray-600 hover:text-gray-400 mb-1.5"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-purple-600">🤖</span>
              Session Brief
            </span>
            <span>{showBrief ? '▲' : '▼'}</span>
          </button>
          {!showBrief && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-1 italic">
              {sessionBrief.slice(0, 80)}...
            </p>
          )}
          {showBrief && (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed border-l-2 border-purple-900 pl-2">
              {sessionBrief}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
