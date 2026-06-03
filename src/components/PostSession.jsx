import { useState, useEffect } from 'react'

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

export default function PostSession() {
  const [sessions, setSessions]       = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [story, setStory]             = useState(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [copied, setCopied]           = useState(false)
  const [noSessions, setNoSessions]   = useState(false)

  // Load session list on mount
  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
          setNoSessions(true)
          return
        }
        setSessions(data)
        setSelectedDate(data[0].date)
      })
      .catch(() => setNoSessions(true))
  }, [])

  // Load story when date changes
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
    // Refresh story
    fetch(`${API}/story/${selectedDate}`)
      .then(r => r.json())
      .then(setStory)
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

      {storyLoading && (
        <div className="text-gray-500 text-sm text-center py-8">Loading…</div>
      )}

      {story && !storyLoading && (
        <>
          {/* Summary boxes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1">Price Range</div>
              <div className="text-white font-mono text-sm">
                ${story.session.session_low?.toFixed(2)} — ${story.session.session_high?.toFixed(2)}
              </div>
              <div className="text-gray-500 text-xs mt-1">
                Open ${story.session.open_price?.toFixed(2)} → Close ${story.session.close_price?.toFixed(2) ?? '—'}
              </div>
            </div>

            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1">Signal Accuracy</div>
              <div className={`text-2xl font-bold ${
                story.accuracy.accuracy_pct == null        ? 'text-gray-500' :
                story.accuracy.accuracy_pct >= 70         ? 'text-green-400' :
                story.accuracy.accuracy_pct >= 50         ? 'text-amber-400' : 'text-red-400'
              }`}>
                {story.accuracy.accuracy_pct != null ? `${story.accuracy.accuracy_pct}%` : '—'}
              </div>
              <div className="text-gray-500 text-xs">
                {story.accuracy.correct}✓ &nbsp;{story.accuracy.incorrect}✗ &nbsp;{story.accuracy.noise}~
                &nbsp;of {story.accuracy.total_classified}
              </div>
            </div>

            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1">Session Events</div>
              <div className={`text-sm ${story.session.cascade_fired ? 'text-red-400' : 'text-green-400'}`}>
                {story.session.cascade_fired ? '⚠ Cascade fired' : '✓ No cascade'}
              </div>
              <div className={`text-sm ${story.session.structure_break_fired ? 'text-amber-400' : 'text-green-400'}`}>
                {story.session.structure_break_fired ? '⚠ Structure break' : '✓ No break'}
              </div>
              <div className="text-gray-500 text-xs mt-1">
                Magnet streak: {story.session.magnet_streak ?? '—'}
              </div>
            </div>
          </div>

          {/* Level outcomes table */}
          <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Level Outcomes</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1.5 pr-2">Level</th>
                  <th className="text-left py-1.5 pr-2">Classification</th>
                  <th className="text-left py-1.5 pr-2">Conf</th>
                  <th className="text-right py-1.5 pr-2">Score</th>
                  <th className="text-right py-1.5 pr-2">DP</th>
                  <th className="text-right py-1.5 pr-2">Move</th>
                  <th className="text-left py-1.5 pr-2">Outcome</th>
                  <th className="text-left py-1.5">Override</th>
                </tr>
              </thead>
              <tbody>
                {story.level_outcomes.map(level => (
                  <tr key={level.level} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <td className="py-1.5 pr-2 font-mono font-bold text-white">
                      {level.level}
                      {level.full_stack && <span className="text-yellow-400 ml-1">★</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-300">
                      {level.classification === 'buy_support'    ? 'BUY SUP'  :
                       level.classification === 'sell_resistance' ? 'SELL RES' : 'NO EDGE'}
                    </td>
                    <td className={`py-1.5 pr-2 ${CONF_COLOR[level.confidence] || 'text-gray-500'}`}>
                      {level.confidence?.toUpperCase() || '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-300">{level.score}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-400">
                      {level.dark_pool?.toFixed(3) ?? '—'}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono tabular-nums ${
                      level.price_move == null ? 'text-gray-600' :
                      level.price_move >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {level.price_move != null
                        ? `${level.price_move >= 0 ? '+' : ''}${level.price_move.toFixed(2)}`
                        : '—'}
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

          {/* High confidence box */}
          {story.accuracy.high_confidence_calls > 0 && (
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">High Confidence Accuracy</div>
              <div className="text-2xl font-bold text-green-400">
                {story.accuracy.high_confidence_accuracy_pct}%
              </div>
              <div className="text-xs text-gray-500">
                {story.accuracy.high_confidence_correct} correct of {story.accuracy.high_confidence_calls} high confidence calls
              </div>
            </div>
          )}

          {/* Session timeline */}
          {story.timeline.length > 0 && (
            <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Timeline ({story.timeline.length} events)
              </div>
              <div className="overflow-y-auto max-h-48 space-y-0">
                {story.timeline.map((event, i) => (
                  <div key={i} className="flex gap-3 text-xs py-1 border-b border-gray-800/60">
                    <span className="text-gray-500 font-mono w-14 shrink-0">
                      {new Date(event.time).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit', hour12: false
                      })}
                    </span>
                    <span className="text-gray-400 truncate flex-1">{event.trigger}</span>
                    <span className="text-gray-300 font-mono tabular-nums">
                      {event.price != null ? `$${Number(event.price).toFixed(2)}` : ''}
                    </span>
                    {event.cascade_active        && <span className="text-red-400 shrink-0">⚠ CASCADE</span>}
                    {event.structure_break_active && <span className="text-amber-400 shrink-0">⚠ BREAK</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
