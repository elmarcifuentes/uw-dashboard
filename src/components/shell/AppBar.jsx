import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const SYMBOLS = [
  { id: 'NQ',  label: 'NQ',  color: 'text-blue-400' },
  { id: 'QQQ', label: 'QQQ', color: 'text-white' },
]

function SessionTypeChip() {
  const etHour = parseInt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
  const label  = etHour >= 9 && etHour < 16 ? 'LIVE' : etHour >= 4 && etHour < 9 ? 'PRE-MKT' : 'AFTER-HRS'
  const color  = label === 'LIVE' ? 'text-green-400 bg-green-950' : 'text-gray-500 bg-gray-900'
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${color}`}>{label}</span>
}

function formatPausedTime(isoString) {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York'
    })
  } catch { return '' }
}

export default function AppBar({ connected, price, nqPrice, narrativeMode, onLockClick, unlocked, cascadeActive, systemPaused, pausedAt, activeSymbol = 'NQ', onSymbolChange }) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <header className="border-b border-gray-800 bg-[#0a0f1e] sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 h-11 sm:h-12 flex items-center justify-between gap-2 sm:gap-4">

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 relative">
          <span className="text-white font-bold text-sm tracking-wide">TradesAlgo</span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-gray-700 text-xs hover:text-gray-500 transition-colors"
          >
            v4b
          </button>
          {showInfo && (
            <div className="absolute top-full mt-2 left-0 bg-[#111827] border border-gray-800 rounded-lg p-3 text-xs space-y-1 z-50 shadow-xl w-48">
              <div className="text-gray-400 font-bold mb-2">TradesAlgo</div>
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Build</span>
                <span className="text-gray-400">v4b</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Claude</span>
                <span className="text-gray-400">Haiku 4.5</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Mode</span>
                <span className={narrativeMode === 'claude' ? 'text-purple-400' : 'text-gray-400'}>
                  {narrativeMode || 'default'}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Railway</span>
                <span className={connected ? 'text-green-400' : 'text-red-400'}>
                  {connected ? 'connected' : 'offline'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Symbol selector */}
        <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-0.5 shrink-0">
          {SYMBOLS.map(s => (
            <button
              key={s.id}
              onClick={() => onSymbolChange?.(s.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                activeSymbol === s.id
                  ? `bg-[#111827] ${s.color} shadow-sm`
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Live price — changes with symbol */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-red-500'} ${connected && !cascadeActive ? 'animate-pulse' : ''}`} />
          <span className="text-white font-mono font-bold text-sm">
            {activeSymbol === 'NQ'
              ? (nqPrice != null ? '$' + nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
              : (price != null ? '$' + price.toFixed(2) : '—')}
          </span>
          <span className="text-gray-600 hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          {narrativeMode === 'claude' && (
            <span className="text-xs text-purple-400 bg-purple-950 px-2 py-0.5 rounded hidden sm:block">
              🤖 Claude
            </span>
          )}
          {systemPaused ? (
            <span className="text-xs px-2 py-0.5 rounded font-medium text-amber-400 bg-amber-950 animate-pulse">⏸ PAUSED</span>
          ) : (
            <SessionTypeChip />
          )}
          <button
            onClick={onLockClick}
            title={unlocked ? 'Unlocked — click to lock' : 'Click to unlock'}
            className="text-base leading-none hover:opacity-80 transition-opacity"
          >
            {unlocked ? '🔓' : '🔒'}
          </button>
        </div>
      </div>

      {systemPaused && (
        <div className="bg-amber-950/80 border-t border-amber-800/40 px-4 py-1.5 flex items-center gap-3 text-xs">
          <span className="text-amber-400 font-bold shrink-0">⏸ SYSTEM PAUSED</span>
          <span className="text-amber-300/60">— data frozen</span>
          {pausedAt && <span className="text-gray-600">since {formatPausedTime(pausedAt)} ET</span>}
          <span className="text-gray-600 hidden sm:block">· Resume in Controls tab</span>
        </div>
      )}
    </header>
  )
}
