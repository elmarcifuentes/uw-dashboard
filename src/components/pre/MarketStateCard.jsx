export default function MarketStateCard({ sentiment, cascadeActive }) {
  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg p-4 space-y-3">
      <div className="text-xs text-text-tertiary uppercase tracking-wider">Market State</div>

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
          } ${sentiment.state === 'HIGH_RISK' && !cascadeActive ? 'animate-pulse' : ''}`} />
          {sentiment.state}
        </div>
      ) : (
        <div className="text-xs text-text-muted">No sentiment data</div>
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
    </div>
  )
}
