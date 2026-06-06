import { useState, useMemo, useEffect, useRef } from 'react'
import { useSSE } from '../hooks/useSSE'
import { useLayout } from '../context/LayoutContext'
import { useAuth } from '../context/AuthContext'
import PriceLadder from './intraday/PriceLadder'
import PriceSparkline from './intraday/PriceSparkline'
import DarkPoolChart from './intraday/DarkPoolChart'
import EtfTideChart from './intraday/EtfTideChart'
import RescoreLog from './intraday/RescoreLog'
import Controls from './intraday/Controls'
import ExpansionGexAlert from './intraday/ExpansionGexAlert'
import CascadeProximityGauge from './intraday/CascadeProximityGauge'
import NarrativeBlock from './intraday/NarrativeBlock'
import NewsHeadlines from './intraday/NewsHeadlines'
import LiveHeader from './intraday/LiveHeader'
import RightRail from './intraday/RightRail'

const SUB_TABS         = ['Price Ladder', 'Dark Pool', 'ETF Tide', 'News', 'Log', 'Controls']
const SUB_TABS_COMPACT = ['PL', 'DP', 'ETF', 'News', 'Log', 'Ctrl']

export default function Intraday() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const {
    rescoreData, priceData, connected,
    history, levelAlert, clearLevelAlert,
    chartStale, staleChanges,
    expansionGex, pinningSessions,
    midDpHistory, dpHistory, narrative, narrativeMode, levelNarratives, tacticalBrief,
    priceVelocity, priceHistory, levelTouches,
  } = useSSE(`${API_URL}/stream`)

  const { compact, toggle } = useLayout()
  const { unlocked, authPost } = useAuth()
  const sentiment     = rescoreData?.sentiment ?? rescoreData?.result?._sentiment ?? null
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') === 'true')
  const soundCooldownRef = useRef({})

  useEffect(() => {
    const handler = (e) => { if (e.key === 'soundEnabled') setSoundEnabled(e.newValue === 'true') }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const [subTab, setSubTab]   = useState(0)
  const [drawing, setDrawing] = useState(null)
  const [drawResult, setDrawResult] = useState(null)

  const triggerDraw = async (type) => {
    if (!unlocked || drawing) return
    setDrawing(type)
    setDrawResult(null)
    try {
      const endpoint = type === 'both' ? '/draw' : '/draw-qqq'
      await authPost(`${API_URL}${endpoint}`)
      setDrawResult('success')
    } catch {
      setDrawResult('error')
    } finally {
      setDrawing(null)
      setTimeout(() => setDrawResult(null), 5000)
    }
  }

  const result     = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const nqRatio    = useMemo(() => result?.nq_ratio ? Number(result.nq_ratio) : null, [result])
  const cascade    = useMemo(() => result?.cascade ?? rescoreData?.cascade ?? null, [rescoreData, result])
  const lastUpdate = useMemo(() => rescoreData?.timestamp ?? null, [rescoreData])

  const currentPrice = priceData?.price ?? result?.current_price
  const nqPrice      = nqRatio && currentPrice ? Math.round(currentPrice * nqRatio) : null

  useEffect(() => {
    if (!soundEnabled || !currentPrice || !result?.levels) return
    const now = Date.now()
    result.levels.forEach(level => {
      const dist = Math.abs(currentPrice - level.price)
      const last = soundCooldownRef.current[level.id] || 0
      if (dist <= 0.15 && now - last > 10000) {
        soundCooldownRef.current[level.id] = now
        try {
          const ctx  = new (window.AudioContext || window.webkitAudioContext)()
          const osc  = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = level.classification === 'buy_support' ? 523 : 311
          gain.gain.setValueAtTime(0.1, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
        } catch { /* audio not supported */ }
      }
    })
  }, [currentPrice, soundEnabled])

  useEffect(() => {
    if (!soundEnabled || !cascade?.active) return
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ;[440, 370, 311].forEach((freq, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq
        const start = ctx.currentTime + i * 0.2
        gain.gain.setValueAtTime(0.15, start)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
        osc.start(start); osc.stop(start + 0.3)
      })
    } catch { /* audio not supported */ }
  }, [cascade?.active, soundEnabled])

  if (!connected && !rescoreData && !priceData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm animate-pulse">Connecting to live data…</div>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-3">

      <LiveHeader
        connected={connected}
        price={currentPrice}
        nqPrice={nqPrice}
        velocity={priceVelocity}
        sentiment={sentiment}
        drawing={drawing}
        drawResult={drawResult}
        unlocked={unlocked}
        onDrawQqq={() => triggerDraw('qqq')}
        onDrawBoth={() => triggerDraw('both')}
        onCompact={toggle}
        compact={compact}
      />

      {/* Chart stale badge */}
      {chartStale && (() => {
        const isCritical = staleChanges.some(c => c.type === 'cascade')
        return (
          <div className={`flex items-center gap-2 border rounded px-3 py-1.5 ${
            isCritical ? 'bg-red-900/80 border-red-500 animate-pulse' : 'bg-amber-900/80 border-amber-500'
          }`}>
            <span className={`text-sm font-bold shrink-0 ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
              🔄 CHART STALE
            </span>
            <span className={`text-xs truncate ${isCritical ? 'text-red-300' : 'text-amber-300'}`}>
              {staleChanges.map((c, i) => (
                <span key={i}>
                  {c.type === 'classification' && `${c.level} → ${c.to === 'buy_support' ? 'BUY SUP' : c.to === 'sell_resistance' ? 'SELL RES' : 'NO EDGE'}`}
                  {c.type === 'full_stack' && `${c.level} FULL STACK ${c.active ? '★' : 'gone'}`}
                  {c.type === 'cascade' && `CASCADE ${c.active ? 'ACTIVATED ⚠' : 'resolved'}`}
                  {i < staleChanges.length - 1 && ' · '}
                </span>
              ))}
            </span>
            <span className={`text-xs ml-1 shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>— run /draw</span>
          </div>
        )
      })()}

      {/* $2.50 move alert */}
      {levelAlert && (
        <div className="bg-amber-900/80 border border-amber-500 rounded px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-amber-400 text-sm font-bold shrink-0">⚡ LEVEL UPDATE RECOMMENDED</span>
            <span className="text-amber-300 text-sm truncate">
              Price moved {Number(levelAlert.move) >= 0 ? '+' : ''}{levelAlert.move} from open ${Number(levelAlert.sessionOpenPrice).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-amber-500 text-xs hidden sm:block">Re-read indicator → update levels → npm start</span>
            <button onClick={clearLevelAlert} className="text-amber-600 hover:text-amber-300 text-sm leading-none" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      <ExpansionGexAlert expansionGex={expansionGex} pinningSessions={pinningSessions} />

      {/* 12-col grid: left 8-col main content, right 4-col rail */}
      <div className="grid grid-cols-12 gap-3">

        {/* Left column */}
        <div className="col-span-12 lg:col-span-8 space-y-3">
          <CascadeProximityGauge cascade={cascade} midDpHistory={midDpHistory} />
          <NarrativeBlock narrative={narrative} result={result} lastUpdate={lastUpdate} compact={compact} narrativeMode={narrativeMode} tacticalBrief={tacticalBrief} />

          {/* Sub-tab navigation — flat underline style */}
          <div className="flex gap-0 border-b border-gray-800">
            {(compact ? SUB_TABS_COMPACT : SUB_TABS).map((tab, i) => (
              <button
                key={i}
                onClick={() => setSubTab(i)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
                  subTab === i
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          <div className={compact ? 'min-h-[400px]' : 'min-h-[600px]'}>
            {subTab === 0 && <>
              <PriceSparkline history={priceHistory} levels={result?.levels} />
              <PriceLadder result={result} currentPrice={currentPrice} nqRatio={nqRatio} compact={compact} dpHistory={dpHistory} scoredAt={rescoreData?.result?.scored_at || rescoreData?.timestamp} levelNarratives={levelNarratives} levelTouches={levelTouches} />
            </>}
            {subTab === 1 && <DarkPoolChart history={history} compact={compact} />}
            {subTab === 2 && <EtfTideChart history={history} compact={compact} />}
            {subTab === 3 && <NewsHeadlines apiUrl={API_URL} />}
            {subTab === 4 && <RescoreLog history={history} compact={compact} />}
            {subTab === 5 && <Controls compact={compact} />}
          </div>
        </div>

        {/* Right rail — hidden on mobile, 4-col on large screens */}
        <div className="hidden lg:block lg:col-span-4">
          <RightRail
            levels={result?.levels}
            currentPrice={currentPrice}
            nqRatio={nqRatio}
            cascade={cascade}
            dpHistory={dpHistory}
            levelNarratives={levelNarratives}
          />
        </div>
      </div>
    </div>
  )
}
