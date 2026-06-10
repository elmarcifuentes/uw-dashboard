import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import SystemPanel from './SystemPanel'
import LabsPanel from './LabsPanel'

export default function SettingsTab({ systemPaused, pausedAt, activeSymbol, sessionRatio, sessionRatioLockedAt, ratioIsLocked, ratioIsFromToday }) {
  const { unlocked, unlock } = useAuth()
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(null)
  const [activePanel, setActivePanel] = useState('system')

  const handleUnlock = () => {
    if (pinInput.length < 4) { setPinError('PIN must be at least 4 characters'); return }
    unlock(pinInput)
    setPinInput('')
    setPinError(null)
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="text-text-secondary text-sm uppercase tracking-wide">🔒 Settings — PIN Required</div>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Enter PIN"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            className="bg-bg-elevated border border-border-strong rounded px-3 py-2 text-text-primary text-sm focus:border-blue-500 focus:outline-none w-32 text-center tracking-widest"
            autoFocus
          />
          <button onClick={handleUnlock} className="bg-blue-600 hover:bg-blue-500 text-text-primary rounded px-4 py-2 text-sm">
            Unlock
          </button>
        </div>
        {pinError && <div className="text-red-400 text-xs">{pinError}</div>}
        <div className="text-text-muted text-xs mt-2">Same PIN as before</div>
      </div>
    )
  }

  return (
    <div className="py-3">
      <div className="flex gap-1 bg-bg-elevated/50 rounded-lg p-0.5 mb-4 max-w-xs">
        <button
          onClick={() => setActivePanel('system')}
          className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${
            activePanel === 'system' ? 'bg-bg-card text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          ⚙ System
        </button>
        <button
          onClick={() => setActivePanel('labs')}
          className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${
            activePanel === 'labs' ? 'bg-bg-card text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          🧪 Labs
        </button>
      </div>

      {activePanel === 'system' && <SystemPanel systemPaused={systemPaused} pausedAt={pausedAt} sessionRatio={sessionRatio} sessionRatioLockedAt={sessionRatioLockedAt} ratioIsLocked={ratioIsLocked} ratioIsFromToday={ratioIsFromToday} />}
      {activePanel === 'labs'   && <LabsPanel activeSymbol={activeSymbol} />}
    </div>
  )
}
