import { useState, useEffect } from 'react'
import { calculateTradeSetup } from '../../utils/tradeSetup'
import HeatmapView from './HeatmapView'
import LevelComparison from './LevelComparison'
import TradeSetupCard from './TradeSetupCard'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function LabsDashboard() {
  const [autoLevels, setAutoLevels]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [applying, setApplying]         = useState(null)
  const [activeSource, setActiveSource] = useState('qqq')
  const [currentLevels, setCurrentLevels] = useState(null)
  const [currentPrice, setCurrentPrice]   = useState(null)
  const [nqRatio, setNqRatio]             = useState(41.14)
  const [scoredLevels, setScoredLevels]   = useState(null)

  useEffect(() => {
    fetch(`${API_URL}/labs/auto-levels`)
      .then(r => r.json())
      .then(data => { setAutoLevels(data); setLoading(false) })
      .catch(() => setLoading(false))

    fetch(`${API_URL}/status`)
      .then(r => r.json())
      .then(data => {
        setCurrentPrice(data.lastPrice)
        if (data.nq_ratio) setNqRatio(Number(data.nq_ratio))
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
    setLoading(false)
  }

  const levels = autoLevels?.[activeSource]

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-white uppercase tracking-wide">TradesAlgo Labs</h1>
          <p className="text-xs text-gray-600 mt-0.5">
            Auto level detection · TP/SL engine · Predictive Ranges (200, 6.0)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded">
            🧪 BETA
          </span>
          <button
            onClick={handleRecalculate}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50"
          >
            {loading ? '⟳ Calculating...' : '⟳ Recalculate'}
          </button>
        </div>
      </div>

      {/* Source toggle */}
      <div className="flex gap-2">
        {['qqq', 'nq'].map(src => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
            className={`px-4 py-2 rounded text-xs font-bold uppercase transition-colors ${
              activeSource === src ? 'bg-indigo-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {src === 'qqq' ? 'QQQ Native' : 'NQ Native'}
            {src === 'nq' && !autoLevels?.nq && (
              <span className="ml-1 text-gray-600 font-normal normal-case">(needs Polygon futures)</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-600 text-sm animate-pulse">
          Calculating Predictive Ranges...
        </div>
      ) : !levels ? (
        <div className="text-center py-12 text-gray-600 text-sm">
          {activeSource === 'nq'
            ? 'NQ data requires Polygon.io futures subscription. Add POLYGON_API_KEY to Railway.'
            : 'Level calculation failed. Check Railway logs.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HeatmapView
              levels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              activeSource={activeSource}
            />
            <LevelComparison
              autoLevels={levels}
              currentLevels={currentLevels}
              activeSource={activeSource}
              lastCalculated={autoLevels?.lastCalculated}
              onApply={() => handleApply(activeSource)}
              applying={applying === activeSource}
            />
          </div>

          {scoredLevels?.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider">
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
