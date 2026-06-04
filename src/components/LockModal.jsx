import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LockModal({ onClose }) {
  const { unlock, unlocked, lock } = useAuth()
  const [input, setInput]   = useState('')
  const [error, setError]   = useState(null)

  const handleUnlock = () => {
    if (input.length < 4) { setError('PIN must be at least 4 characters'); return }
    unlock(input)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 w-80">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">
            {unlocked ? '🔓 Actions Unlocked' : '🔒 Unlock Actions'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {unlocked ? (
          <>
            <p className="text-green-400 text-sm mb-3">Dashboard actions are unlocked for this session.</p>
            <div className="text-xs text-gray-400 space-y-1 mb-4">
              <div>✓ Draw QQQ (fast path)</div>
              <div>✓ Draw both charts</div>
              <div>✓ REST / WebSocket toggle</div>
              <div>✓ Force Rescore</div>
            </div>
            <button
              onClick={() => { lock(); onClose() }}
              className="w-full py-2 bg-red-900 hover:bg-red-800 text-red-300 rounded text-sm"
            >
              🔒 Lock Actions
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-4">Enter PIN to unlock draw and control actions.</p>
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              placeholder="Enter PIN"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-3 focus:outline-none focus:border-teal-500"
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              onClick={handleUnlock}
              className="w-full py-2 bg-teal-700 hover:bg-teal-600 text-white rounded text-sm font-medium"
            >
              Unlock
            </button>
            <div className="mt-4 text-xs text-gray-600 space-y-0.5">
              <div>Protected actions:</div>
              <div>• Draw QQQ / Both charts</div>
              <div>• REST / WebSocket toggle</div>
              <div>• Force Rescore</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
