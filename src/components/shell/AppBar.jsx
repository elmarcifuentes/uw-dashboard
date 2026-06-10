import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Bot, Pause, Lock, Unlock } from 'lucide-react'

const SYMBOLS = [
  { id: 'NQ',  label: 'NQ',  color: 'text-signal-continuation' },
  { id: 'QQQ', label: 'QQQ', color: 'text-text-primary' },
]

function SessionTypeChip() {
  const etHour = parseInt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
  const label  = etHour >= 9 && etHour < 16 ? 'LIVE' : etHour >= 4 && etHour < 9 ? 'PRE-MKT' : 'AFTER-HRS'
  const color  = label === 'LIVE' ? 'text-state-hold bg-state-holdSoft' : 'text-text-tertiary bg-bg-card2'
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
    <header className="border-b border-border-subtle bg-bg-base sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 h-11 sm:h-12 flex items-center justify-between gap-2 sm:gap-4">

        <div className="flex items-center gap-2 shrink-0 relative">
          <span className="text-text-primary font-bold text-sm tracking-wide">TradesAlgo</span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-text-disabled text-xs hover:text-text-tertiary transition-colors"
          >
            v4c
          </button>
          {showInfo && (
            <div className="absolute top-full mt-2 left-0 bg-bg-card border border-border-subtle rounded-lg p-3 text-xs space-y-1 z-50 shadow-elevated w-48">
              <div className="text-text-secondary font-bold mb-2">TradesAlgo</div>
              <div className="flex justify-between gap-8">
                <span className="text-text-muted">Build</span>
                <span className="text-text-secondary">v4c</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-text-muted">Claude</span>
                <span className="text-text-secondary">Haiku 4.5</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-text-muted">Mode</span>
                <span className={narrativeMode === 'claude' ? 'text-accent-ai' : 'text-text-secondary'}>
                  {narrativeMode || 'default'}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-text-muted">Railway</span>
                <span className={connected ? 'text-state-hold' : 'text-state-stop'}>
                  {connected ? 'connected' : 'offline'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 bg-bg-elevated/60 rounded-lg p-0.5 shrink-0">
          {SYMBOLS.map(s => (
            <button
              key={s.id}
              onClick={() => onSymbolChange?.(s.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                activeSymbol === s.id
                  ? `bg-bg-card ${s.color} shadow-card`
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-state-hold' : 'bg-state-stop'} ${connected && !cascadeActive ? 'animate-pulse' : ''}`} />
          <span className="text-text-primary font-price font-bold text-sm">
            {activeSymbol === 'NQ'
              ? (nqPrice != null ? '$' + nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
              : (price != null ? '$' + price.toFixed(2) : '—')}
          </span>
          <span className="text-text-muted hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {narrativeMode === 'claude' && (
            <span className="text-xs text-accent-ai bg-accent-aiSoft px-2 py-0.5 rounded hidden sm:flex items-center gap-1">
              <Bot className="w-3 h-3" /> Claude
            </span>
          )}
          {systemPaused ? (
            <span className="text-xs px-2 py-0.5 rounded font-medium text-state-paused bg-state-paused/15 animate-pulse flex items-center gap-1">
              <Pause className="w-3 h-3" /> PAUSED
            </span>
          ) : (
            <SessionTypeChip />
          )}
          <button
            onClick={onLockClick}
            title={unlocked ? 'Unlocked — click to lock' : 'Click to unlock'}
            className="text-text-muted hover:text-text-secondary transition-colors leading-none"
          >
            {unlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {systemPaused && (
        <div className="bg-state-cascadeWatchSoft border-t border-state-cascadeWatch/30 px-4 py-1.5 flex items-center gap-3 text-xs">
          <span className="text-state-paused font-bold shrink-0 flex items-center gap-1">
            <Pause className="w-3 h-3" /> SYSTEM PAUSED
          </span>
          <span className="text-state-paused/60">— data frozen</span>
          {pausedAt && <span className="text-text-muted">since {formatPausedTime(pausedAt)} ET</span>}
          <span className="text-text-muted hidden sm:block">· Resume in Controls tab</span>
        </div>
      )}
    </header>
  )
}
