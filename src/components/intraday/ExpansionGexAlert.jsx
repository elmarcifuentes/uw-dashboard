export default function ExpansionGexAlert({ expansionGex, pinningSessions }) {
  if (!expansionGex || expansionGex.length === 0) return null

  return (
    <div className="bg-red-950 border border-red-500 rounded p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-red-400 text-sm font-bold">⚠ EXPANSION GEX DETECTED</span>
        {pinningSessions > 0 && (
          <span className="text-red-300 text-xs">
            — first in {pinningSessions} consecutive pinning session{pinningSessions !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {expansionGex.map((l, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="text-red-400 font-mono font-bold w-8">{l.level}</span>
            <span className="text-red-300 font-mono">
              GEX {l.net_gex?.toLocaleString()}
            </span>
            <span className="text-red-200">
              No mechanical friction — price accelerates through this level
            </span>
          </div>
        ))}
      </div>
      <p className="text-red-300 text-xs mt-2 italic">
        Expansion GEX removes the pinning floor. Do not expect price to slow or reverse at
        this level on GEX alone.
      </p>
    </div>
  )
}
