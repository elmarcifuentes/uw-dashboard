import { useState, useEffect } from 'react'
import SessionScoreboard from './post/SessionScoreboard'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const OUTCOME_COLOR = {
  correct:   'text-green-400',
  incorrect: 'text-red-400',
  noise:     'text-gray-500',
}

const CONF_COLOR = {
  high:   'text-green-400',
  medium: 'text-amber-400',
  low:    'text-red-400',
}

// Enhancement 4 — trigger label map
const TRIGGER_LABELS = {
  'pre-open':       { label: 'Pre-open',  color: 'text-gray-400' },
  'live':           { label: 'Live',      color: 'text-blue-400' },
  'manual':         { label: 'Manual',    color: 'text-teal-400' },
  'overnight-prep': { label: 'Overnight', color: 'text-gray-500' },
  'auto-rescore':   { label: 'Auto',      color: 'text-gray-500' },
  'update':         { label: 'Update',    color: 'text-gray-500' },
}
function triggerLabel(trigger) {
  const t = (trigger || '').toLowerCase()
  for (const [key, val] of Object.entries(TRIGGER_LABELS)) {
    if (t.includes(key)) return val
  }
  return { label: trigger || '—', color: 'text-gray-400' }
}

function getEventStyle(eventType) {
  const map = {
    'rescore':           { color: 'bg-gray-700',   label: 'Rescore',    text: 'text-gray-400' },
    'manual':            { color: 'bg-blue-900',   label: 'Manual',     text: 'text-blue-400' },
    'cascade_fired':     { color: 'bg-red-800',    label: '⚠ CASCADE',  text: 'text-red-300' },
    'cascade_resolved':  { color: 'bg-green-900',  label: '✓ Resolved', text: 'text-green-400' },
    'structure_break':   { color: 'bg-amber-900',  label: '⚠ BREAK',   text: 'text-amber-400' },
    'expansion_gex':     { color: 'bg-red-900',    label: '⚡ GEX EXP', text: 'text-red-400' },
    'level_cross':       { color: 'bg-yellow-900', label: '⚡ CROSS',   text: 'text-yellow-400' },
    'level_touch':       { color: 'bg-indigo-900', label: '· touch',    text: 'text-indigo-400' },
    'narrative':         { color: 'bg-purple-900', label: '🤖 AI',      text: 'text-purple-400' },
  }
  return map[eventType] || { color: 'bg-gray-800', label: eventType || '—', text: 'text-gray-500' }
}

const KEY_EVENTS = new Set(['cascade_fired', 'cascade_resolved', 'structure_break', 'expansion_gex', 'level_cross'])

