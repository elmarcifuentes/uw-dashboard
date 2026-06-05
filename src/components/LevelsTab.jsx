import { useState, useEffect } from 'react'

const API_URL   = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const LEVEL_IDS = ['R2', 'R1', 'MID', 'S1', 'S2']

const LEVEL_COLORS = {
  R2: 'text-red-400', R1: 'text-orange-400', MID: 'text-yellow-400',
  S1: 'text-blue-400', S2: 'text-indigo-400',
}

const emptyLevels = () => ({
  R2:  { nq: '', qqq: '' }, R1:  { nq: '', qqq: '' },
  MID: { nq: '', qqq: '' }, S1:  { nq: '', qqq: '' },
  S2:  { nq: '', qqq: '' },
})

export default function LevelsTab() {
  const [levels, setLevels]         = useState(emptyLevels())
  const [savedDate, setSavedDate]   = useState(null)
  const [isToday, setIsToday]       = useState(false)
  const [ratio, setRatio]           = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [copied, setCopied]         = useState(false)
  const [history, setHistory]       = useState([])
  const [rescoring, setRescoring]   = useState(false)
  const [rescoreResult, setRescoreResult] = useState(null)
  const [scoringStatus, setScoringStatus] = useState(null)

  const fetchScoringStatus = async () => {
    try {
      const res  = await fetch(`${API_URL}/latest`)
      const data = await res.json()
      if (data?.levels) {
        setScoringStatus({
          timestamp:       data.scored_at || data._received_at,
          price:           data.current_price,
          levels:          data.levels,
          cascade:         data.cascade,
          structure_break: data.structure_break,
        })
      }
    } catch { /* optional — don't break if /latest unavailable */ }
  }

  useEffect(() => {
    fetch(`${API_URL}/levels`)
      .then(r => r.json())
      .then(data => {
        if (data.levels) {
          const l = data.levels
          setLevels({
            R2:  { nq: l.r2_nq  ?? '', qqq: l.r2_qqq  ?? '' },
            R1:  { nq: l.r1_nq  ?? '', qqq: l.r1_qqq  ?? '' },
            MID: { nq: l.mid_nq ?? '', qqq: l.mid_qqq ?? '' },
            S1:  { nq: l.s1_nq  ?? '', qqq: l.s1_qqq  ?? '' },
            S2:  { nq: l.s2_nq  ?? '', qqq: l.s2_qqq  ?? '' },
          })
          setRatio(l.nq_ratio)
          setSavedDate(l.date)
          setIsToday(data.is_today)
        }
      })
      .catch(() => {})

    fetch(`${API_URL}/levels/history`)
      .then(r => r.json())
      .then(data => setHistory(data.levels || []))
      .catch(() => {})

    fetchScoringStatus()
  }, [])

  // Auto-compute ratio from entered values
  useEffect(() => {
    const pairs = LEVEL_IDS
      .map(id => [parseFloat(levels[id].nq), parseFloat(levels[id].qqq)])
      .filter(([nq, qqq]) => nq > 0 && qqq > 0)
    if (pairs.length > 0) {
      const avg = pairs.reduce((s, [nq, qqq]) => s + nq / qqq, 0) / pairs.length
      setRatio(avg)
    }
  }, [levels])

  const updateLevel = (id, field, value) =>
    setLevels(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const handleSubmit = async () => {
    setSaving(true); setSaveResult(null)
    try {
      const body = {
        r2_nq:  parseFloat(levels.R2.nq)  || null, r2_qqq:  parseFloat(levels.R2.qqq)  || null,
        r1_nq:  parseFloat(levels.R1.nq)  || null, r1_qqq:  parseFloat(levels.R1.qqq)  || null,
        mid_nq: parseFloat(levels.MID.nq) || null, mid_qqq: parseFloat(levels.MID.qqq) || null,
        s1_nq:  parseFloat(levels.S1.nq)  || null, s1_qqq:  parseFloat(levels.S1.qqq)  || null,
        s2_nq:  parseFloat(levels.S2.nq)  || null, s2_qqq:  parseFloat(levels.S2.qqq)  || null,
      }
      const res  = await fetch(`${API_URL}/levels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setSaveResult('success'); setIsToday(true)
        setSavedDate(data.date); setRatio(data.nq_ratio)
      } else { setSaveResult('error') }
    } catch { setSaveResult('error') }
    finally {
      setSaving(false)
      setTimeout(() => setSaveResult(null), 3000)
    }
  }

  const copyForTradingView = async () => {
    try {
      const res  = await fetch(`${API_URL}/levels/json`)
      const data = await res.json()
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }

  const allValid = LEVEL_IDS.every(id => levels[id].nq && levels[id].qqq)

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Daily Levels</h2>
          <p className="text-xs text-gray-500 mt-0.5">Enter NQ and QQQ prices for today's session</p>
        </div>
        {savedDate && (
          <div className={`text-xs px-2 py-1 rounded ${isToday ? 'bg-green-900 text-green-400' : 'bg-amber-900 text-amber-400'}`}>
            {isToday ? `✓ Today ${savedDate}` : `Last: ${savedDate}`}
          </div>
        )}
      </div>

      {/* Ratio */}
      {ratio && (
        <div className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">NQ/QQQ Ratio</span>
          <span className="text-xs font-mono text-white font-bold">{ratio.toFixed(4)}</span>
        </div>
      )}

      {/* Entry grid */}
      <div className="bg-gray-800 rounded overflow-hidden border border-gray-700">
        <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800/80">
          <span className="text-xs text-gray-500">Level</span>
          <span className="text-xs text-gray-500 text-center">NQ Price</span>
          <span className="text-xs text-gray-500 text-center">QQQ Price</span>
        </div>
        {LEVEL_IDS.map((id, i) => (
          <div key={id} className={`grid grid-cols-3 gap-2 px-3 py-2 ${i < LEVEL_IDS.length - 1 ? 'border-b border-gray-700' : ''}`}>
            <span className={`text-sm font-bold self-center ${LEVEL_COLORS[id]}`}>{id}</span>
            <input
              type="number" step="0.25" placeholder="e.g. 29995"
              value={levels[id].nq}
              onChange={e => updateLevel(id, 'nq', e.target.value)}
              className="bg-gray-700 text-white text-xs font-mono rounded px-2 py-1.5 text-center border border-gray-600 focus:border-blue-500 focus:outline-none w-full"
            />
            <input
              type="number" step="0.01" placeholder="e.g. 728.79"
              value={levels[id].qqq}
              onChange={e => updateLevel(id, 'qqq', e.target.value)}
              className="bg-gray-700 text-white text-xs font-mono rounded px-2 py-1.5 text-center border border-gray-600 focus:border-blue-500 focus:outline-none w-full"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!allValid || saving}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            allValid && !saving
              ? saveResult === 'success' ? 'bg-green-700 text-white'
              : saveResult === 'error'   ? 'bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {saving ? '⟳ Saving…' : saveResult === 'success' ? '✓ Levels Saved' : saveResult === 'error' ? '✗ Error' : 'Save Levels'}
        </button>
        <button
          onClick={copyForTradingView}
          disabled={!isToday}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${isToday ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
        >
          {copied ? '✓ Copied!' : '📋 Copy JSON'}
        </button>
      </div>

      {!allValid && <p className="text-xs text-gray-500 text-center">Enter all 5 NQ and QQQ prices to save</p>}

      {saveResult === 'success' && ratio && (
        <div className="bg-green-950 border border-green-700 rounded p-2 text-xs text-green-400">
          ✓ Levels saved — ratio {ratio.toFixed(4)} cached — scoring will use these levels
        </div>
      )}

      {/* Force Rescore — only shown after levels saved for today */}
      {isToday && (
        <button
          onClick={async () => {
            setRescoring(true); setRescoreResult(null)
            try {
              const res  = await fetch(`${API_URL}/rescore`, { method: 'POST' })
              const data = await res.json()
              if (data.success) {
                setRescoreResult('success')
                setTimeout(() => fetchScoringStatus(), 3000)
              } else { setRescoreResult('error') }
            } catch { setRescoreResult('error') }
            finally {
              setRescoring(false)
              setTimeout(() => setRescoreResult(null), 3000)
            }
          }}
          disabled={rescoring}
          className={`w-full py-2 rounded text-sm font-medium transition-colors ${
            rescoring          ? 'bg-gray-700 text-gray-400 cursor-wait' :
            rescoreResult === 'success' ? 'bg-green-700 text-white' :
            rescoreResult === 'error'   ? 'bg-red-700 text-white'   :
            'bg-teal-700 hover:bg-teal-600 text-white'
          }`}
        >
          {rescoring ? '⟳ Scoring…' : rescoreResult === 'success' ? '✓ Scored' : rescoreResult === 'error' ? '✗ Failed' : '⟳ Score Now'}
        </button>
      )}

      {/* Scoring status panel */}
      {scoringStatus && (
        <div className="bg-gray-800 rounded border border-gray-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Last Scoring Result</span>
            <span className="text-xs text-gray-500 font-mono">
              {scoringStatus.timestamp
                ? new Date(scoringStatus.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
                  }) + ' ET'
                : '—'}
            </span>
          </div>

          {scoringStatus.price != null && (
            <div className="text-xs text-gray-400">
              QQQ <span className="text-white font-mono">${scoringStatus.price?.toFixed(2)}</span>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1">
            {scoringStatus.levels?.map(level => {
              const id = level.id || level.level_id
              const cls = level.classification
              const color = cls === 'buy_support'     ? 'bg-green-900 text-green-400'
                          : cls === 'sell_resistance' ? 'bg-red-900 text-red-400'
                          : cls === 'continuation'   ? 'bg-blue-900 text-blue-400'
                          :                            'bg-gray-700 text-gray-400'
              const label = cls === 'buy_support' ? 'BUY' : cls === 'sell_resistance' ? 'SELL' : cls === 'continuation' ? 'CONT' : 'EDGE'
              return (
                <div key={id} className={`rounded p-1 text-center ${color}`}>
                  <div className="text-xs font-bold">{id}</div>
                  <div className="text-xs opacity-75">{label}</div>
                  {level.full_stack && <div className="text-yellow-400 text-xs">★</div>}
                </div>
              )
            })}
          </div>

          {scoringStatus.cascade?.active && (
            <div className="text-xs text-red-400 font-bold animate-pulse">⚠ CASCADE ACTIVE</div>
          )}
          {scoringStatus.structure_break?.active && (
            <div className="text-xs text-amber-400">
              ⚠ Structure break {scoringStatus.structure_break.direction?.toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-gray-800 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Recent Sessions</div>
          <div className="space-y-1.5">
            {history.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono">
                <span className="text-gray-500">{row.date}</span>
                <span className="text-gray-400">R2 {row.r2_qqq?.toFixed(2)} → S2 {row.s2_qqq?.toFixed(2)}</span>
                <span className="text-gray-600">×{row.nq_ratio?.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
