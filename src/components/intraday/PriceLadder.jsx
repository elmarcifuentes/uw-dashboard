const LEVEL_DESCRIPTIONS = {
  buy_support:     'Institutional buying below — price expected to be drawn upward',
  sell_resistance: 'Institutional supply above — price expected to struggle or reject',
  no_edge:         'Insufficient signal — no directional read',
  continuation:    'Momentum continuation — weak opposing data at level',
}

const CLASS_COLORS = {
  buy_support:     { border: '#1A7A4A', bg: '#0a2418', text: '#4ade80' },
  sell_resistance: { border: '#C0392B', bg: '#2a0a0a', text: '#f87171' },
  no_edge:         { border: '#6B7280', bg: '#111827', text: '#9ca3af' },
  continuation:    { border: '#7C3AED', bg: '#1a1040', text: '#a78bfa' },
}

function StructureBreakBar({ sb }) {
  if (!sb) return null
  const toR2 = sb.distance_to_r2
  const toS2 = sb.distance_to_s2
  const active   = sb.active ?? false
  const imminent = !active && ((toR2 != null && toR2 <= 0.50) || (toS2 != null && toS2 <= 0.50))

  let cls  = 'bg-gray-800 border-gray-700 text-gray-400'
  let text = `R2 $${toR2?.toFixed(2) ?? '—'} away  |  S2 $${toS2?.toFixed(2) ?? '—'} away`

  if (imminent) {
    cls  = 'bg-amber-900/50 border-amber-600 text-amber-300'
    text = toR2 != null && toR2 <= 0.50
      ? `⚠ R2 $${toR2.toFixed(2)} — BREAK IMMINENT`
      : `⚠ S2 $${toS2.toFixed(2)} — BREAK IMMINENT`
  }
  if (active) {
    const dir = sb.direction === 'upside' ? '▲' : '▼'
    const ext = sb.r3 ? ` — ${sb.direction === 'upside' ? 'R3' : 'S3'}: $${sb.r3}` : ''
    cls  = 'bg-red-900/50 border-red-600 text-red-300'
    text = `⚠ STRUCTURE BREAK ${dir} ${sb.direction?.toUpperCase() ?? ''}${ext}`
  }

  return (
    <div className={`px-3 py-1.5 rounded border text-sm font-medium mb-1 ${cls}`}>
      {text}
    </div>
  )
}

export default function PriceLadder({ result, currentPrice, compact }) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Waiting for first rescore…
      </div>
    )
  }

  const levels = [...result.levels].sort((a, b) => b.price - a.price)

  return (
    <div className="flex flex-col gap-1.5">

      {result.cascade?.active && (
        <div className="bg-red-900/50 border border-red-500 rounded px-3 py-2 text-red-300 text-sm animate-pulse">
          ⚠ CASCADE ACTIVE — no institutional floor below MID
        </div>
      )}

      <StructureBreakBar sb={result.structure_break} />

      {levels.map(level => {
        const colors   = CLASS_COLORS[level.classification] || CLASS_COLORS.no_edge
        const dist     = currentPrice != null ? (currentPrice - level.price) : null
        const distStr  = dist != null ? (dist >= 0 ? `+${dist.toFixed(2)}` : dist.toFixed(2)) : null
        const isNear   = dist != null && Math.abs(dist) <= 0.50
        const isAbove  = dist != null && dist > 0

        return (
          <div
            key={level.id}
            style={{ borderColor: colors.border, backgroundColor: colors.bg }}
            className={`border rounded px-3 py-2 transition-all ${isNear ? 'ring-1 ring-yellow-400' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm w-8" style={{ color: colors.text }}>
                  {level.id}
                </span>
                <span className="text-white font-mono font-medium">
                  ${level.price.toFixed(2)}
                </span>
                {result.nq_ratio && (
                  <span className="text-gray-500 text-xs">
                    / NQ {Math.round(level.price * result.nq_ratio).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {level.full_stack  && <span className="text-yellow-400 text-xs font-bold">★</span>}
                {level.conflict    && <span className="text-amber-400 text-xs">⚠</span>}
                {level.boundary    && <span className="text-orange-400 text-xs">⚡</span>}
                {level.lower_high  && <span className="text-purple-400 text-xs">↙</span>}
                {distStr != null && (
                  <span className={`text-xs font-mono tabular-nums ${isAbove ? 'text-green-400' : 'text-red-400'}`}>
                    {distStr}
                  </span>
                )}
              </div>
            </div>

            {!compact && (
              <p className="text-xs text-gray-500 italic mt-1">
                {LEVEL_DESCRIPTIONS[level.classification] || ''}
              </p>
            )}

            {!compact && (
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span style={{ color: colors.text }}>
                  {level.classification === 'buy_support'    ? 'BUY SUP'  :
                   level.classification === 'sell_resistance' ? 'SELL RES' :
                   level.classification === 'continuation'   ? 'CONT'     : 'NO EDGE'}
                  {' '}{level.score}
                </span>
                <span>
                  DP {level.dark_pool >= 0.3 ? '↑' : level.dark_pool <= -0.3 ? '↓' : '—'}{' '}
                  {level.dark_pool?.toFixed(3)}
                </span>
                <span>
                  ETF {level.etf_direction === 'bullish' ? '↑' : level.etf_direction === 'bearish' ? '↓' : '—'}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  level.confidence === 'high'   ? 'bg-green-900 text-green-300'  :
                  level.confidence === 'medium' ? 'bg-amber-900 text-amber-300'  :
                  level.confidence === 'low'    ? 'bg-red-900/50 text-red-300'   :
                                                  'bg-gray-800 text-gray-500'
                }`}>
                  {(level.confidence || 'none').toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {currentPrice != null && (
        <div className="border border-yellow-500/60 rounded px-3 py-1.5 text-yellow-400 font-mono text-sm text-center mt-1">
          ▶ {Number(currentPrice).toFixed(2)}
        </div>
      )}
    </div>
  )
}
