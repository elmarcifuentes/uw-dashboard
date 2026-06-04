import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function Controls({ compact }) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const { unlocked, authPost } = useAuth()
  const [status, setStatus]           = useState(null)
  const [budget, setBudget]           = useState(null)
  const [mode, setMode]               = useState('REST')
  const [rescoring, setRescoring]     = useState(false)
  const [narrativeMode, setNarrativeMode] = useState('template')

  const fetchAll = async () => {
    try {
      const [s, b] = await Promise.all([
        fetch(`${API_URL}/status`).then(r => r.json()),
        fetch(`${API_URL}/budget`).then(r => r.json()),
      ])
      setStatus(s)
      setBudget(b)
      setMode(s.activeMode === 'WebSocket' ? 'WebSocket' : 'REST')
      if (s.narrativeMode) setNarrativeMode(s.narrativeMode)
    } catch { /* server may be down */ }
  }

  const switchNarrativeMode = async (m) => {
    try {
      await fetch(`${API_URL}/narrative-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m }),
      })
      setNarrativeMode(m)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 10000)
    return () => clearInterval(t)
  }, [])

  const forceRescore = async () => {
    if (!unlocked) return
    setRescoring(true)
    try { await authPost(`${API_URL}/rescore`) } catch { /* ignore */ }
    setTimeout(() => setRescoring(false), 2000)
  }

  const toggleMode = async () => {
    if (!unlocked) return
    const useWS = mode === 'REST'
    try {
      await authPost(`${API_URL}/mode`, { useWebSocket: useWS })
      setMode(useWS ? 'WebSocket' : 'REST')
    } catch { /* ignore */ }
  }

  const budgetPct   = budget ? parseFloat(budget.percentUsed) : 0
  const budgetColor = budgetPct > 80 ? 'bg-red-500' : budgetPct > 50 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="flex flex-col gap-3 max-w-lg">

      {/* Manual controls */}
      <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Manual Controls</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={forceRescore}
            disabled={!unlocked || rescoring}
            className={`px-3 py-2 text-white text-sm rounded transition-colors ${
              !unlocked ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-teal-700 hover:bg-teal-600 disabled:opacity-50'
            }`}
          >
            {!unlocked ? '🔒 Rescore' : rescoring ? '⟳ Rescoring…' : '⟳ Force Rescore Now'}
          </button>
          <button
            onClick={toggleMode}
            disabled={!unlocked}
            className={`px-3 py-2 text-white text-sm rounded transition-colors ${
              !unlocked ? 'bg-gray-800 text-gray-600 cursor-not-allowed' :
              mode === 'REST' ? 'bg-green-800 hover:bg-green-700' : 'bg-blue-800 hover:bg-blue-700'
            }`}
          >
            {!unlocked ? '🔒 Mode' : mode === 'REST' ? '● REST POLLING' : '○ WEBSOCKET'}
          </button>
        </div>
      </div>

      {/* Narrative mode */}
      <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Session Narrative</div>
        <div className="flex gap-1">
          {[
            { key: 'template', label: '📋 Template', desc: 'Fast — rule based' },
            { key: 'claude',   label: '🤖 Claude+MCP', desc: 'Smart — uses live UW data' },
            { key: 'off',      label: '○ Off', desc: 'No narrative' },
          ].map(({ key, label, desc }) => (
            <button
              key={key}
              onClick={() => switchNarrativeMode(key)}
              title={desc}
              className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                narrativeMode === key
                  ? key === 'claude' ? 'bg-purple-700 text-white'
                  : key === 'off'    ? 'bg-gray-600 text-gray-300'
                  :                    'bg-teal-700 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {narrativeMode === 'template' && 'Rule-based — instant, always available'}
          {narrativeMode === 'claude'   && '🤖 Claude + UW MCP — requires draw relay running'}
          {narrativeMode === 'off'      && 'Narrative disabled'}
        </p>
      </div>

      {/* Polling status */}
      {status && (
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Polling Status</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
            <span className="text-gray-500">Interval</span>
            <span className="text-white">{(status.currentInterval / 1000).toFixed(0)}s</span>
            <span className="text-gray-500">Levels loaded</span>
            <span className="text-white">{status.levelsLoaded}</span>
            <span className="text-gray-500">Market hours</span>
            <span className={status.isMarketHours ? 'text-green-400' : 'text-gray-400'}>
              {status.isMarketHours ? 'OPEN' : 'OVERNIGHT'}
            </span>
            <span className="text-gray-500">Last rescore</span>
            <span className="text-white">
              {status.lastRescore ? new Date(status.lastRescore).toLocaleTimeString() : '—'}
            </span>
            <span className="text-gray-500">Last reason</span>
            <span className="text-amber-400 truncate">{status.lastRescoreReason || '—'}</span>
            <span className="text-gray-500">Polling active</span>
            <span className={status.pollingActive ? 'text-green-400' : 'text-gray-400'}>
              {status.pollingActive ? 'YES' : 'NO'}
            </span>
          </div>
        </div>
      )}

      {/* Budget */}
      {budget && (
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">API Budget</div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetColor}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-white font-mono w-10 text-right">{budgetPct}%</span>
          </div>
          <div className="text-xs text-gray-400 font-mono">
            {budget.callsToday.toLocaleString()} / {budget.workingBudget.toLocaleString()} calls
            &nbsp;—&nbsp;
            {(budget.workingBudget - budget.callsToday).toLocaleString()} remaining
          </div>
        </div>
      )}

    </div>
  )
}
