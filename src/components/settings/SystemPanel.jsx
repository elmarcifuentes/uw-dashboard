import { useState, useEffect, useRef } from 'react'
import Controls from '../intraday/Controls'
import AlertBadge from '../AlertBadge'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const LEVEL_IDS = ['R2', 'R1', 'MID', 'S1', 'S2']

const calcNQ = (qqqPrice, ratio, offset = 0) => Math.round(qqqPrice * ratio * 4) / 4 + offset

const LEVEL_COLORS = {
  R2: 'text-red-400', R1: 'text-orange-400', MID: 'text-yellow-400',
  S1: 'text-blue-400', S2: 'text-indigo-400',
}

const emptyLevels = () => ({
  R2: { nq: '', qqq: '' }, R1: { nq: '', qqq: '' },
  MID: { nq: '', qqq: '' }, S1: { nq: '', qqq: '' },
  S2: { nq: '', qqq: '' },
})

function Section({ title, children }) {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900/30">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

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
    { label: 'SSE Stream',    ok: true },
    { label: 'UW Polling',    ok: !systemPaused },
    { label: 'Auto-rescore',  ok: !systemPaused },
    { label: 'Price updates', ok: !systemPaused },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {systemPaused && pausedAt && (
            <div className="text-xs text-amber-400/70">Paused since {formatTime(pausedAt)} ET</div>
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

function AutoScoreToggle({ enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
      <div>
        <div className="text-xs text-gray-400 font-medium">Auto-Score</div>
        <div className="text-xs text-gray-600">
          {enabled ? 'Rescores automatically on level change' : 'Manual score only'}
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
          enabled ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-500'
        }`}
      >
        {enabled ? '● Auto-Score ON' : '○ Auto-Score OFF'}
      </button>
    </div>
  )
}

function LevelPreviewTable({ qqq, nq, ratio }) {
  if (!qqq) return null
  const r = ratio || 41.14
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-600 mb-2">Current levels</div>
      {LEVEL_IDS.map(id => (
        <div key={id} className="flex items-center justify-between text-xs">
          <span className={`font-bold w-8 ${
            id === 'R2' || id === 'R1' ? 'text-red-400' : id === 'MID' ? 'text-blue-400' : 'text-green-400'
          }`}>{id}</span>
          <span className="text-white font-mono">${qqq[id]?.toFixed(2)}</span>
          <span className="text-gray-500 font-mono">
            NQ {(nq?.[id] != null ? nq[id] : calcNQ(qqq[id], r)).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SystemPanel({ systemPaused, pausedAt }) {
  const [levels, setLevels]         = useState(emptyLevels())
  const [savedDate, setSavedDate]   = useState(null)
  const [isToday, setIsToday]       = useState(false)
  const [ratio, setRatio]           = useState(null)
  const [copied, setCopied]         = useState(false)
  const [history, setHistory]       = useState([])
  const [saving, setSaving]         = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [pending, setPending]       = useState(null)
  const [accepting, setAccepting]   = useState(false)
  const pendingPollRef              = useRef(null)

  const [levelSourceMode, setLevelSourceMode]   = useState('auto')
  const [nqOffsets, setNqOffsets]               = useState({ ratio: null, R2: 0, R1: 0, MID: 0, S1: 0, S2: 0 })
  const [showOffsets, setShowOffsets]           = useState(false)
  const [autoScoreEnabled, setAutoScoreEnabled] = useState(true)
  const [previewLevels, setPreviewLevels]       = useState(null)
  const [calculating, setCalculating]           = useState(false)
  const [scoring, setScoring]                   = useState(false)
  const [nqPreview, setNqPreview]               = useState(null)

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

    fetch(`${API_URL}/status`)
      .then(r => r.json())
      .then(data => {
        if (data.levelSourceMode)                setLevelSourceMode(data.levelSourceMode)
        if (data.nqOffsets)                      setNqOffsets(data.nqOffsets)
        if (data.autoScoreEnabled !== undefined) setAutoScoreEnabled(data.autoScoreEnabled)
      })
      .catch(() => {})

    fetch(`${API_URL}/labs/auto-levels`)
      .then(r => r.json())
      .then(data => { if (data?.qqq) setPreviewLevels(data) })
      .catch(() => {})

    fetch(`${API_URL}/levels/history`)
      .then(r => r.json())
      .then(data => setHistory(data.levels || []))
      .catch(() => {})

    const pollPending = () => {
      fetch(`${API_URL}/webhook/pending`)
        .then(r => r.json())
        .then(data => setPending(data.pending || null))
        .catch(() => {})
    }
    pollPending()
    pendingPollRef.current = setInterval(pollPending, 15_000)
    return () => clearInterval(pendingPollRef.current)
  }, [])

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

  const reloadLevels = async () => {
    const data = await fetch(`${API_URL}/levels`).then(r => r.json())
    if (data.levels) {
      const l = data.levels
      setLevels({
        R2:  { nq: l.r2_nq  ?? '', qqq: l.r2_qqq  ?? '' },
        R1:  { nq: l.r1_nq  ?? '', qqq: l.r1_qqq  ?? '' },
        MID: { nq: l.mid_nq ?? '', qqq: l.mid_qqq ?? '' },
        S1:  { nq: l.s1_nq  ?? '', qqq: l.s1_qqq  ?? '' },
        S2:  { nq: l.s2_nq  ?? '', qqq: l.s2_qqq  ?? '' },
      })
      if (l.nq_ratio) setRatio(l.nq_ratio)
      setIsToday(data.is_today)
      setSavedDate(l.date)
    }
  }

  const handleModeChange = async (mode) => {
    setLevelSourceMode(mode)
    try {
      await fetch(`${API_URL}/levels/source-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (mode !== 'manual') await reloadLevels()
    } catch (e) { console.warn('[levels] mode change failed:', e.message) }
  }

  const handleAutoScoreToggle = async () => {
    const next = !autoScoreEnabled
    setAutoScoreEnabled(next)
    await fetch(`${API_URL}/scoring/auto-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {})
  }

  const handleForceScore = async () => {
    setScoring(true)
    await fetch(`${API_URL}/rescore`, { method: 'POST' }).catch(() => {})
    setTimeout(() => setScoring(false), 3000)
  }

  const handleRecalculate = async () => {
    setCalculating(true)
    try {
      const res  = await fetch(`${API_URL}/labs/recalculate`, { method: 'POST' })
      const data = await res.json()
      if (data.levels) setPreviewLevels(data.levels)
      await reloadLevels()
    } catch (e) { console.warn('[levels] recalculate failed:', e.message) }
    finally { setCalculating(false) }
  }

  const handleCalculateNQ = () => {
    if (!previewLevels?.qqq) return
    const r = parseFloat(nqOffsets.ratio) || ratio || 41.14
    const preview = {}
    LEVEL_IDS.forEach(id => {
      preview[id] = {
        qqq: previewLevels.qqq[id],
        nq:  calcNQ(previewLevels.qqq[id], r, nqOffsets[id] || 0),
      }
    })
    setNqPreview(preview)
  }

  const handleAutoQqqSave = async () => {
    if (!nqPreview) return
    setScoring(true)
    try {
      const r = parseFloat(nqOffsets.ratio) || ratio || 41.14
      const body = {
        r2_qqq:  nqPreview.R2.qqq,  r2_nq:  nqPreview.R2.nq,
        r1_qqq:  nqPreview.R1.qqq,  r1_nq:  nqPreview.R1.nq,
        mid_qqq: nqPreview.MID.qqq, mid_nq: nqPreview.MID.nq,
        s1_qqq:  nqPreview.S1.qqq,  s1_nq:  nqPreview.S1.nq,
        s2_qqq:  nqPreview.S2.qqq,  s2_nq:  nqPreview.S2.nq,
        nq_ratio: r,
      }
      const res = await fetch(`${API_URL}/levels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setIsToday(true); setSavedDate(data.date); setRatio(data.nq_ratio || r)
        await fetch(`${API_URL}/rescore`, { method: 'POST' }).catch(() => {})
      }
    } catch (e) { console.warn('[levels] auto_qqq save failed:', e.message) }
    setTimeout(() => setScoring(false), 3000)
  }

  const handleManualSave = async () => {
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
        setScoring(true)
        await fetch(`${API_URL}/rescore`, { method: 'POST' }).catch(() => {})
        setTimeout(() => { setScoring(false); setSaveResult(null) }, 3000)
      } else { setSaveResult('error') }
    } catch { setSaveResult('error') }
    finally { setSaving(false) }
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
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* ── SYSTEM STATUS ── */}
      <Section title="System Status">
        <SystemStatus systemPaused={systemPaused} pausedAt={pausedAt} />
      </Section>

      {/* ── PENDING WEBHOOK BANNER ── */}
      {pending && (
        <div className="border border-amber-700/60 rounded-lg bg-amber-950/20 p-3 space-y-3">
          <AlertBadge
            type="watch"
            label="📡 New levels from TradingView"
            detail={`Received ${new Date(pending.received_at + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET — review and accept to update scoring`}
          />
          <div className="mb-3 text-xs space-y-0.5">
            <div className="grid grid-cols-5 gap-1 mb-1">
              <div className="text-gray-500">Level</div>
              <div className="text-gray-500 text-center">Cur NQ</div>
              <div className="text-gray-500 text-center">Cur QQQ</div>
              <div className="text-amber-400 text-center">New NQ</div>
              <div className="text-amber-400 text-center">New QQQ</div>
            </div>
            {['R2','R1','MID','S1','S2'].map(id => {
              const key        = id.toLowerCase()
              const currentNq  = parseFloat(levels[id]?.nq)
              const currentQqq = parseFloat(levels[id]?.qqq)
              const incomingNq  = parseFloat(pending[`${key}_nq`])
              const incomingQqq = parseFloat(pending[`${key}_qqq`])
              const nqChanged  = !isNaN(currentNq)  && !isNaN(incomingNq)  && Math.abs(currentNq  - incomingNq)  > 0.25
              const qqqChanged = !isNaN(currentQqq) && !isNaN(incomingQqq) && Math.abs(currentQqq - incomingQqq) > 0.01
              const anyChanged = nqChanged || qqqChanged
              return (
                <div key={id} className={`grid grid-cols-5 gap-1 py-0.5 ${anyChanged ? 'bg-amber-950 rounded px-1' : ''}`}>
                  <div className="font-bold text-gray-300">{id}</div>
                  <div className="text-center font-mono text-gray-500">{!isNaN(currentNq)  ? currentNq.toFixed(2)        : '—'}</div>
                  <div className="text-center font-mono text-gray-400">{!isNaN(currentQqq) ? `$${currentQqq.toFixed(2)}` : '—'}</div>
                  <div className={`text-center font-mono ${nqChanged  ? 'text-amber-300 font-bold' : 'text-gray-400'}`}>
                    {!isNaN(incomingNq)  ? incomingNq.toFixed(2)        : '—'}{nqChanged  ? ' ←' : ''}
                  </div>
                  <div className={`text-center font-mono ${qqqChanged ? 'text-amber-300 font-bold' : 'text-gray-400'}`}>
                    {!isNaN(incomingQqq) ? `$${incomingQqq.toFixed(2)}` : '—'}{qqqChanged ? ' ←' : ''}
                  </div>
                </div>
              )
            })}
          </div>
          {pending.nq_ratio && (
            <div className="text-xs text-gray-500 mb-3">Ratio: {parseFloat(pending.nq_ratio).toFixed(3)}</div>
          )}
          <div className="flex gap-2">
            <button
              disabled={accepting}
              onClick={async () => {
                setAccepting(true)
                try {
                  const res  = await fetch(`${API_URL}/webhook/accept`, { method: 'POST' })
                  const data = await res.json()
                  if (data.success) { setPending(null); await reloadLevels() }
                } catch {}
                finally { setAccepting(false) }
              }}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                accepting ? 'bg-amber-800 text-amber-400 cursor-wait' : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {accepting ? '⟳ Accepting…' : '✓ Accept — Update Levels'}
            </button>
            <button
              onClick={async () => {
                await fetch(`${API_URL}/webhook/dismiss`, { method: 'POST' })
                setPending(null)
              }}
              className="px-4 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white"
            >
              ✗ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── LEVEL SOURCE ── */}
      <Section title="Level Source">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">
            {levelSourceMode === 'manual'
              ? 'Manual entry — levels only change when you save'
              : 'Auto-detecting from Predictive Ranges'}
          </p>
          {savedDate && (
            <div className={`text-xs px-2 py-1 rounded shrink-0 ml-3 ${isToday ? 'bg-green-900 text-green-400' : 'bg-amber-900 text-amber-400'}`}>
              {isToday ? `✓ Today ${savedDate}` : `Last: ${savedDate}`}
            </div>
          )}
        </div>

        <div className="space-y-2">

          {/* Mode 1 — Full Auto */}
          <button
            onClick={() => handleModeChange('auto')}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              levelSourceMode === 'auto'
                ? 'border-indigo-600 bg-indigo-950/30'
                : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-bold ${levelSourceMode === 'auto' ? 'text-indigo-400' : 'text-gray-400'}`}>
                  🤖 Auto — QQQ + NQ
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Both auto-calculated · updates automatically on bar close</div>
              </div>
              {levelSourceMode === 'auto' && <span className="text-indigo-500 text-xs shrink-0 ml-2">● active</span>}
            </div>
          </button>

          {levelSourceMode === 'auto' && (
            <div className="border border-indigo-900/40 bg-indigo-950/10 rounded-lg p-3 ml-2 space-y-3">
              <button
                onClick={handleRecalculate}
                disabled={calculating}
                className={`w-full py-2 rounded text-xs font-bold transition-colors ${
                  calculating ? 'bg-gray-700 text-gray-500' : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                }`}
              >
                {calculating ? '⟳ Calculating...' : '⟳ Recalculate Levels'}
              </button>
              <LevelPreviewTable qqq={previewLevels?.qqq} nq={previewLevels?.nq} ratio={ratio} />
              <button
                onClick={handleForceScore}
                disabled={scoring}
                className={`w-full py-2 rounded text-xs font-bold transition-colors ${
                  scoring ? 'bg-gray-700 text-gray-500' : 'bg-green-800 hover:bg-green-700 text-white'
                }`}
              >
                {scoring ? '⟳ Scoring...' : '⚡ Score Now'}
              </button>
              <AutoScoreToggle enabled={autoScoreEnabled} onToggle={handleAutoScoreToggle} />
              {previewLevels?.lastCalculated && (
                <div className="text-xs text-gray-700">
                  Last calculated:{' '}
                  {new Date(previewLevels.lastCalculated).toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit'
                  })} ET · {previewLevels.interval} bars · {previewLevels.qqq?.source}
                </div>
              )}
            </div>
          )}

          {/* Mode 2 — Auto QQQ + derived NQ */}
          <button
            onClick={() => handleModeChange('auto_qqq')}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              levelSourceMode === 'auto_qqq'
                ? 'border-blue-600 bg-blue-950/20'
                : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-bold ${levelSourceMode === 'auto_qqq' ? 'text-blue-400' : 'text-gray-400'}`}>
                  🤖 Auto QQQ · Manual NQ
                </div>
                <div className="text-xs text-gray-600 mt-0.5">QQQ auto-updates · NQ = QQQ × ratio with optional offset per level</div>
              </div>
              {levelSourceMode === 'auto_qqq' && <span className="text-blue-500 text-xs shrink-0 ml-2">● active</span>}
            </div>
          </button>

          {levelSourceMode === 'auto_qqq' && (
            <div className="border border-blue-900/40 bg-blue-950/10 rounded-lg p-3 ml-2 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 w-20 shrink-0">NQ Ratio</span>
                <input
                  type="number"
                  value={nqOffsets.ratio || ''}
                  onChange={e => setNqOffsets(prev => ({ ...prev, ratio: e.target.value || null }))}
                  placeholder={`${ratio?.toFixed(3) || '41.142'} (live)`}
                  step="0.001"
                  className="bg-gray-700 text-white font-mono text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none w-28"
                />
                <span className="text-xs text-gray-600">blank = use live ratio</span>
              </div>
              <button onClick={() => setShowOffsets(v => !v)} className="text-xs text-gray-600 hover:text-gray-400">
                {showOffsets ? '▲ hide offsets' : '▼ per-level NQ offsets (optional)'}
              </button>
              {showOffsets && (
                <div className="space-y-1.5 pl-2">
                  {LEVEL_IDS.map(id => (
                    <div key={id} className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-8 shrink-0 ${
                        id === 'R2' || id === 'R1' ? 'text-red-400' : id === 'MID' ? 'text-blue-400' : 'text-green-400'
                      }`}>{id}</span>
                      <input
                        type="number"
                        value={nqOffsets[id] || 0}
                        onChange={e => setNqOffsets(prev => ({ ...prev, [id]: parseInt(e.target.value) || 0 }))}
                        step="1"
                        className="bg-gray-700 text-white font-mono text-xs rounded px-2 py-1 border border-gray-600 w-20 text-center"
                      />
                      <span className="text-xs text-gray-700">NQ pts</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleCalculateNQ}
                className="w-full py-2 rounded text-xs font-bold bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 transition-colors"
              >
                ⟳ Calculate NQ Preview
              </button>
              {nqPreview && (
                <div className="border border-blue-900/30 rounded p-2 space-y-1">
                  <div className="text-xs text-gray-600 mb-1">Preview — review before saving</div>
                  {LEVEL_IDS.map(id => (
                    <div key={id} className="flex justify-between text-xs">
                      <span className={`font-bold w-8 ${
                        id === 'R2' || id === 'R1' ? 'text-red-400' : id === 'MID' ? 'text-blue-400' : 'text-green-400'
                      }`}>{id}</span>
                      <span className="text-white font-mono">${nqPreview[id]?.qqq?.toFixed(2)}</span>
                      <span className="text-blue-300 font-mono">NQ {nqPreview[id]?.nq?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleAutoQqqSave}
                disabled={scoring || !nqPreview}
                className={`w-full py-2 rounded text-xs font-bold transition-colors ${
                  scoring || !nqPreview
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-800 hover:bg-green-700 text-white'
                }`}
              >
                {scoring ? '⟳ Scoring...' : nqPreview ? '✓ Save + Score Now' : 'Calculate first to enable save'}
              </button>
              <AutoScoreToggle enabled={autoScoreEnabled} onToggle={handleAutoScoreToggle} />
            </div>
          )}

          {/* Mode 3 — Full Manual */}
          <button
            onClick={() => handleModeChange('manual')}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              levelSourceMode === 'manual'
                ? 'border-gray-500 bg-gray-800/50'
                : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-bold ${levelSourceMode === 'manual' ? 'text-gray-300' : 'text-gray-500'}`}>
                  ✏️ Manual — QQQ + NQ
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Levels only change when you save manually or accept webhook</div>
              </div>
              {levelSourceMode === 'manual' && <span className="text-gray-400 text-xs shrink-0 ml-2">● active</span>}
            </div>
          </button>

          {levelSourceMode === 'manual' && (
            <div className="border border-gray-700/40 bg-gray-800/20 rounded-lg p-3 ml-2 space-y-3">
              <div className="text-xs text-gray-500">Enter levels manually. Save to apply and begin scoring.</div>
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
              {!allValid && <p className="text-xs text-gray-600">Enter all 5 NQ and QQQ prices to save</p>}
              {saveResult === 'success' && ratio && (
                <div className="bg-green-950 border border-green-700 rounded p-2 text-xs text-green-400">
                  ✓ Levels saved — ratio {ratio.toFixed(4)} — scoring triggered
                </div>
              )}
              <button
                onClick={handleManualSave}
                disabled={saving || scoring || !allValid}
                className={`w-full py-2 rounded text-xs font-bold transition-colors ${
                  saving || scoring || !allValid
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : saveResult === 'success' ? 'bg-green-700 text-white'
                    : saveResult === 'error'   ? 'bg-red-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                {saving ? '⟳ Saving…' : scoring ? '⟳ Scoring...'
                  : saveResult === 'success' ? '✓ Saved + Scored'
                  : saveResult === 'error'   ? '✗ Error'
                  : '💾 Save + Score Now'}
              </button>
              <AutoScoreToggle enabled={autoScoreEnabled} onToggle={handleAutoScoreToggle} />
            </div>
          )}
        </div>
      </Section>

      {/* ── SAVED LEVELS ── */}
      {(ratio || isToday || history.length > 0) && (
        <Section title="Saved Levels">
          {ratio && (
            <div className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">NQ/QQQ Ratio</span>
              <span className="text-xs font-mono text-white font-bold">{ratio.toFixed(4)}</span>
            </div>
          )}
          {isToday && (
            <button
              onClick={copyForTradingView}
              className="w-full py-2 rounded text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors mb-3"
            >
              {copied ? '✓ Copied!' : '📋 Copy JSON for TradingView'}
            </button>
          )}
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
        </Section>
      )}

      {/* ── CONTROLS ── */}
      <Section title="Controls">
        <Controls compact={false} />
      </Section>

    </div>
  )
}
