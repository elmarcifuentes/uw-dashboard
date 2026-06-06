import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Controls from './intraday/Controls'

export default function ControlsTab() {
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
    <div className="py-3">
      <Controls compact={false} />
    </div>
  )
}
