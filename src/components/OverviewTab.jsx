import { useState, useEffect, useMemo } from 'react'
import { useSSE } from '../hooks/useSSE'
import ImmediateRiskCard from './ImmediateRiskCard'
import EvidenceMeter from './EvidenceMeter'
import SmartLevelCard from './SmartLevelCard'
import TopNetImpact from './TopNetImpact'
import SectorETF from './SectorETF'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg px-4 py-3">
      <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function OverviewTab({ onNavigate, activeSymbol = 'NQ' }) {
  const {
    rescoreData, priceData, connected,
    sentiment, sessionBrief, assistantRead, levelNarratives,
    dpHistory, levelTouches, priceVelocity,
  } = useSSE(`${API_URL}/stream`)

  const [status, setStatus]   = useState(null)
  const [budget, setBudget]   = useState(null)
  const [showBrief, setShowBrief] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/status`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/budget`).then(r => r.json()).catch(() => null),
    ]).then(([s, b]) => { if (s) setStatus(s); if (b) setBudget(b) })
    const t = setInterval(() => {
      fetch(`${API_URL}/status`).then(r => r.json()).then(s => setStatus(s)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const result       = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const effectiveSentiment = sentiment ?? rescoreData?.result?._sentiment ?? null
  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const currentPrice = priceData?.price ?? result?.current_price
  const nqPrice      = nqRatio && currentPrice ? Math.round(currentPrice * nqRatio * 4) / 4 : null
  const cascade      = result?.cascade ?? null
  const sb           = result?.structure_break ?? null

  const etHour      = parseInt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
  const sessionType = etHour >= 9 && etHour < 16 ? 'LIVE' : etHour >= 4 && etHour < 9 ? 'PRE-MARKET' : 'AFTER-HOURS'
  const lastRescoreTime = rescoreData?.timestamp
    ? new Date(rescoreData.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' }) + ' ET'
    : null

  const bearLevel  = [...levels].filter(l => l.classification === 'sell_resistance').sort((a, b) => (b.score || 0) - (a.score || 0))[0] ?? null
  const bullLevel  = [...levels].filter(l => l.classification === 'buy_support').sort((a, b)    => (b.score || 0) - (a.score || 0))[0] ?? null
  const focusLevel = levels.length > 0 && currentPrice != null
    ? levels.reduce((n, l) => Math.abs(currentPrice - l.price) < Math.abs(currentPrice - n.price) ? l : n)
    : null

  const etfDir   = levels[0]?.etf_direction || 'neutral'
  const streak   = status?.allPinningSessions ?? '—'
  const apiCalls = budget?.callsToday ?? '—'

  return (
    <div className="space-y-4 py-4">

      {/* Hero — 3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Market state */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Market State</div>

          {/* Sentiment badge — most prominent */}
          {effectiveSentiment?.state && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold w-fit ${
              effectiveSentiment.color === 'green'
                ? 'bg-green-950 text-green-400 border border-green-800'
                : effectiveSentiment.color === 'red'
                ? 'bg-red-950 text-red-400 border border-red-800'
                : 'bg-amber-950 text-amber-400 border border-amber-800'
            }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                effectiveSentiment.color === 'green' ? 'bg-green-500'
                  : effectiveSentiment.color === 'red' ? 'bg-red-500'
                  : 'bg-amber-500'
              } ${effectiveSentiment.state === 'HIGH_RISK' && !cascade?.active ? 'animate-pulse' : ''}`} />
              {effectiveSentiment.state}
            </div>
          )}

          {/* NOW text */}
          {assistantRead?.now && (
            <p className="text-xs text-gray-400 leading-relaxed">
              {assistantRead.now}
            </p>
          )}

          {/* Session brief expander */}
          {sessionBrief && (
            <div className="border-t border-gray-800 pt-2">
              <button
                onClick={() => setShowBrief(!showBrief)}
                className="text-xs text-purple-700 hover:text-purple-500 transition-colors"
              >
                {showBrief ? '▲ hide' : '▼ session brief'}
              </button>
              {showBrief && (
                <p className="text-xs text-gray-400 mt-2 leading-relaxed border-l-2 border-purple-900 pl-2">
                  {sessionBrief}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Price hero */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 flex flex-col items-center justify-center">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Live Price</div>
          <div className="text-4xl font-bold text-white font-mono tabular-nums">
            {activeSymbol === 'NQ'
              ? (nqPrice != null ? nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
              : `$${currentPrice?.toFixed(2) ?? '—'}`}
          </div>
          <div className="text-lg text-gray-400 font-mono mt-1">
            {activeSymbol === 'NQ'
              ? `QQQ $${currentPrice?.toFixed(2) ?? '—'}`
              : `NQ ${nqPrice?.toLocaleString() ?? '—'}`}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'} ${connected && !cascade?.active ? 'animate-pulse' : ''}`} />
            <span className="text-xs text-gray-500">{connected ? 'LIVE' : 'DISCONNECTED'}</span>
            {priceVelocity != null && (() => {
              const abs = Math.abs(priceVelocity), up = priceVelocity > 0
              const arrow = abs > 0.05 ? (up ? '↑↑' : '↓↓') : abs > 0.02 ? (up ? '↑' : '↓') : '→'
              const color = abs > 0.05 ? (up ? 'text-green-400 animate-pulse' : 'text-red-400 animate-pulse') : abs > 0.02 ? (up ? 'text-green-500' : 'text-red-500') : 'text-gray-600'
              return <span className={`text-xs font-bold ${color}`}>{arrow}</span>
            })()}
          </div>
          {focusLevel && currentPrice != null && (
            <div className="text-xs text-gray-500 mt-2">
              {Math.abs(currentPrice - focusLevel.price).toFixed(2)} from {focusLevel.id}
            </div>
          )}
          <div className="text-xs text-gray-600 mt-1">
            {sessionType === 'LIVE' ? '● Market open' : sessionType === 'PRE-MARKET' ? '◑ Pre-market' : '○ After hours'}
          </div>
          {lastRescoreTime && (
            <div className="text-xs text-gray-700 mt-0.5">updated {lastRescoreTime}</div>
          )}
        </div>

        {/* Immediate risk */}
        <ImmediateRiskCard cascade={cascade} levels={levels} structureBreak={sb} />
      </div>

      {/* Strongest levels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SmartLevelCard level={bearLevel}  currentPrice={currentPrice} nqRatio={nqRatio} narrative={levelNarratives?.[bearLevel?.id]}  dpHistory={dpHistory} touches={levelTouches?.[bearLevel?.id]}  label="Strongest Resistance" activeSymbol={activeSymbol} />
        <SmartLevelCard level={focusLevel} currentPrice={currentPrice} nqRatio={nqRatio} narrative={levelNarratives?.[focusLevel?.id]} dpHistory={dpHistory} touches={levelTouches?.[focusLevel?.id]} label="Current Focus" activeSymbol={activeSymbol} />
        <SmartLevelCard level={bullLevel}  currentPrice={currentPrice} nqRatio={nqRatio} narrative={levelNarratives?.[bullLevel?.id]}  dpHistory={dpHistory} touches={levelTouches?.[bullLevel?.id]}  label="Strongest Support" activeSymbol={activeSymbol} />
      </div>

      {/* Evidence meter */}
      <EvidenceMeter levels={levels} etfDirection={etfDir} />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Streak"     value={streak}          sub="consecutive sessions" color="text-white" />
        <StatCard label="ETF Tide"   value={etfDir.toUpperCase()} sub={etfDir === 'bullish' ? 'institutions buying calls' : etfDir === 'bearish' ? 'institutions selling' : 'mixed flow'} color={etfDir === 'bullish' ? 'text-green-400' : etfDir === 'bearish' ? 'text-red-400' : 'text-gray-400'} />
        <StatCard label="API Budget" value={apiCalls}        sub={`/ 14,000 (${typeof apiCalls === 'number' ? ((apiCalls / 14000) * 100).toFixed(1) : '—'}%)`} color="text-white" />
        <StatCard label="GEX Regime" value={status?.expansionGexActive ? 'EXPANSION' : 'PINNING'} sub={`${status?.allPinningSessions ?? '—'} sessions`} color={status?.expansionGexActive ? 'text-red-400' : 'text-green-400'} />
      </div>

      {/* Lower row — Top Movers + Sector Flow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TopNetImpact apiUrl={API_URL} />
        <SectorETF apiUrl={API_URL} />
      </div>
    </div>
  )
}
