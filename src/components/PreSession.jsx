import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import LevelCard from './LevelCard'
import CascadeBanner from './CascadeBanner'
import EarningsWarning from './EarningsWarning'
import EconomicCalendar from './EconomicCalendar'
import SectorETF from './SectorETF'
import TopNetImpact from './TopNetImpact'
import GexByExpiry from './GexByExpiry'
import ZeroDteFlow from './ZeroDteFlow'
import SentimentBadge from './SentimentBadge'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const POLL_MS        = 30_000
const STATUS_POLL_MS = 10_000
const BUDGET_POLL_MS = 60_000

function msToLabel(ms) {
  if (!ms) return '—'
  if (ms >= 60000) return `${ms / 1000 / 60}m`
  return `${ms / 1000}s`
}

const ETF_LABEL = { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL', 'no data': 'NO DATA' }
const ETF_COLOR = { bullish: 'text-green-400 bg-green-900/40 border-green-700', bearish: 'text-red-400 bg-red-900/40 border-red-700', neutral: 'text-gray-400 bg-gray-800 border-gray-600', 'no data': 'text-gray-500 bg-gray-800 border-gray-700' }
const ETF_DESCRIPTION = {
  bullish:  'Institutions buying calls — bullish session tone. Confirms long setups.',
  bearish:  'Institutions selling calls or buying puts — bearish tone. Fades long setups.',
  neutral:  'Mixed flow — no strong directional bias from ETF tide.',
  'no data': 'No ETF tide data available for this session.',
}

function StructureBreakBar({ sb, nqRatio }) {
  const toR2   = sb?.distance_to_r2 ?? null
  const toS2   = sb?.distance_to_s2 ?? null
  const active = sb?.active ?? false
  const isImminent = !active && (
    (toR2 !== null && toR2 <= 0.50) || (toS2 !== null && toS2 <= 0.50)
  )

  const r2NqDist = nqRatio && toR2 != null ? Math.round(toR2 * nqRatio) : null
  const s2NqDist = nqRatio && toS2 != null ? Math.round(toS2 * nqRatio) : null

  if (active) {
    const dir  = sb.direction === 'upside' ? '▲' : '▼'
    const r3nq = nqRatio && sb.r3 ? Math.round(sb.r3 * nqRatio).toLocaleString() : null
    return (
      <div className="px-3 py-2 rounded border bg-red-900/50 border-red-600">
        <div className="text-sm font-medium text-red-300">
          ⚠ STRUCTURE BREAK {dir} {sb.direction?.toUpperCase() ?? ''}
          {sb.r3 && (
            <> — {sb.direction === 'upside' ? 'R3' : 'S3'}:{' '}
              <span className="text-white">${sb.r3}</span>
              {r3nq && <span className="text-gray-400"> / NQ {r3nq}</span>}
            </>
          )}
        </div>
        <div className="text-xs mt-0.5 text-red-300/70">
          Price has moved outside the defined structure — GEX extension scanning for next level
        </div>
      </div>
    )
  }

  if (isImminent) {
    const imminentR2 = toR2 !== null && toR2 <= 0.50
    const dist = imminentR2 ? toR2 : toS2
    const nqD  = imminentR2 ? r2NqDist : s2NqDist
    const label = imminentR2 ? 'R2' : 'S2'
    return (
      <div className="px-3 py-2 rounded border bg-amber-900/50 border-amber-600">
        <div className="text-sm font-medium text-amber-300">
          ⚠ {label} <span className="text-white">${dist?.toFixed(2)}</span>
          {nqD && <span className="text-gray-400"> / {nqD} NQ</span>}
          {' '}— BREAK IMMINENT
        </div>
        <div className="text-xs mt-0.5 text-amber-300/70">Price is within the defined structure range</div>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 rounded border bg-gray-800 border-gray-700">
      <div className="text-sm font-medium text-gray-400">
        R2 <span className="text-white">${toR2?.toFixed(2) ?? '—'}</span>
        {r2NqDist && <span className="text-gray-400"> / {r2NqDist} NQ</span>}
        <span className="text-gray-600 mx-2">|</span>
        S2 <span className="text-white">${toS2?.toFixed(2) ?? '—'}</span>
        {s2NqDist && <span className="text-gray-400"> / {s2NqDist} NQ</span>}
        <span className="text-gray-500 ml-1">away</span>
      </div>
      <div className="text-xs mt-0.5 text-gray-600">Price is within the defined structure range</div>
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
    <div className="bg-gray-900/60 rounded border border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">GEX Cage</span>
        {hasExpansion && <span className="text-xs text-orange-400 font-medium">⚡ EXPANSION</span>}
      </div>
      <div className="space-y-1.5">
        {withGex.map(l => {
          const pct = maxAbs > 0 ? Math.abs(l.gex.net_gex) / maxAbs * 100 : 0
          const pinning = l.gex.net_gex >= 0
          const isPeak = l.id === peak.id
          return (
            <div key={l.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8">{l.id}</span>
              <div className="flex-1 relative h-[10px] bg-gray-800 rounded overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded ${pinning ? 'bg-blue-500' : 'bg-orange-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {isPeak && (
                <span className="text-xs text-blue-300 font-medium whitespace-nowrap">MECH CTR</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PreSession() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastPolled, setLastPolled] = useState(null)
  const [providerStatus, setProviderStatus] = useState(null)
  const [budget, setBudget]       = useState(null)
  const [mode, setMode]           = useState('REST')

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
    const t1 = setInterval(fetchLatest, POLL_MS)
    return () => clearInterval(t1)
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

  if (!data) return null

  const levels   = data.levels || []
  const etfDir   = levels[0]?.etf_direction || 'neutral'
  const nqRatio  = data.nq_ratio ? Number(data.nq_ratio) : null
  const nqPrice  = nqRatio && data.current_price
    ? Math.round(Number(data.current_price) * nqRatio).toLocaleString()
    : '—'
  const sessionMaxGex = Math.max(...levels.map(l => Math.abs(l.gex?.net_gex ?? 0)), 1)

  // Compute passive target deltas
  const enriched = levels.map(l => {
    if (!l.passive_target || !l.passive_target_from) return l
    const target = levels.find(t => t.id === l.passive_target_from)
    const delta = target ? target.price - l.price : null
    return { ...l, _target_delta: delta }
  })

  const apiUsed  = data.api_calls_used ?? null
  const apiMax   = 14000
  const apiPct   = apiUsed !== null ? apiUsed / apiMax : null

  // ETF data
  const tide = data.etf_tide || {}
  const netCall = tide.net_call_premium
  const netPut  = tide.net_put_premium
  const fmt = v => v != null ? `$${(Math.abs(v) / 1e6).toFixed(2)}M` : '—'
  const sentiment = data?._sentiment || null

  return (
    <div className="space-y-4">
      {/* Sentiment badge — first element */}
      <SentimentBadge sentiment={sentiment} compact={false} />

      {/* Session header */}
      <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-gray-300 font-medium">{data.session}</span>
              <span className="text-xs text-gray-500 uppercase">{data.run_type}</span>
            </div>
            <div className="text-xs text-gray-500">
              Last fetch: {data.fetched_at || '—'}
            </div>
            <div className="flex items-center gap-3 text-sm mt-1">
              <span className="text-white font-medium">${data.current_price?.toFixed(2) ?? '—'}</span>
              <span className="text-gray-400 font-medium">/ NQ {nqPrice}</span>
              {nqRatio && <span className="text-xs text-gray-500">ratio {nqRatio.toFixed(3)}</span>}
              {!nqRatio && <span className="text-xs text-gray-600">ratio —</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleMode}
              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                mode === 'REST'
                  ? 'bg-green-800 text-green-200 border border-green-600'
                  : 'bg-blue-800 text-blue-200 border border-blue-600'
              }`}
            >
              {mode === 'REST' ? '● REST' : '○ WS'}
            </button>
            <button
              onClick={fetchLatest}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 text-gray-300 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Budget bar */}
        {budget && (
          <div className="mt-2 space-y-0.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>API Budget</span>
              <span className={
                budget.status === 'red' ? 'text-red-400' :
                budget.status === 'amber' ? 'text-amber-400' : 'text-green-400'
              }>
                {budget.callsToday.toLocaleString()} / {budget.workingBudget.toLocaleString()} ({budget.percentUsed}%)
              </span>
            </div>
            <div className="h-1 bg-gray-800 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all ${
                  budget.status === 'red' ? 'bg-red-500' :
                  budget.status === 'amber' ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, parseFloat(budget.percentUsed))}%` }}
              />
            </div>
          </div>
        )}

        {/* Polling status */}
        {providerStatus && (
          <div className="mt-2 pt-2 border-t border-gray-800 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
            <span>
              <span className={providerStatus.pollingActive ? 'text-green-500' : 'text-gray-500'}>
                {providerStatus.pollingActive ? '▸' : '■'}
              </span>
              {' '}{providerStatus.mode} · interval {msToLabel(providerStatus.currentInterval)}
            </span>
            <span>
              {providerStatus.lastPriceCheck
                ? `price checked ${new Date(providerStatus.lastPriceCheck).toLocaleTimeString()}`
                : 'no price check yet'}
            </span>
            {providerStatus.lastRescore && (
              <span className="col-span-2 text-gray-700">
                last rescore {new Date(providerStatus.lastRescore).toLocaleTimeString()}
                {providerStatus.lastRescoreReason ? ` — ${providerStatus.lastRescoreReason}` : ''}
              </span>
            )}
          </div>
        )}

        {lastPolled && (
          <div className="text-xs text-gray-700 mt-1">
            data polled {lastPolled.toLocaleTimeString()} · auto every 30s
          </div>
        )}
      </div>

      {/* Earnings warning + Economic calendar */}
      <EarningsWarning apiUrl={API} />
      <EconomicCalendar apiUrl={API} />

      {/* Structure break bar */}
      <StructureBreakBar sb={data.structure_break} nqRatio={nqRatio} />

      {/* Cascade banner */}
      <CascadeBanner
        cascade={data.cascade}
        midPrice={levels.find(l => l.id === 'MID')?.price ?? null}
        nqRatio={nqRatio}
      />

      {/* Level cards */}
      <div className="space-y-2">
        {(() => {
          const LEVEL_ORDER = ['R2', 'R1', 'MID', 'S1', 'S2']
          return [...enriched].sort((a, b) =>
            LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id)
          ).map(level => (
            <LevelCard
              key={level.id}
              level={level}
              sessionMaxGex={sessionMaxGex}
              nqRatio={nqRatio}
              dpHistory={providerStatus?.dpHistory?.[level.id] || []}
              scoredAt={data?.scored_at || data?.fetched_at}
            />
          ))
        })()}
      </div>

      {/* GEX cage */}
      <GexCageSummary levels={levels} />

      {/* GEX by expiry */}
      <GexByExpiry apiUrl={API} />

      {/* Stat boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Resistance magnet streak */}
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3 text-center">
          <div className="text-3xl font-bold text-white">
            {data.resistance_magnet_streak ?? '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Consecutive Sessions</div>
          <div className="text-xs text-gray-600 mt-0.5">Zero failures</div>
        </div>

        {/* ETF tide */}
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">ETF Tide</div>
          <div className={`inline-block px-2 py-0.5 rounded border text-xs font-bold mb-2 ${ETF_COLOR[etfDir] || ETF_COLOR.neutral}`}>
            {ETF_LABEL[etfDir] || 'NEUTRAL'}
          </div>
          <div className="text-xs text-gray-400 space-y-0.5">
            <div>Call: <span className="text-green-400">{fmt(netCall)}</span></div>
            <div>Put: <span className="text-red-400">{fmt(netPut)}</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-1 italic">
            {ETF_DESCRIPTION[etfDir] || ETF_DESCRIPTION.neutral}
          </div>
          {data.run_type?.includes('overnight') && (
            <div className="text-xs text-gray-600 mt-1">carry-forward</div>
          )}
        </div>

        {/* API budget */}
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">API Budget</div>
          <div className="text-sm text-gray-300">
            {apiUsed !== null ? apiUsed.toLocaleString() : '—'} / {apiMax.toLocaleString()}
          </div>
          {apiPct !== null && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${apiPct < 0.5 ? 'bg-green-500' : apiPct < 0.8 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${apiPct * 100}%` }}
                />
              </div>
              <div className={`text-xs mt-1 ${apiPct < 0.5 ? 'text-green-400' : apiPct < 0.8 ? 'text-amber-400' : 'text-red-400'}`}>
                {(apiPct * 100).toFixed(1)}% used
              </div>
            </div>
          )}
        </div>

        {/* GEX regime */}
        <div className="bg-gray-900/60 rounded border border-gray-700 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">GEX Regime</div>
          {providerStatus?.expansionGexActive ? (
            <>
              <div className="text-lg font-bold text-red-400 animate-pulse">EXPANSION</div>
              <div className="text-xs text-red-300 mt-1">
                {(providerStatus.expansionGexLevels || []).map(l => l.level).join(', ')}
                {' '}— no pinning friction
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-green-400">
                {providerStatus?.allPinningSessions ?? '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Consecutive pinning sessions</div>
            </>
          )}
        </div>
      </div>

      {/* Sector flow + top movers + 0DTE */}
      <div className="grid grid-cols-2 gap-3">
        <SectorETF apiUrl={API} />
        <TopNetImpact apiUrl={API} />
        <ZeroDteFlow apiUrl={API} />
      </div>
    </div>
  )
}
