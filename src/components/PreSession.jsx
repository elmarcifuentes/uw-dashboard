import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import LevelCard from './LevelCard'
import EarningsWarning from './EarningsWarning'
import EconomicCalendar from './EconomicCalendar'
import SectorETF from './SectorETF'
import TopNetImpact from './TopNetImpact'
import GexByExpiry from './GexByExpiry'
import ZeroDteFlow from './ZeroDteFlow'
import GreekFlow from './GreekFlow'
import SignalStrengthBar from './SignalStrengthBar'
import CollapsibleSection from './CollapsibleSection'
import MarketStateCard from './pre/MarketStateCard'
import SessionHeaderCard from './pre/SessionHeaderCard'
import AlertsCard from './pre/AlertsCard'
import ScenarioCards from './pre/ScenarioCards'
import ThesisBar from './pre/ThesisBar'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STATUS_POLL_MS = 10_000
const BUDGET_POLL_MS = 60_000

function msToLabel(ms) {
  if (!ms) return '—'
  if (ms >= 60000) return `${ms / 1000 / 60}m`
  return `${ms / 1000}s`
}

const ETF_DESCRIPTION = {
  bullish:  'Institutions buying calls — bullish session tone. Confirms long setups.',
  bearish:  'Institutions selling calls or buying puts — bearish tone. Fades long setups.',
  neutral:  'Mixed flow — no strong directional bias from ETF tide.',
  'no data': 'No ETF tide data available for this session.',
}

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

