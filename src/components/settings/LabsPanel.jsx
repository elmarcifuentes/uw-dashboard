import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'
import HeatmapView from '../labs/HeatmapView'
import LevelComparison from '../labs/LevelComparison'
import TradeSetupCard from '../labs/TradeSetupCard'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const INTERVALS = [
  { value: '5m', label: '5 min' },
  { value: '1m', label: '1 min' },
]

export default function LabsPanel({ activeSymbol = 'QQQ' }) {
  const [autoLevels, setAutoLevels]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [applying, setApplying]         = useState(null)
  const [currentLevels, setCurrentLevels] = useState(null)
  const [currentPrice, setCurrentPrice]   = useState(null)
  const [nqRatio, setNqRatio]             = useState(41.14)
  const [scoredLevels, setScoredLevels]   = useState(null)
  const [settings, setSettings]     = useState({ interval: '5m', length: 200, mult: 6.0, avgMode: 'daily' })
  const [nqContract, setNqContract]   = useState(null)
  const [nqContractExpiry, setNqContractExpiry] = useState(null)

  useEffect(() => {
    fetch(`${API_URL}/labs/auto-levels`)
      .then(r => r.json())
      .then(data => {
        setAutoLevels(data)
        if (data.settings)      setSettings(data.settings)
        else if (data.interval) setSettings(prev => ({ ...prev, interval: data.interval }))
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch(`${API_URL}/status`)
      .then(r => r.json())
      .then(data => {
        setCurrentPrice(data.lastPrice)
        if (data.nq_ratio)          setNqRatio(Number(data.nq_ratio))
        if (data.nqContract)        setNqContract(data.nqContract)
        if (data.nqContractExpiry)  setNqContractExpiry(data.nqContractExpiry)
        setCurrentLevels(data.levels)
      })
      .catch(() => {})

    fetch(`${API_URL}/labs/scoring-latest`)
      .then(r => r.json())
      .then(data => setScoredLevels(data?.levels))
      .catch(() => {})
  }, [])

  const handleApply = async (source) => {
    setApplying(source)
    try {
      const res  = await fetch(`${API_URL}/labs/apply-to-main`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      })
      const data = await res.json()
      if (data.success) alert(`✅ ${source.toUpperCase()} levels applied to main dashboard!`)
    } finally {
      setApplying(null)
    }
  }

  const handleRecalculate = async () => {
    setLoading(true)
    await fetch(`${API_URL}/labs/recalculate`, { method: 'POST' })
    const data = await fetch(`${API_URL}/labs/auto-levels`).then(r => r.json())
    setAutoLevels(data)
    if (data.settings) setSettings(data.settings)
    setLoading(false)
  }

  const handleSettingsChange = async (newSettings) => {
    setLoading(true)
    try {
      const res  = await fetch(`${API_URL}/labs/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      })
      const data = await res.json()
      if (data.levels)   setAutoLevels(data.levels)
      if (data.settings) setSettings(data.settings)
    } catch (e) {
      console.warn('[labs] settings change failed:', e.message)
    } finally {
      setLoading(false)
    }
  }

  // Timeframe is the active recurrence feed (not a preview): switch loads that
  // timeframe's persisted state on the server, cold-starting it only if none exists.
  const handleIntervalChange = async (interval) => {
    if (interval === settings.interval) return
    setLoading(true)
    try {
      const res  = await fetch(`${API_URL}/labs/active-interval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval })
      })
      const data = await res.json()
      if (data.levels)   setAutoLevels(data.levels)
      setSettings(prev => ({ ...prev, interval }))
    } catch (e) {
      console.warn('[labs] timeframe change failed:', e.message)
    } finally {
      setLoading(false)
    }
  }

  const levels = autoLevels?.nq

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-bold text-text-primary uppercase tracking-wide">TradesAlgo Labs</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Predictive Ranges · NQ native · length={settings.length} · factor={settings.mult}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded">
            🧪 BETA
          </span>
          <button
            onClick={handleRecalculate}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-bg-elevated hover:bg-bg-card2 text-text-primary rounded transition-colors disabled:opacity-50"
          >
            {loading ? '⟳ Calculating...' : '⟳ Recalculate'}
          </button>
        </div>
      </div>

      {/* Controls row: timeframe + source */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Timeframe</span>
          <div className="flex gap-1">
            {INTERVALS.map(tf => (
              <button
                key={tf.value}
                onClick={() => handleIntervalChange(tf.value)}
                disabled={loading}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-40 ${
                  settings.interval === tf.value
                    ? 'bg-indigo-700 text-text-primary'
                    : 'bg-bg-elevated text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-text-muted">· active feed</span>
        </div>

        <div className="w-px h-4 bg-bg-elevated" />

        {/* Length */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Length</span>
          <input
            type="number"
            value={settings.length}
            onChange={e => setSettings(prev => ({ ...prev, length: parseInt(e.target.value) || 200 }))}
            onBlur={e => handleSettingsChange({ ...settings, length: parseInt(e.target.value) || settings.length })}
            min="50"
            max="500"
            step="10"
            className="bg-bg-elevated text-text-primary font-price text-xs rounded px-2 py-1.5 border border-border-default focus:border-accent-ai focus:outline-none w-20 text-center"
          />
        </div>

        {/* Factor */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Factor</span>
          <input
            type="number"
            value={settings.mult}
            onChange={e => setSettings(prev => ({ ...prev, mult: parseFloat(e.target.value) || 6.0 }))}
            onBlur={e => handleSettingsChange({ ...settings, mult: parseFloat(e.target.value) || settings.mult })}
            min="1.0"
            max="15.0"
            step="0.5"
            className="bg-bg-elevated text-text-primary font-price text-xs rounded px-2 py-1.5 border border-border-default focus:border-accent-ai focus:outline-none w-20 text-center"
          />
        </div>

        {/* Avg Mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Avg</span>
          <div className="flex gap-1">
            {[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }].map(m => (
              <button
                key={m.value}
                onClick={() => handleSettingsChange({ ...settings, avgMode: m.value })}
                disabled={loading}
                className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-40 ${
                  settings.avgMode === m.value
                    ? 'bg-indigo-700 text-text-primary'
                    : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {settings.avgMode === 'daily' && (
            <button
              onClick={async () => {
                await fetch(`${API_URL}/labs/reset-avg`, { method: 'POST' })
                handleRecalculate()
              }}
              className="text-xs text-text-muted hover:text-red-400 transition-colors underline underline-offset-2"
            >
              reset avg
            </button>
          )}
        </div>

        {/* NQ source info */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Source:</span>
          <span className="text-text-secondary">Polygon</span>
          {nqContract && <span className="font-mono text-text-tertiary">({nqContract})</span>}
          <span>· Yahoo fallback</span>
        </div>

        {autoLevels?.lastCalculated && !loading && (
          <span className="text-xs text-text-muted">
            {settings.interval} bars ·{' '}
            {new Date(autoLevels.lastCalculated).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York'
            })} ET
          </span>
        )}

        {/* Info tooltip */}
        <div className="relative group ml-auto">
          <Info
            size={13}
            className="text-text-disabled hover:text-text-tertiary cursor-help transition-colors"
          />
          <div className="absolute right-0 bottom-full mb-2 w-72 z-50 bg-bg-elevated border border-border-default rounded-lg p-3 shadow-elevated invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none">
            <div className="text-micro font-bold text-text-tertiary uppercase tracking-wider mb-2">Current Settings</div>
            <div className="font-price text-xs text-text-primary mb-3">
              ATR({settings.length}) × {settings.mult} · 250 bars · {settings.interval}
              {autoLevels?.lastCalculated && (
                <span className="text-text-muted ml-1">
                  · {new Date(autoLevels.lastCalculated).toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit'
                  })} ET
                </span>
              )}
            </div>
            <div className="border-t border-border-subtle mb-2" />
            <div className="space-y-1.5">
              <div>
                <span className="text-micro font-bold text-text-secondary">Length</span>
                <span className="text-micro text-text-muted ml-1">(default 200)</span>
                <p className="text-micro text-text-muted mt-0.5">ATR period. Shorter = more responsive to recent volatility. Longer = smoother, more stable levels.</p>
              </div>
              <div>
                <span className="text-micro font-bold text-text-secondary">Factor</span>
                <span className="text-micro text-text-muted ml-1">(default 6.0)</span>
                <p className="text-micro text-text-muted mt-0.5">Band multiplier. Lower = tighter levels for quiet markets. Higher = wider levels for volatile markets (CPI, Fed weeks).</p>
              </div>
              <div>
                <span className="text-micro font-bold text-text-secondary">Timeframe</span>
                <p className="text-micro text-text-muted mt-0.5">Active recurrence feed. 5m (default) matches intraday session structure; 1m is more responsive. Each timeframe keeps its own persisted ratchet state — switching never re-initializes the other.</p>
              </div>
              <div>
                <span className="text-micro font-bold text-text-secondary">Avg Mode</span>
                <span className="text-micro text-text-muted ml-1">(default Daily)</span>
                <p className="text-micro text-text-muted mt-0.5">Daily — persistent ratchet avg that carries forward across restarts, keeping levels stable session-to-session. Weekly — anchors MID to last week's closing avg, uses intraday ATR for band spacing.</p>
              </div>
              <div>
                <span className="text-micro font-bold text-text-secondary">Source</span>
                <p className="text-micro text-text-muted mt-0.5">NQ → Polygon futures (active contract). Falls back to Yahoo if Polygon fails. QQQ levels are derived: NQ ÷ ratio.</p>
              </div>
            </div>
            <div className="absolute right-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-default" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted text-sm animate-pulse">
          Calculating Predictive Ranges ({settings.interval})...
        </div>
      ) : !levels ? (
        <div className="text-center py-12 text-text-muted text-sm">
          NQ calculation failed. Check Railway logs — requires POLYGON_API_KEY for futures data.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HeatmapView
              levels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              activeSource="nq"
              activeSymbol={activeSymbol}
            />
            <LevelComparison
              autoLevels={levels}
              currentLevels={currentLevels}
              lastCalculated={autoLevels?.lastCalculated}
              interval={settings.interval}
              onApply={() => handleApply('nq')}
              applying={applying === 'nq'}
              activeSymbol={activeSymbol}
              nqRatio={nqRatio}
            />
          </div>

          <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-text-secondary font-medium">Push to Active Levels</div>
                <div className="text-xs text-text-muted mt-0.5">
                  Applies current {settings.interval} NQ levels to main scoring + triggers rescore
                </div>
              </div>
              <button
                onClick={() => handleApply('nq')}
                disabled={applying === 'nq'}
                className={`px-4 py-2 rounded text-xs font-bold transition-colors ${
                  applying === 'nq'
                    ? 'bg-bg-elevated text-text-tertiary'
                    : 'bg-indigo-700 hover:bg-indigo-600 text-text-primary'
                }`}
              >
                {applying === 'nq' ? '⟳ Applying...' : '↑ Push NQ to Levels'}
              </button>
            </div>
          </div>

          {scoredLevels?.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-text-tertiary uppercase tracking-wider">
                Trade Setups — Classified Levels
              </div>
              {scoredLevels
                .filter(l => l.classification !== 'no_edge')
                .map(l => (
                  <TradeSetupCard
                    key={l.id}
                    level={l}
                    allLevels={scoredLevels}
                    currentPrice={currentPrice}
                    nqRatio={nqRatio}
                    activeSymbol={activeSymbol}
                  />
                ))
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}
