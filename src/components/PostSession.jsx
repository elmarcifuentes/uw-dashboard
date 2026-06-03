import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const CLASS_COLOR = {
  buy_support:     'text-green-400',
  sell_resistance: 'text-red-400',
  no_edge:         'text-gray-400',
  mid:             'text-cyan-400',
}

const CLASS_BG = {
  buy_support:     'bg-green-900/20',
  sell_resistance: 'bg-red-900/20',
  no_edge:         '',
  mid:             'bg-cyan-900/10',
}

const CLASS_LABEL = {
  buy_support:     'BUY SUP',
  sell_resistance: 'SELL RES',
  no_edge:         'NO EDGE',
  mid:             'MID',
}

function buildStoryJSON(session) {
  return {
    _type:          'session_story',
    session:        session.session,
    run_type:       session.run_type,
    fetched_at:     session.fetched_at,
    current_price:  session.current_price,
    cascade_fired:  session.cascade?.active ?? false,
    structure_break: session.structure_break?.active ?? false,
    levels:         (session.levels || []).map(l => ({
      id:             l.id,
      price:          l.price,
      classification: l.classification,
      confidence:     l.confidence,
      score:          l.score,
      dark_pool:      l.dark_pool,
      etf_direction:  l.etf_direction,
    })),
  }
}

export default function PostSession() {
  const [history, setHistory]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [toastMsg, setToastMsg]       = useState(null)

  useEffect(() => {
    axios.get(`${API}/history`)
      .then(r => setHistory(r.data || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [])

  const selected = history[selectedIdx]

  function handleExport() {
    if (!selected) return
    const story = buildStoryJSON(selected)
    navigator.clipboard.writeText(JSON.stringify(story, null, 2))
      .then(() => {
        setToastMsg('Copied to clipboard')
        setTimeout(() => setToastMsg(null), 2500)
      })
      .catch(() => setToastMsg('Copy failed'))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading history…
      </div>
    )
  }

  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 text-sm">
        <span className="text-2xl">—</span>
        <p>No session history yet. Run the scoring engine to populate.</p>
      </div>
    )
  }

  const levels = selected?.levels || []

  return (
    <div className="space-y-4 relative">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 bg-green-700 text-white px-4 py-2 rounded shadow-lg text-sm z-50 transition-all">
          {toastMsg}
        </div>
      )}

      {/* Session selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Session</label>
        <select
          value={selectedIdx}
          onChange={e => setSelectedIdx(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-2 py-1 focus:outline-none"
        >
          {history.map((s, i) => (
            <option key={i} value={i}>
              {s.session} — {s.run_type}
            </option>
          ))}
        </select>
        <button
          onClick={handleExport}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 text-gray-300 transition-colors"
        >
          Export Session JSON
        </button>
      </div>

      {/* Session summary */}
      {selected && (
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-gray-500">Date: </span><span className="text-gray-200">{selected.session}</span></div>
            <div><span className="text-gray-500">Run: </span><span className="text-gray-200">{selected.run_type}</span></div>
            <div><span className="text-gray-500">Price: </span><span className="text-gray-200">${selected.current_price?.toFixed(2) ?? '—'}</span></div>
            <div><span className="text-gray-500">Fetched: </span><span className="text-gray-200">{selected.fetched_at ?? '—'}</span></div>
          </div>
          <div className="flex gap-4 pt-1 text-xs">
            <span>Cascade: <span className={selected.cascade?.active ? 'text-red-400 font-bold' : 'text-green-400'}>{selected.cascade?.active ? 'FIRED' : 'inactive'}</span></span>
            <span>Structure Break: <span className={selected.structure_break?.active ? 'text-red-400 font-bold' : 'text-green-400'}>{selected.structure_break?.active ? 'YES' : 'no'}</span></span>
            <span>Resistance Magnet: <span className="text-gray-400">{selected.resistance_magnet_validated ? 'validated' : 'not fired'}</span></span>
          </div>
        </div>
      )}

      {/* Level outcome table */}
      {levels.length > 0 && (
        <div className="rounded border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Level</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-left">Classification</th>
                <th className="px-3 py-2 text-center">Conf</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">DP</th>
                <th className="px-3 py-2 text-center">ETF</th>
              </tr>
            </thead>
            <tbody>
              {[...levels].reverse().map(l => {
                const classKey = l.classification === 'mid' ? 'mid' : l.classification
                return (
                  <tr key={l.id} className={`border-t border-gray-800 ${CLASS_BG[classKey] || ''}`}>
                    <td className="px-3 py-2 font-bold text-white">{l.id}</td>
                    <td className="px-3 py-2 text-right text-gray-200">${l.price?.toFixed(2)}</td>
                    <td className={`px-3 py-2 font-medium ${CLASS_COLOR[classKey] || 'text-gray-400'}`}>
                      {CLASS_LABEL[classKey] || l.classification}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-300 uppercase">
                      {l.confidence}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{l.score}</td>
                    <td className="px-3 py-2 text-right text-gray-400 tabular-nums">
                      {typeof l.dark_pool === 'number' ? l.dark_pool.toFixed(3) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-center text-sm ${l.etf_direction === 'bullish' ? 'text-green-400' : l.etf_direction === 'bearish' ? 'text-red-400' : 'text-gray-500'}`}>
                      {l.etf_direction === 'bullish' ? '↑' : l.etf_direction === 'bearish' ? '↓' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