function SessionTimeline({ events }) {
  const [selected, setSelected] = useState(null)

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider">
          Timeline ({events?.length || 0} events)
        </div>
        {selected !== null && (
          <button onClick={() => setSelected(null)} className="text-xs text-gray-600 hover:text-gray-400">
            ✕ clear
          </button>
        )}
      </div>

      <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
        {events?.map((event, i) => {
          const style  = getEventStyle(event.event_type)
          const isKey  = KEY_EVENTS.has(event.event_type)
          const timeStr = event.time
            ? new Date(event.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : event.created_at?.split('T')[1]?.slice(0, 5)
          return (
            <div
              key={i}
              onClick={() => setSelected(selected === i ? null : i)}
              className={`flex items-start gap-3 rounded px-2 py-1.5 cursor-pointer transition-colors ${
                selected === i ? 'bg-gray-700/50' : isKey ? 'hover:bg-gray-800/80' : 'hover:bg-gray-800/40'
              }`}
            >
              <span className="text-xs text-gray-600 font-mono shrink-0 mt-0.5">{timeStr}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${style.color} ${style.text}`}>
                {style.label}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {event.description || event.detail || (event.price != null ? `$${Number(event.price).toFixed(2)}` : '')}
              </span>
              {event.price != null && (
                <span className="text-xs text-gray-600 font-mono shrink-0 ml-auto">
                  ${Number(event.price).toFixed(2)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {selected !== null && events?.[selected] && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <div className="bg-gray-900/50 rounded p-3 space-y-1">
            {Object.entries(events[selected])
              .filter(([k]) => k !== 'id')
              .map(([k, v]) => v != null && (
                <div key={k} className="flex gap-3 text-xs">
                  <span className="text-gray-600 w-24 shrink-0">{k.replace(/_/g, ' ')}</span>
                  <span className="text-gray-300 font-mono">
                    {typeof v === 'number' ? v.toFixed(3) : String(v)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PostSession() {
  const [sessions, setSessions]       = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [story, setStory]             = useState(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [copied, setCopied]           = useState(false)
  const [noSessions, setNoSessions]   = useState(false)
  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) { setNoSessions(true); return }
        setSessions(data)
        setSelectedDate(data[0].date)
      })
      .catch(() => setNoSessions(true))
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setStoryLoading(true)
    fetch(`${API}/story/${selectedDate}`)
      .then(r => r.json())
      .then(data => { setStory(data); setStoryLoading(false) })
      .catch(() => setStoryLoading(false))
  }, [selectedDate])

  const exportStory = () => {
    if (!story) return
    navigator.clipboard.writeText(JSON.stringify(story, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const updateOutcome = async (levelId, outcome) => {
    await fetch(`${API}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedDate, level_id: levelId, outcome }),
    })
    fetch(`${API}/story/${selectedDate}`).then(r => r.json()).then(setStory)
  }

  if (noSessions) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 text-sm">
        <span className="text-2xl">—</span>
        <p>No sessions logged yet. Run <code className="bg-gray-800 px-1.5 rounded text-gray-300">npm start</code> to begin logging.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Session selector + export */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Session</label>
        <select
          value={selectedDate || ''}
          onChange={e => setSelectedDate(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-2 py-1 focus:outline-none"
        >
          {sessions.map(s => (
            <option key={s.date} value={s.date}>
              {s.date}{s.cascade_fired ? ' ⚠' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={exportStory}
          disabled={!story}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-600 text-gray-300 transition-colors"
        >
          {copied ? '✓ Copied' : '⬇ Export Session JSON'}
        </button>
      </div>

      {storyLoading && <div className="text-gray-500 text-sm text-center py-8">Loading…</div>}

      {story && !storyLoading && (
        <>
          <SessionScoreboard session={story} />

          {/* Summary boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Price range */}
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1">Price Range</div>
              <div className="font-mono text-sm">
                <span className="text-white">${story.session.session_low?.toFixed(2)}</span>
                <span className="text-gray-500 mx-1">—</span>
                <span className="text-white">${story.session.session_high?.toFixed(2)}</span>
              </div>
              <div className="text-xs mt-1 font-mono">
                <span className="text-gray-500">Open </span>
                <span className="text-white">${story.session.open_price?.toFixed(2)}</span>
                <span className="text-gray-500 mx-1">→ Close </span>
                <span className="text-white">{story.session.close_price != null ? `$${story.session.close_price.toFixed(2)}` : '—'}</span>
              </div>
            </div>

            {/* Enhancement 1 — Signal Accuracy with cascade context */}
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1">Signal Accuracy</div>
              {story.accuracy.total_classified === 0 ? (
                <>
                  <div className="text-2xl font-bold text-gray-500">—</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {story.session.cascade_fired
                      ? 'Cascade session — levels classified as no_edge'
                      : 'No actionable classifications this session'}
                  </div>
                </>
              ) : (
                <>
                  <div className={`text-2xl font-bold ${
                    story.accuracy.accuracy_pct == null ? 'text-gray-500' :
                    story.accuracy.accuracy_pct >= 70  ? 'text-green-400' :
                    story.accuracy.accuracy_pct >= 50  ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {story.accuracy.accuracy_pct != null ? `${story.accuracy.accuracy_pct}%` : '—'}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {story.accuracy.correct}✓ &nbsp;{story.accuracy.incorrect}✗ &nbsp;{story.accuracy.noise}~
                    &nbsp;of {story.accuracy.total_classified}
                  </div>
                </>
              )}
            </div>

            {/* Enhancement 2 — Session Events with cascade detail */}
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Session Events</div>

              {story.session.cascade_fired ? (
                <div className="mb-2">
                  <div className="text-red-400 text-sm font-bold mb-1">⚠ Cascade Fired</div>
                  {(story.cascade_events || []).map((ce, i) => (
                    <div key={i} className="text-xs text-gray-400 font-mono pl-2 space-y-0.5">
                      <div>Fired:    <span className="text-white">${ce.price_at_fire?.toFixed(2) ?? '—'}</span></div>
                      <div>Resolved: <span className="text-white">{ce.price_at_resolve != null ? `$${ce.price_at_resolve.toFixed(2)}` : '—'}</span></div>
                      <div>Drawdown: <span className="text-amber-400">{ce.drawdown != null ? `$${ce.drawdown}` : '—'}</span></div>
                      <div className="flex gap-3 mt-0.5">
                        <span className={ce.reached_s1 ? 'text-red-400' : 'text-gray-600'}>S1 {ce.reached_s1 ? '✓' : '✗'}</span>
                        <span className={ce.reached_s2 ? 'text-red-400' : 'text-gray-600'}>S2 {ce.reached_s2 ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-green-400 text-sm mb-1">✓ No cascade</div>
              )}

              {story.session.structure_break_fired && (
                <div className="text-amber-400 text-sm font-bold mb-1">⚠ Structure Break</div>
              )}
              {story.session_notes?.expansion_gex_fired && (
                <div className="text-red-400 text-xs font-bold mb-1">⚠ Expansion GEX fired</div>
              )}
              <div className="text-gray-500 text-xs mt-2">
                Magnet streak: <span className="text-white">{story.session.magnet_streak ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Enhancement 3 — Level outcomes with Flags + ETF columns */}
          <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Level Outcomes</div>

            {/* Mobile level list */}
            <div className="block sm:hidden space-y-2">
              {story.level_outcomes.map(level => (
                <div key={level.level} className="bg-gray-800/50 rounded border border-gray-700/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-mono font-bold">{level.level}</span>
                    <span className={`text-xs font-bold ${
                      level.outcome === 'correct' ? 'text-green-400' :
                      level.outcome === 'incorrect' ? 'text-red-400' :
                      level.outcome === 'noise' ? 'text-amber-400' : 'text-gray-500'
                    }`}>{level.outcome?.toUpperCase() || 'PENDING'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="text-gray-500">Classification <span className="text-gray-300 font-mono">
                      {level.classification === 'buy_support' ? 'BUY SUP' : level.classification === 'sell_resistance' ? 'SELL RES' : 'NO EDGE'}
                    </span></div>
                    <div className="text-gray-500">Score <span className="text-gray-300 font-mono">{level.score}</span></div>
                    <div className="text-gray-500">DP <span className="text-gray-300 font-mono">{level.dark_pool?.toFixed(3) ?? '—'}</span></div>
                    <div className="text-gray-500">Move <span className={`font-mono ${level.price_move == null ? 'text-gray-600' : level.price_move >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {level.price_move != null ? `${level.price_move >= 0 ? '+' : ''}${level.price_move.toFixed(2)}` : '—'}
                    </span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1.5 pr-2">Level</th>
                  <th className="text-left py-1.5 pr-2">Classification</th>
                  <th className="text-left py-1.5 pr-2">Conf</th>
                  <th className="text-right py-1.5 pr-2">Score</th>
                  <th className="text-right py-1.5 pr-2">DP</th>
                  <th className="text-left py-1.5 pr-2">Flags</th>
                  <th className="text-left py-1.5 pr-2">ETF</th>
                  <th className="text-right py-1.5 pr-2">Move</th>
                  <th className="text-left py-1.5 pr-2">Outcome</th>
                  <th className="text-left py-1.5">Override</th>
                </tr>
              </thead>
              <tbody>
                {story.level_outcomes.map(level => (
                  <tr key={level.level} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <td className="py-1.5 pr-2 font-mono font-bold text-white">{level.level}</td>
                    <td className="py-1.5 pr-2 text-gray-300">
                      {level.classification === 'buy_support' ? 'BUY SUP' :
                       level.classification === 'sell_resistance' ? 'SELL RES' : 'NO EDGE'}
                    </td>
                    <td className={`py-1.5 pr-2 ${CONF_COLOR[level.confidence] || 'text-gray-500'}`}>
                      {level.confidence?.toUpperCase() || '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-300">{level.score}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-400">{level.dark_pool?.toFixed(3) ?? '—'}</td>
                    <td className="py-1.5 pr-2">
                      {level.full_stack && <span className="text-yellow-400">★</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className={
                        level.etf_direction === 'bullish' ? 'text-green-400' :
                        level.etf_direction === 'bearish' ? 'text-red-400' : 'text-gray-500'
                      }>
                        {level.etf_direction === 'bullish' ? '↑' :
                         level.etf_direction === 'bearish' ? '↓' : '—'}
                      </span>
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono tabular-nums ${
                      level.price_move == null ? 'text-gray-600' :
                      level.price_move >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {level.price_move != null ? `${level.price_move >= 0 ? '+' : ''}${level.price_move.toFixed(2)}` : '—'}
                    </td>
                    <td className={`py-1.5 pr-2 font-bold ${OUTCOME_COLOR[level.outcome] || 'text-gray-600'}`}>
                      {level.outcome?.toUpperCase() || 'PENDING'}
                    </td>
                    <td className="py-1.5">
                      <select
                        defaultValue=""
                        onChange={e => e.target.value && updateOutcome(level.level, e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-gray-300 text-xs rounded px-1 py-0.5"
                      >
                        <option value="">—</option>
                        <option value="correct">✓ Correct</option>
                        <option value="incorrect">✗ Incorrect</option>
                        <option value="noise">~ Noise</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* High confidence */}
          {story.accuracy.high_confidence_calls > 0 && (
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">High Confidence Accuracy</div>
              <div className="text-2xl font-bold text-green-400">{story.accuracy.high_confidence_accuracy_pct}%</div>
              <div className="text-xs text-gray-500">
                {story.accuracy.high_confidence_correct} correct of {story.accuracy.high_confidence_calls} high confidence calls
              </div>
            </div>
          )}

          {story.timeline?.length > 0 && (
            <SessionTimeline events={story.timeline} />
          )}
        </>
      )}
    </div>
  )
}
