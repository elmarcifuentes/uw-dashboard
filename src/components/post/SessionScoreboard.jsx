export default function SessionScoreboard({ session }) {
  if (!session) return null

  const outcomes      = session.level_outcomes || []
  const accuracy      = session.accuracy || {}
  const cascadeFired  = session.session?.cascade_fired
  const cascadeEvent  = session.cascade_events?.[0]
  const expansionGex  = session.session_notes?.expansion_gex_fired
  const accuracyPct   = accuracy.accuracy_pct

  const classified = outcomes.filter(o => o.classification !== 'no_edge')
  const correct    = classified.filter(o => o.outcome === 'correct')

  const allNoEdge  = outcomes.length > 0 && outcomes.every(o => o.classification === 'no_edge')
  const noTradeDay = allNoEdge || (accuracyPct != null && accuracyPct < 40 && classified.length >= 3)

  const bestLevel = outcomes
    .filter(o => o.outcome === 'correct')
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0]

  const worstMiss = outcomes
    .filter(o => o.outcome === 'incorrect')
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0]

  const biggestMove = outcomes
    .filter(o => o.price_move != null)
    .sort((a, b) => Math.abs(b.price_move) - Math.abs(a.price_move))[0]

  const verdict = accuracyPct == null ? null
    : accuracyPct >= 75 ? 'held'
    : accuracyPct >= 50 ? 'mixed'
    : 'failed'

  const verdictColor = verdict === 'held' ? 'text-green-400'
    : verdict === 'mixed' ? 'text-amber-400'
    : verdict === 'failed' ? 'text-red-400'
    : 'text-gray-500'

  const verdictLabel = verdict === 'held' ? '✓ Model Held'
    : verdict === 'mixed' ? '~ Mixed Results'
    : verdict === 'failed' ? '✗ Model Failed'
    : '— No data'

  const cards = [
    {
      label: 'Accuracy',
      value: accuracyPct != null ? `${accuracyPct}%` : '—',
      sub: `${accuracy.correct || 0}/${accuracy.total_classified || 0} levels`,
      color: accuracyPct >= 75 ? 'text-green-400' : accuracyPct >= 50 ? 'text-amber-400' : 'text-red-400',
    },
    {
      label: 'Cascade',
      value: cascadeFired ? 'FIRED' : 'SAFE',
      sub: cascadeEvent
        ? `$${Math.abs(cascadeEvent.drawdown || 0).toFixed(2)} drawdown`
        : 'No cascade event',
      color: cascadeFired ? 'text-red-400' : 'text-green-400',
    },
    {
      label: 'Best Level',
      value: bestLevel ? bestLevel.level : '—',
      sub: bestLevel
        ? `${bestLevel.classification?.replace('_', ' ')} · score ${bestLevel.score}`
        : 'No correct calls',
      color: 'text-green-400',
    },
    {
      label: 'Worst Miss',
      value: worstMiss ? worstMiss.level : '—',
      sub: worstMiss
        ? `${worstMiss.classification?.replace('_', ' ')} · score ${worstMiss.score}`
        : 'No missed calls',
      color: 'text-red-400',
    },
    {
      label: 'Biggest Move',
      value: biggestMove ? `$${Math.abs(biggestMove.price_move).toFixed(2)}` : '—',
      sub: biggestMove
        ? `${biggestMove.level} ${biggestMove.price_move > 0 ? '↑' : '↓'}`
        : 'No moves recorded',
      color: 'text-white',
    },
  ]

  return (
    <div className="space-y-3">

      {/* Verdict banner */}
      <div className={`border rounded-lg px-4 py-3 flex items-center justify-between ${
        verdict === 'held'   ? 'border-green-900/50 bg-green-950/10'
          : verdict === 'mixed'  ? 'border-amber-900/50 bg-amber-950/10'
          : verdict === 'failed' ? 'border-red-900/50 bg-red-950/10'
          : 'border-gray-800 bg-[#111827]'
      }`}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`text-lg font-bold ${verdictColor}`}>{verdictLabel}</div>
            {noTradeDay && (
              <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-1 rounded">
                ○ No-trade conditions
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {session.session?.date} · {session.session?.session_type || 'Session'}
          </div>
        </div>
        {expansionGex && (
          <span className="text-xs text-red-400 bg-red-950/50 border border-red-900/50 px-2 py-1 rounded">
            ⚡ Expansion GEX fired
          </span>
        )}
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-5 gap-2">
        {cards.map(c => (
          <div key={c.label} className="bg-[#111827] border border-gray-800 rounded-lg px-3 py-3">
            <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-600 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Model got right / wrong / best signal */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#111827] border border-green-900/30 rounded-lg p-3">
          <div className="text-xs text-green-500 font-bold uppercase tracking-wider mb-2">✓ Model Got Right</div>
          {correct.length > 0 ? (
            <ul className="space-y-1">
              {correct.map((o, i) => (
                <li key={i} className="text-xs text-gray-400">
                  <span className="text-green-400 font-bold mr-1">{o.level}</span>
                  {o.classification?.replace('_', ' ')}
                  {o.score && <span className="text-gray-600 ml-1">({o.score})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-700">No correct calls this session</p>
          )}
        </div>

        <div className="bg-[#111827] border border-red-900/30 rounded-lg p-3">
          <div className="text-xs text-red-500 font-bold uppercase tracking-wider mb-2">✗ Failed / Invalidated</div>
          {outcomes.filter(o => o.outcome === 'incorrect').length > 0 ? (
            <ul className="space-y-1">
              {outcomes.filter(o => o.outcome === 'incorrect').map((o, i) => (
                <li key={i} className="text-xs text-gray-400">
                  <span className="text-red-400 font-bold mr-1">{o.level}</span>
                  {o.classification?.replace('_', ' ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-700">No failed calls this session</p>
          )}
        </div>

        <div className="bg-[#111827] border border-indigo-900/30 rounded-lg p-3">
          <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-2">★ Best Signal</div>
          {bestLevel ? (
            <div>
              <div className="text-sm font-bold text-white mb-1">
                {bestLevel.level} — {bestLevel.classification?.replace('_', ' ')}
              </div>
              <div className="text-xs text-gray-500">Score {bestLevel.score} · {bestLevel.confidence}</div>
              {bestLevel.dark_pool && (
                <div className="text-xs text-gray-600 mt-1">DP {bestLevel.dark_pool?.toFixed(3)}</div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-700">No classified levels this session</p>
          )}
        </div>
      </div>
    </div>
  )
}