function GexCageSummary({ levels }) {
  if (!levels?.length) return null
  const withGex = levels.filter(l => l.gex?.net_gex !== undefined)
  if (!withGex.length) return null

  const maxAbs = Math.max(...withGex.map(l => Math.abs(l.gex.net_gex)))
  const peak = withGex.reduce((a, b) => Math.abs(a.gex.net_gex) > Math.abs(b.gex.net_gex) ? a : b)
  const hasExpansion = withGex.some(l => l.gex.net_gex < 0)

  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">GEX Cage</span>
        {hasExpansion && <span className="text-xs text-orange-400 font-medium">⚡ EXPANSION</span>}
      </div>
      <div className="space-y-1.5">
        {withGex.map(l => {
          const pct     = maxAbs > 0 ? Math.abs(l.gex.net_gex) / maxAbs * 100 : 0
          const pinning = l.gex.net_gex >= 0
          const isPeak  = l.id === peak.id
          return (
            <div key={l.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8">{l.id}</span>
              <div className="flex-1 relative h-[8px] bg-gray-800 rounded overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded ${pinning ? 'bg-blue-500' : 'bg-orange-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {isPeak && <span className="text-xs text-blue-300 font-medium whitespace-nowrap">MECH CTR</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PreSession({ assistantRead }) {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [lastPolled, setLastPolled] = useState(null)
  const [providerStatus, setProviderStatus] = useState(null)
  const [budget, setBudget]         = useState(null)
  const [mode, setMode]             = useState('REST')
  const [magnetStreak, setMagnetStreak]     = useState(null)
  const [lastRescoreAt, setLastRescoreAt]   = useState(null)
  const [levelNarratives, setLevelNarratives] = useState({})
  const [sessionBrief, setSessionBrief]       = useState(null)
  const [levelTouches, setLevelTouches]       = useState({})
  const [briefOpen, setBriefOpen]             = useState(true)

  const fetchLatest = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/latest`)
      setData(res.data)
      setError(null)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('no-data')
      } else {
        setError('fetch-error')
      }
      setData(null)
    } finally {
      setLoading(false)
      setLastPolled(new Date())
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/status`)
      setProviderStatus(res.data)
      setMode(res.data.activeMode || 'REST')
    } catch { /* status endpoint optional */ }
  }, [])

  const fetchBudget = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/budget`)
      setBudget(res.data)
    } catch { /* budget endpoint optional */ }
  }, [])

  const toggleMode = useCallback(async () => {
    const useWebSocket = mode === 'REST'
    try {
      await axios.post(`${API}/mode`, { useWebSocket })
      setMode(useWebSocket ? 'WebSocket' : 'REST')
    } catch (err) {
      console.warn('[mode toggle]', err.message)
    }
  }, [mode])

  useEffect(() => {
    fetchLatest()
  }, [fetchLatest])

  useEffect(() => {
    fetchStatus()
    const t2 = setInterval(fetchStatus, STATUS_POLL_MS)
    return () => clearInterval(t2)
  }, [fetchStatus])

  useEffect(() => {
    fetchBudget()
    const t3 = setInterval(fetchBudget, BUDGET_POLL_MS)
    return () => clearInterval(t3)
  }, [fetchBudget])

  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(sessions => {
        if (Array.isArray(sessions) && sessions.length > 0) {
          setMagnetStreak(sessions[0].magnet_streak ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API}/level-narratives`)
      .then(r => r.json())
      .then(d => { if (d?.narratives && Object.keys(d.narratives).length > 0) setLevelNarratives(d.narratives) })
      .catch(() => {})
    fetch(`${API}/session-brief`)
      .then(r => r.json())
      .then(d => { if (d?.session) setSessionBrief(d.session) })
      .catch(() => {})
    fetch(`${API}/level-touches`)
      .then(r => r.json())
      .then(d => { if (d?.touches) setLevelTouches(d.touches) })
      .catch(() => {})
    const es = new EventSource(`${API}/stream`)
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'rescore') { setLastRescoreAt(new Date().toISOString()); fetchLatest() }
        if (d.type === 'level_narratives_update') setLevelNarratives(d.narratives || {})
        if (d.type === 'session_brief_update' && d.session) setSessionBrief(d.session)
      } catch {}
    }
    return () => es.close()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  if (error === 'no-data') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 text-sm">
        <span className="text-2xl">—</span>
        <p>No data — run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">npm start</code></p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400 text-sm">
        <p>Could not reach API at {API}</p>
        <button onClick={fetchLatest} className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 text-gray-200">
          Retry
        </button>
      </div>
    )
  }

  if (!data || !data.levels?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-gray-500 text-lg">No session data</div>
        <div className="text-gray-600 text-xs">
          Open <span className="font-mono text-white">Tab 4 📐 Levels</span> → enter levels → Save → Score Now
        </div>
      </div>
    )
  }

  const levels   = data.levels || []
  const etfDir   = levels[0]?.etf_direction || 'neutral'
  const nqRatio  = data.nq_ratio ? Number(data.nq_ratio) : null
  const nqPrice  = nqRatio && data.current_price
    ? Math.round(Number(data.current_price) * nqRatio).toLocaleString()
    : '—'
  const sessionMaxGex = Math.max(...levels.map(l => Math.abs(l.gex?.net_gex ?? 0)), 1)

  const enriched = levels.map(l => {
    if (!l.passive_target || !l.passive_target_from) return l
    const target = levels.find(t => t.id === l.passive_target_from)
    const delta = target ? target.price - l.price : null
    return { ...l, _target_delta: delta }
  })

  const LEVEL_ORDER = ['R2', 'R1', 'MID', 'S1', 'S2']
  const sortedLevels = [...enriched].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id)
  )

  const fmtET = iso => {
    if (!iso) return null
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
    }) + ' ET'
  }
  const lastFetch = fmtET(lastRescoreAt || providerStatus?.lastPriceCheck || data?._received_at || data?.scored_at)

  const sessionType = (() => {
    const etHour = parseInt(new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', hour12: false, timeZone: 'America/New_York',
    }))
    if (etHour >= 9 && etHour < 16) return 'LIVE'
    if (etHour >= 4 && etHour < 9)  return 'PRE-MARKET'
    return 'AFTER-HOURS'
  })()

  const sentiment  = data?._sentiment || null
  const cascade    = data.cascade || null
  const structureBreak = data.structure_break || null

  const streak     = magnetStreak ?? providerStatus?.allPinningSessions ?? 0
  const etfTide    = { direction: etfDir, description: ETF_DESCRIPTION[etfDir] || ETF_DESCRIPTION.neutral }
  const gexRegime  = {
    label:  providerStatus?.expansionGexActive ? 'EXPANSION' : (data?.gex_regime?.label || 'PINNING'),
    active: providerStatus?.expansionGexActive ?? false,
  }

  return (
    <div className="space-y-3 py-3">

      {/* Thesis bar — always first */}
      <ThesisBar
        sentiment={sentiment}
        levels={levels}
        cascade={cascade}
        assistantRead={assistantRead}
        currentPrice={data?.current_price}
        nqRatio={nqRatio}
      />

      {/* Session Brief — full-width above hero */}
      {sessionBrief && providerStatus?.narrativeMode === 'claude' && (
        <div className="bg-[#111827] border border-purple-900/40 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-purple-500 text-xs">🤖</span>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Session Brief</span>
              <span className="text-xs text-gray-700">Claude Haiku</span>
            </div>
            <button
              onClick={() => setBriefOpen(!briefOpen)}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              {briefOpen ? '▲ collapse' : '▼ expand'}
            </button>
          </div>
          {briefOpen ? (
            <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-purple-900 pl-3">
              {sessionBrief}
            </p>
          ) : (
            <p className="text-xs text-gray-600 italic line-clamp-1">
              {sessionBrief.slice(0, 120)}...
            </p>
          )}
        </div>
      )}

      {/* Scenario cards */}
      <ScenarioCards
        assistantRead={assistantRead}
        levels={levels}
        cascade={cascade}
        currentPrice={data?.current_price}
        nqRatio={nqRatio}
      />

      {/* Row 1 — Three hero cards */}
      <div className="grid grid-cols-3 gap-3">
        <MarketStateCard sentiment={sentiment} cascadeActive={data?.cascade?.active} />
        <SessionHeaderCard
          date={data.session}
          sessionType={sessionType}
          price={data.current_price}
          nqPrice={nqPrice}
          nqRatio={nqRatio}
          lastFetch={lastFetch}
          budget={budget}
          mode={mode}
          onToggleMode={toggleMode}
          onRefresh={fetchLatest}
          providerStatus={providerStatus}
          lastPolled={lastPolled}
        />
        <AlertsCard
          cascade={cascade}
          structureBreak={structureBreak}
          levels={levels}
          currentPrice={data.current_price}
        />
      </div>

      {/* Earnings warning — conditional, not collapsible */}
      <EarningsWarning apiUrl={API} />

      {/* Row 2 — Economic events (collapsible) */}
      <CollapsibleSection title="Economic Calendar" defaultOpen={true}>
        <EconomicCalendar apiUrl={API} />
      </CollapsibleSection>

      {/* Row 3 — Signal strength + stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-1">
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 h-full">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Signal Strength</div>
            <SignalStrengthBar levels={levels} />
          </div>
        </div>
        <StatCard
          label="Streak"
          value={streak}
          sub="consecutive sessions"
        />
        <StatCard
          label="ETF Tide"
          value={etfTide.direction?.toUpperCase()}
          sub={etfTide.description?.slice(0, 48)}
          color={
            etfTide.direction === 'bullish' ? 'text-green-400'
              : etfTide.direction === 'bearish' ? 'text-red-400'
              : 'text-gray-400'
          }
        />
        <StatCard
          label="GEX Regime"
          value={gexRegime.label}
          sub={gexRegime.active ? 'no pinning friction' : `${providerStatus?.allPinningSessions ?? '—'} sessions`}
          color={gexRegime.active ? 'text-red-400' : 'text-green-400'}
        />
      </div>

      {/* Row 4 — Five level cards */}
      <div className="space-y-2">
        {sortedLevels.map(level => (
          <LevelCard
            key={level.id}
            level={level}
            nqRatio={nqRatio}
            dpHistory={providerStatus?.dpHistory || {}}
            levelNarrative={levelNarratives[level.id]}
            currentPrice={data?.current_price}
            levelTouches={levelTouches[level.id]}
          />
        ))}
      </div>

      {/* Row 5 — GEX by expiry (collapsible, includes cage) */}
      <CollapsibleSection title="GEX by Expiry" defaultOpen={true}>
        <GexCageSummary levels={levels} />
        <GexByExpiry apiUrl={API} />
      </CollapsibleSection>

      {/* Row 6 — Market context grid */}
      <div className="grid grid-cols-2 gap-3">
        <SectorETF apiUrl={API} />
        <TopNetImpact apiUrl={API} />
      </div>

      {/* Row 7 — Flow signals grid */}
      <div className="grid grid-cols-2 gap-3">
        <CollapsibleSection title="0DTE Flow" defaultOpen={false}>
          <ZeroDteFlow apiUrl={API} />
        </CollapsibleSection>
        <CollapsibleSection title="Greek Flow" defaultOpen={false}>
          <GreekFlow apiUrl={API} />
        </CollapsibleSection>
      </div>

    </div>
  )
}
