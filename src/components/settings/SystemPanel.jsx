import { useState, useEffect, useRef } from 'react'
import { PenLine } from 'lucide-react'
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
    <div className="bg-bg-card border border-border-subtle rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-bg-card2/30">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{title}</span>
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
            <span className={`w-2 h-2 rounded-full shrink-0 ${svc.ok ? 'bg-green-500' : 'bg-bg-card2'}`} />
            <span className={svc.ok ? 'text-text-secondary' : 'text-text-muted'}>{svc.label}</span>
            <span className={`ml-auto text-xs ${svc.ok ? 'text-green-500' : 'text-text-muted'}`}>
              {svc.ok ? 'active' : 'paused'}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-border-subtle pt-3">
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`w-full py-2 rounded text-sm font-medium transition-colors ${
            systemPaused
              ? 'bg-green-700 hover:bg-green-600 text-text-primary disabled:opacity-50'
              : 'bg-amber-800 hover:bg-amber-700 text-text-primary disabled:opacity-50'
          }`}
        >
          {loading ? '...' : systemPaused ? '▶ Resume System' : '⏸ Pause System'}
        </button>
        <div className="text-xs text-text-muted text-center mt-1.5">
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
    <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
      <div>
        <div className="text-xs text-text-secondary font-medium">Auto-Score</div>
        <div className="text-xs text-text-muted">
          {enabled ? 'Rescores automatically on level change' : 'Manual score only'}
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
          enabled ? 'bg-green-800 text-green-300' : 'bg-bg-elevated text-text-tertiary'
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
      <div className="text-xs text-text-muted mb-2">Current levels</div>
      {LEVEL_IDS.map(id => (
        <div key={id} className="flex items-center justify-between text-xs">
          <span className={`font-bold w-8 ${
            id === 'R2' || id === 'R1' ? 'text-red-400' : id === 'MID' ? 'text-blue-400' : 'text-green-400'
          }`}>{id}</span>
          <span className="text-text-primary font-mono">${qqq[id]?.toFixed(2)}</span>
          <span className="text-text-tertiary font-mono">
            NQ {(nq?.[id] != null ? nq[id] : calcNQ(qqq[id], r)).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SystemPanel({ systemPaused, pausedAt, sessionRatio, sessionRatioLockedAt, ratioIsLocked, ratioIsFromToday, nqContract, nqContractExpiry, daysToExpiry }) {
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
  const [ratioInput, setRatioInput]             = useState('')
  const [ratioPreview, setRatioPreview]         = useState(null)
  const [manualNQLevels, setManualNQLevels]     = useState({ R2: '', R1: '', MID: '', S1: '', S2: '' })
  const [manualNQRatioInput, setManualNQRatioInput] = useState('')
  const [manualNQSaving, setManualNQSaving]     = useState(false)

  const calcRatioPreview = (value) => {
    const r = parseFloat(value)
    if (!r || isNaN(r)) return null
    const nq = previewLevels?.nq
    if (!nq) return null
    const cur = sessionRatio || 41.14
    return {
      ratio: r,
      levels:  { R2: (nq.R2/r).toFixed(2), R1: (nq.R1/r).toFixed(2), MID: (nq.MID/r).toFixed(2), S1: (nq.S1/r).toFixed(2), S2: (nq.S2/r).toFixed(2) },
      current: { R2: (nq.R2/cur).toFixed(2), R1: (nq.R1/cur).toFixed(2), MID: (nq.MID/cur).toFixed(2), S1: (nq.S1/cur).toFixed(2), S2: (nq.S2/cur).toFixed(2) },
    }
  }

  const handleSaveManualNQ = async () => {
    const ratio = parseFloat(manualNQRatioInput) || sessionRatio || 41.14
    const payload = {
      R2_nq:  parseFloat(manualNQLevels.R2),  R2_qqq:  parseFloat((manualNQLevels.R2  / ratio).toFixed(2)),
      R1_nq:  parseFloat(manualNQLevels.R1),  R1_qqq:  parseFloat((manualNQLevels.R1  / ratio).toFixed(2)),
      MID_nq: parseFloat(manualNQLevels.MID), MID_qqq: parseFloat((manualNQLevels.MID / ratio).toFixed(2)),
      S1_nq:  parseFloat(manualNQLevels.S1),  S1_qqq:  parseFloat((manualNQLevels.S1  / ratio).toFixed(2)),
      S2_nq:  parseFloat(manualNQLevels.S2),  S2_qqq:  parseFloat((manualNQLevels.S2  / ratio).toFixed(2)),
      ratio, source: 'manual_nq',
    }
    setManualNQSaving(true)
    try {
      await fetch(`${API_URL}/levels/manual-nq`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await handleModeChange('manual')
    } finally {
      setManualNQSaving(false)
    }
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
      .then(data => { if (data?.nq) setPreviewLevels(data) })
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
              <div className="text-text-tertiary">Level</div>
              <div className="text-text-tertiary text-center">Cur NQ</div>
              <div className="text-text-tertiary text-center">Cur QQQ</div>
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
                  <div className="font-bold text-text-secondary">{id}</div>
                  <div className="text-center font-mono text-text-tertiary">{!isNaN(currentNq)  ? currentNq.toFixed(2)        : '—'}</div>
                  <div className="text-center font-mono text-text-secondary">{!isNaN(currentQqq) ? `$${currentQqq.toFixed(2)}` : '—'}</div>
                  <div className={`text-center font-mono ${nqChanged  ? 'text-amber-300 font-bold' : 'text-text-secondary'}`}>
                    {!isNaN(incomingNq)  ? incomingNq.toFixed(2)        : '—'}{nqChanged  ? ' ←' : ''}
                  </div>
                  <div className={`text-center font-mono ${qqqChanged ? 'text-amber-300 font-bold' : 'text-text-secondary'}`}>
                    {!isNaN(incomingQqq) ? `$${incomingQqq.toFixed(2)}` : '—'}{qqqChanged ? ' ←' : ''}
                  </div>
                </div>
              )
            })}
          </div>
          {pending.nq_ratio && (
            <div className="text-xs text-text-tertiary mb-3">Ratio: {parseFloat(pending.nq_ratio).toFixed(3)}</div>
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
                accepting ? 'bg-amber-800 text-amber-400 cursor-wait' : 'bg-amber-600 hover:bg-amber-500 text-text-primary'
              }`}
            >
              {accepting ? '⟳ Accepting…' : '✓ Accept — Update Levels'}
            </button>
            <button
              onClick={async () => {
                await fetch(`${API_URL}/webhook/dismiss`, { method: 'POST' })
                setPending(null)
              }}
              className="px-4 py-1.5 rounded text-sm font-medium bg-bg-elevated hover:bg-bg-card2 text-text-primary"
            >
              ✗ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── LEVEL SOURCE ── */}
      <Section title="Level Source">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-text-tertiary">
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

          {/* Mode buttons — 3-column grid */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleModeChange('auto_nq')}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                levelSourceMode === 'auto_nq'
                  ? 'border-emerald-600 bg-emerald-950/20'
                  : 'border-border-default bg-bg-elevated/30 hover:border-border-strong'
              }`}
            >
              <div className={`text-xs font-bold ${levelSourceMode === 'auto_nq' ? 'text-emerald-400' : 'text-text-secondary'}`}>
                🤖 Auto NQ
              </div>
              <div className="text-xs text-text-muted mt-0.5">NQ native · QQQ derived · ratio locks 9:30</div>
              {levelSourceMode === 'auto_nq' && <span className="text-emerald-500 text-xs">● active</span>}
            </button>

            <button
              onClick={() => handleModeChange('manual_nq')}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                levelSourceMode === 'manual_nq'
                  ? 'border-sky-600 bg-sky-950/20'
                  : 'border-border-default bg-bg-elevated/30 hover:border-border-strong'
              }`}
            >
              <div className={`text-xs font-bold flex items-center gap-1 ${levelSourceMode === 'manual_nq' ? 'text-sky-400' : 'text-text-secondary'}`}>
                <PenLine size={11} /> Manual NQ
              </div>
              <div className="text-xs text-text-muted mt-0.5">Enter NQ · QQQ auto-calculated</div>
              {levelSourceMode === 'manual_nq' && <span className="text-sky-400 text-xs">● active</span>}
            </button>

            <button
              onClick={() => handleModeChange('manual')}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                levelSourceMode === 'manual'
                  ? 'border-gray-500 bg-bg-elevated/50'
                  : 'border-border-default bg-bg-elevated/30 hover:border-border-strong'
              }`}
            >
              <div className={`text-xs font-bold ${levelSourceMode === 'manual' ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                ✏️ Manual
              </div>
              <div className="text-xs text-text-muted mt-0.5">Levels only change when you save</div>
              {levelSourceMode === 'manual' && <span className="text-text-secondary text-xs">● active</span>}
            </button>
          </div>

          {/* Auto NQ expanded panel */}
          {levelSourceMode === 'auto_nq' && (
            <div className="border border-emerald-900/40 bg-emerald-950/10 rounded-lg p-3 space-y-3">
              {!sessionRatio ? (
                <div className="text-xs px-2 py-1.5 rounded bg-bg-card2 text-text-muted">
                  Live ratio — locks automatically at 9:30 AM ET
                </div>
              ) : ratioIsFromToday ? (
                <div className="text-xs px-2 py-1.5 rounded bg-state-holdSoft text-state-hold flex items-center gap-2">
                  <span>🔒</span>
                  <span className="font-bold">{sessionRatio?.toFixed(4)}</span>
                  <span>locked {sessionRatioLockedAt} ET</span>
                </div>
              ) : (
                <div className="text-xs px-2 py-1.5 rounded bg-bg-card2 text-text-tertiary flex items-center gap-2">
                  <span>🔒</span>
                  <span className="font-bold">{sessionRatio?.toFixed(4)}</span>
                  <span>yesterday · updates at 9:30 AM ET</span>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary shrink-0">Override ratio</span>
                  <input
                    type="number"
                    value={ratioInput}
                    placeholder={sessionRatio?.toFixed(4) || '41.1420'}
                    step="0.001"
                    onChange={e => {
                      setRatioInput(e.target.value)
                      setRatioPreview(calcRatioPreview(e.target.value))
                    }}
                    className="bg-bg-elevated text-text-primary font-mono text-xs rounded px-2 py-1 border border-border-default focus:border-emerald-500 focus:outline-none w-28"
                  />
                  {ratioInput && (
                    <button
                      onClick={() => { setRatioInput(''); setRatioPreview(null) }}
                      className="text-xs text-text-disabled hover:text-text-muted leading-none"
                    >✕</button>
                  )}
                </div>

                {ratioPreview && (
                  <div className="bg-bg-elevated border border-accent-ai/30 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-bold text-accent-ai uppercase tracking-wider">
                      Preview · Ratio {ratioPreview.ratio.toFixed(4)}
                    </div>
                    <div className="space-y-1">
                      {['R2','R1','MID','S1','S2'].map(id => {
                        const nv = ratioPreview.levels[id]
                        const cv = ratioPreview.current[id]
                        const d  = (parseFloat(nv) - parseFloat(cv)).toFixed(2)
                        const moved = Math.abs(parseFloat(d)) > 0.01
                        return (
                          <div key={id} className="flex items-center justify-between text-xs">
                            <span className={`font-bold w-8 ${id === 'MID' ? 'text-yellow-400' : id[0] === 'R' ? 'text-red-400' : 'text-blue-400'}`}>{id}</span>
                            <span className="font-mono text-text-primary">${nv}</span>
                            <span className="font-mono text-text-muted w-16 text-right">was ${cv}</span>
                            <span className={`font-mono w-14 text-right ${!moved ? 'text-text-disabled' : parseFloat(d) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {moved ? `${parseFloat(d) > 0 ? '+' : ''}${d}` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border-subtle">
                      <button
                        onClick={async () => {
                          await fetch(`${API_URL}/ratio/lock`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ratio: ratioPreview.ratio })
                          }).catch(() => {})
                          setRatioInput('')
                          setRatioPreview(null)
                        }}
                        className="flex-1 py-1.5 rounded text-xs font-bold bg-state-holdSoft text-state-hold hover:bg-green-700 hover:text-white transition-colors"
                      >
                        ✓ Accept
                      </button>
                      <button
                        onClick={() => { setRatioInput(''); setRatioPreview(null) }}
                        className="flex-1 py-1.5 rounded text-xs font-bold bg-bg-card2 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <AutoScoreToggle enabled={autoScoreEnabled} onToggle={handleAutoScoreToggle} />
              <button
                onClick={handleForceScore}
                disabled={scoring}
                title="Standalone rescore of the levels currently active in the DB — does NOT push new levels. Use it to refresh scores/narratives on demand. (Apply NQ in Labs already scores automatically.)"
                className={`w-full py-1.5 rounded text-xs font-bold transition-colors ${
                  scoring
                    ? 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
                    : 'bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 border border-emerald-800/40'
                }`}
              >
                {scoring ? '⟳ Scoring...' : '▶ Score Now'}
              </button>
              <div className="text-micro text-text-disabled mt-1 leading-snug">
                Rescores the active levels. Applying NQ in Labs already scores — this is a manual refresh.
              </div>
              {nqContract && (
                <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                  <span className="text-micro font-price text-text-tertiary font-bold">{nqContract}</span>
                  {nqContractExpiry && <span className="text-micro text-text-disabled">exp {nqContractExpiry}</span>}
                  {daysToExpiry != null && (
                    <span className={`text-micro px-1.5 py-0.5 rounded font-bold ${daysToExpiry <= 7 ? 'bg-state-exitSoft text-state-exit' : 'bg-bg-card2 text-text-muted'}`}>
                      {daysToExpiry}d
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual NQ expanded panel */}
          {levelSourceMode === 'manual_nq' && (
            <div className="border border-sky-900/40 bg-sky-950/10 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted">Ratio:</span>
                <span className="text-xs font-mono font-bold text-text-primary">
                  {sessionRatio?.toFixed(4) || '41.1420'}
                </span>
                {sessionRatioLockedAt && (
                  <span className="text-xs text-state-hold">🔒 {sessionRatioLockedAt}</span>
                )}
                <input
                  type="number"
                  placeholder="override ratio"
                  step="0.001"
                  value={manualNQRatioInput}
                  onChange={e => setManualNQRatioInput(e.target.value)}
                  className="bg-bg-elevated font-mono text-xs text-text-primary rounded px-2 py-1 border border-border-default focus:border-sky-500 focus:outline-none w-28 ml-auto"
                />
              </div>

              <div className="bg-bg-elevated rounded overflow-hidden border border-border-default">
                <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-border-default bg-bg-elevated/80 text-xs text-text-tertiary">
                  <span>Level</span>
                  <span className="text-center">NQ price</span>
                  <span className="text-right">QQQ equiv</span>
                </div>
                {LEVEL_IDS.map((id, i) => {
                  const activeRatio = parseFloat(manualNQRatioInput) || sessionRatio || 41.14
                  const nqVal = parseFloat(manualNQLevels[id])
                  const qqqVal = nqVal > 0 ? (nqVal / activeRatio).toFixed(2) : null
                  return (
                    <div key={id} className={`grid grid-cols-3 gap-2 px-3 py-2 items-center ${i < LEVEL_IDS.length - 1 ? 'border-b border-border-default' : ''}`}>
                      <span className={`text-sm font-bold ${LEVEL_COLORS[id]}`}>{id}</span>
                      <input
                        type="number"
                        step="0.25"
                        placeholder={`NQ ${id}`}
                        value={manualNQLevels[id]}
                        onChange={e => setManualNQLevels(prev => ({ ...prev, [id]: e.target.value }))}
                        className="bg-bg-elevated text-text-primary text-xs font-mono rounded px-2 py-1.5 text-center border border-border-strong focus:border-sky-500 focus:outline-none w-full"
                      />
                      <span className="text-xs font-mono text-text-tertiary text-right">
                        {qqqVal ? `$${qqqVal}` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={handleSaveManualNQ}
                disabled={manualNQSaving || !LEVEL_IDS.every(id => parseFloat(manualNQLevels[id]) > 0)}
                className={`w-full py-2 rounded text-xs font-bold transition-colors ${
                  manualNQSaving || !LEVEL_IDS.every(id => parseFloat(manualNQLevels[id]) > 0)
                    ? 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
                    : 'bg-sky-900 hover:bg-sky-700 text-sky-300 hover:text-white'
                }`}
              >
                {manualNQSaving ? '⟳ Saving…' : '💾 Save NQ Levels'}
              </button>
            </div>
          )}

          {/* Manual expanded panel */}
          {levelSourceMode === 'manual' && (
            <div className="border border-border-default/40 bg-bg-elevated/20 rounded-lg p-3 space-y-3">
              <div className="text-xs text-text-tertiary">Enter levels manually. Save to apply and begin scoring.</div>
              <div className="bg-bg-elevated rounded overflow-hidden border border-border-default">
                <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-border-default bg-bg-elevated/80">
                  <span className="text-xs text-text-tertiary">Level</span>
                  <span className="text-xs text-text-tertiary text-center">NQ Price</span>
                  <span className="text-xs text-text-tertiary text-center">QQQ Price</span>
                </div>
                {LEVEL_IDS.map((id, i) => (
                  <div key={id} className={`grid grid-cols-3 gap-2 px-3 py-2 ${i < LEVEL_IDS.length - 1 ? 'border-b border-border-default' : ''}`}>
                    <span className={`text-sm font-bold self-center ${LEVEL_COLORS[id]}`}>{id}</span>
                    <input
                      type="number" step="0.25" placeholder="e.g. 29995"
                      value={levels[id].nq}
                      onChange={e => updateLevel(id, 'nq', e.target.value)}
                      className="bg-bg-elevated text-text-primary text-xs font-mono rounded px-2 py-1.5 text-center border border-border-strong focus:border-blue-500 focus:outline-none w-full"
                    />
                    <input
                      type="number" step="0.01" placeholder="e.g. 728.79"
                      value={levels[id].qqq}
                      onChange={e => updateLevel(id, 'qqq', e.target.value)}
                      className="bg-bg-elevated text-text-primary text-xs font-mono rounded px-2 py-1.5 text-center border border-border-strong focus:border-blue-500 focus:outline-none w-full"
                    />
                  </div>
                ))}
              </div>
              {!allValid && <p className="text-xs text-text-muted">Enter all 5 NQ and QQQ prices to save</p>}
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
                    ? 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
                    : saveResult === 'success' ? 'bg-green-700 text-text-primary'
                    : saveResult === 'error'   ? 'bg-red-700 text-text-primary'
                    : 'bg-bg-card2 hover:bg-gray-500 text-text-primary'
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
        {nqContract && (
          <div className="flex items-center gap-1.5 mt-3 text-micro text-text-disabled">
            <span>Active contract:</span>
            <span className="font-price text-text-tertiary">{nqContract}</span>
            {nqContractExpiry && <><span>·</span><span>exp {nqContractExpiry}</span></>}
            {daysToExpiry <= 7 && daysToExpiry != null && (
              <span className="text-state-exit font-bold ml-1">⚠ rollover soon</span>
            )}
          </div>
        )}
      </Section>

      {/* ── SAVED LEVELS ── */}
      {(ratio || isToday || history.length > 0) && (
        <Section title="Saved Levels">
          {ratio && (
            <div className="bg-bg-elevated rounded px-3 py-2 flex items-center justify-between mb-3 gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">NQ/QQQ Ratio</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-primary font-bold">
                  {(ratioIsLocked ? sessionRatio : ratio)?.toFixed(4)}
                </span>
                {!sessionRatio ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card2 text-text-muted">
                    Live · locks 9:30 ET
                  </span>
                ) : ratioIsFromToday ? (
                  <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-state-holdSoft text-state-hold">
                    🔒 {sessionRatioLockedAt} ET
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card2 text-text-tertiary">
                    🔒 {sessionRatio?.toFixed(4)} · yesterday · updates 9:30 ET
                  </span>
                )}
              </div>
            </div>
          )}
          {isToday && (
            <button
              onClick={copyForTradingView}
              className="w-full py-2 rounded text-sm font-medium bg-bg-elevated hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors mb-3"
            >
              {copied ? '✓ Copied!' : '📋 Copy JSON for TradingView'}
            </button>
          )}
          {history.length > 0 && (
            <div className="bg-bg-elevated rounded border border-border-default p-3">
              <div className="text-xs text-text-secondary uppercase tracking-wide mb-2">Recent Sessions</div>
              <div className="space-y-1.5">
                {history.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-text-tertiary">{row.date}</span>
                    <span className="text-text-secondary">R2 {row.r2_qqq?.toFixed(2)} → S2 {row.s2_qqq?.toFixed(2)}</span>
                    <span className="text-text-muted">×{row.nq_ratio?.toFixed(3)}</span>
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
