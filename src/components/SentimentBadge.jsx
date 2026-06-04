const COLOR_MAP = {
  green: { bg: 'bg-green-950', border: 'border-green-500', text: 'text-green-400', dot: 'bg-green-500',  pulse: false },
  amber: { bg: 'bg-amber-950', border: 'border-amber-500', text: 'text-amber-400', dot: 'bg-amber-500',  pulse: false },
  red:   { bg: 'bg-red-950',   border: 'border-red-500',   text: 'text-red-400',   dot: 'bg-red-500',    pulse: true  },
}

export default function SentimentBadge({ sentiment, compact = false }) {
  if (!sentiment) return null

  const c = COLOR_MAP[sentiment.color] || COLOR_MAP.amber
  const isPulsing = c.pulse && sentiment.state === 'HIGH_RISK'

  // Compact — Tab 2 header
  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 border rounded px-2 py-1 ${c.bg} ${c.border}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot} ${isPulsing ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-bold font-mono ${c.text}`}>{sentiment.state}</span>
      </div>
    )
  }

  // Full — Tab 1
  return (
    <div className={`border rounded p-3 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot} ${isPulsing ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold ${c.text}`}>{sentiment.label}</span>
        </div>
        <span className="text-xs text-gray-500">{sentiment.bullCount}/{sentiment.total} bullish</span>
      </div>

      <p className={`text-xs mb-2 ${c.text}`}>{sentiment.description}</p>

      <div className="flex flex-wrap gap-1 mb-1">
        {(sentiment.signals || []).map((s, i) => (
          <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${
            s.bull ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
          }`}>
            {s.bull ? '↑' : '↓'} {s.name}
          </span>
        ))}
      </div>

      {sentiment.hasFullStack && (
        <p className="text-xs text-yellow-400">★ FULL STACK active</p>
      )}
      {sentiment.cascadeActive && (
        <p className={`text-xs text-red-400 ${isPulsing ? 'animate-pulse' : ''}`}>
          ⚠ Cascade active — no floor below MID
        </p>
      )}
      {sentiment.cascadeArmed && !sentiment.cascadeActive && (
        <p className="text-xs text-amber-400">⚡ Cascade condition 1 met — monitor S1</p>
      )}
    </div>
  )
}
