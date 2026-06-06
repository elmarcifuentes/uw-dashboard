import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Controls from './intraday/Controls'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function SystemStatus({ systemPaused, pausedAt }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const formatTime = (iso) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York'
      })
    } catch { return '' }
  }

  const handleToggle = async () => {
    setLoading(true)
    setError(null)
    const endpoint = systemPaused ? '/system/resume' : '/system/pause'
    try {
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const services = [
    { label: 'SSE Stream',       ok: true  },
    { label: 'UW Polling',       ok: !systemPaused },
    { label: 'Auto-rescore',     ok: !systemPaused },
    { label: 'Price updates',    ok: !systemPaused },
  ]

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider font-medium">System Status</div>
          {systemPaused && pausedAt && (
            <div className="text-xs text-amber-400/70 mt-0.5">Paused since {formatTime(pausedAt)} ET</div>
          )}
        </div>
        <div className={`text-xs px-2 py-1 rounded font-medium ${
          systemPaused ? 'text-amber-400 bg-amber-950 border border-amber-800' : 'text-green-400 bg-green-950 border border-green-900'
        }`}>
          {systemPaused ? '⏸ PAUSED' : '● RUNNING'}
        </div>
      </div>

      <div className="space-y-1.5">
        {services.map(svc => (
          <div key={svc.label} className="flex items-center gap-2.5 text-xs">
            <span className={`w-2 h-2 rounded-full shrink-0 ${svc.ok ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className={svc.ok ? 'text-gray-300' : 'text-gray-600'}>{svc.label}</span>
            <span className={`ml-auto text-xs ${svc.ok ? 'text-green-500' : 'text-gray-600'}`}>
              {svc.ok ? 'active' : 'paused'}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 pt-3">
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`w-full py-2 rounded text-sm font-medium transition-colors ${
            systemPaused
              ? 'bg-green-700 hover:bg-green-600 text-white disabled:opacity-50'
              : 'bg-amber-800 hover:bg-amber-700 text-white disabled:opacity-50'
          }`}
        >
          {loading ? '...' : systemPaused ? '▶ Resume System' : '⏸ Pause System'}
        </button>
        <div className="text-xs text-gray-600 text-center mt-1.5">
          {systemPaused
            ? 'Restarts UW polling and auto-rescore'
            : 'Stops all UW + Claude API calls — dashboard stays live'}
        </div>
      </div>
    </div>
  )
}

export default function ControlsTab({ systemPaused, pausedAt }) {
  const { unlocked, unlock } = useAuth()
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(null)

  const handleUnlock = () => {
    if (pinInput.length < 4) { setPinError('PIN must be at least 4 characters'); return }
    unlock(pinInput)
    setPinInput('')
    setPinError(null)
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="text-gray-400 text-sm uppercase tracking-wide">🔒 Controls — PIN Required</div>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Enter PIN"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none w-32 text-center tracking-widest"
            autoFocus
          />
          <button
            onClick={handleUnlock}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 text-sm"
          >
            Unlock
          </button>
        </div>
        {pinError && <div className="text-red-400 text-xs">{pinError}</div>}
        <div className="text-gray-600 text-xs mt-2">Same PIN as Levels tab</div>
      </div>
    )
  }

  return (
    <div className="py-3 space-y-6 max-w-lg">
      <SystemStatus systemPaused={systemPaused} pausedAt={pausedAt} />
      <Controls compact={false} />
    </div>
  )
}
