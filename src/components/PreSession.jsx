import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import LevelCard from './LevelCard'
import CascadeBanner from './CascadeBanner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const POLL_MS = 30_000

const ETF_LABEL = { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL', 'no data': 'NO DATA' }
const ETF_COLOR = { bullish: 'text-green-400 bg-green-900/40 border-green-700', bearish: 'text-red-400 bg-red-900/40 border-red-700', neutral: 'text-gray-400 bg-gray-800 border-gray-600', 'no data': 'text-gray-500 bg-gray-800 border-gray-700' }

function StructureBreakBar({ sb }) {
  const toR2 = sb?.distance_to_r2 ?? null
  const toS2 = sb?.distance_to_s2 ?? null
  const active = sb?.active ?? false
  const isImminent = !active && (
    (toR2 !== null && toR2 <= 0.50) || (toS2 !== null && toS2 <= 0.50)
  )

  let cls  = 'bg-gray-800 border-gray-700 text-gray-400'
  let text = `R2 $${toR2?.toFixed(2) ?? '—'} away  |  S2 $${toS2?.toFixed(2) ?? '—'} away`

  if (isImminent) {
    const imminentR2 = toR2 !== null && toR2 <= 0.50
    cls  = 'bg-amber-900/50 border-amber-600 text-amber-300'
    text = imminentR2
      ? `⚠ R2 $${toR2.toFixed(2)} — BREAK IMMINENT`
      : `⚠ S2 $${toS2.toFixed(2)} — BREAK IMMINENT`
  }

  if (active) {
    const dir = sb.direction === 'upside' ? '▲' : '▼'
    const ext = sb.r3 ? ` — ${sb.direction === 'upside' ? 'R3' : 'S3'}: $${sb.r3}` : ''
    cls  = 'bg-red-900/50 border-red-600 text-red-300'
    text = `⚠ STRUCTURE BREAK ${dir} ${sb.direction?.toUpperCase() ?? ''}${ext}`
  }

  return (
    <div className={`px-3 py-2 rounded border text-sm font-medium ${cls}`}>
      {text}
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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastPolled, setLastPolled] = useState(null)

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

  useEffect(() => {
    fetchLatest()
    const interval = setInterval(fetchLatest, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchLatest])

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

  return (
    <div className="space-y-4">
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
              <span>QQQ <span className="text-white font-medium">${data.current_price?.toFixed(2) ?? '—'}</span></span>
              <span className="text-gray-600">|</span>
              <span>NQ <span className="text-white font-medium">{nqPrice}</span></span>
              {nqRatio && <span className="text-xs text-gray-500">ratio {nqRatio.toFixed(3)}</span>}
              {!nqRatio && <span className="text-xs text-gray-600">ratio —</span>}
            </div>
          </div>
          <button
            onClick={fetchLatest}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 text-gray-300 transition-colors shrink-0"
          >
            Refresh
          </button>
        </div>
        {lastPolled && (
          <div className="text-xs text-gray-600 mt-2">
            Polled {lastPolled.toLocaleTimeString()} · auto every 30s
          </div>
        )}
      </div>

      {/* Structure break bar */}
      <StructureBreakBar sb={data.structure_break} />

      {/* Cascade banner */}
      <CascadeBanner cascade={data.cascade} />

      {/* Level cards */}
      <div className="space-y-2">
        {[...enriched].reverse().map(level => (
          <LevelCard
            key={level.id}
            level={level}
            sessionMaxGex={sessionMaxGex}
            nqRatio={nqRatio}
          />
        ))}
      </div>

      {/* GEX cage */}
      <GexCageSummary levels={levels} />

      {/* Stat boxes */}
      <div className="grid grid-cols-3 gap-3">
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
      </div>
    </div>
  )
}
