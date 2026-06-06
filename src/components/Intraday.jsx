import { useState, useMemo } from 'react'
import { useSSE } from '../hooks/useSSE'
import { useLayout } from '../context/LayoutContext'
import { useAuth } from '../context/AuthContext'
import PriceLadder from './intraday/PriceLadder'
import DarkPoolChart from './intraday/DarkPoolChart'
import EtfTideChart from './intraday/EtfTideChart'
import RescoreLog from './intraday/RescoreLog'
import Controls from './intraday/Controls'
import ExpansionGexAlert from './intraday/ExpansionGexAlert'
import CascadeProximityGauge from './intraday/CascadeProximityGauge'
import NarrativeBlock from './intraday/NarrativeBlock'
import LivePrice from './intraday/LivePrice'
import SentimentBadge from './SentimentBadge'
import NewsHeadlines from './intraday/NewsHeadlines'

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
  } = useSSE(`${API_URL}/stream`)

  const { compact, toggle } = useLayout()
  const { unlocked, authPost } = useAuth()
  const sentiment     = rescoreData?.sentiment ?? rescoreData?.result?._sentiment ?? null
  const [subTab, setSubTab]   = useState(0)
  const [drawing, setDrawing] = useState(null)    // null | 'qqq' | 'both'
  const [drawResult, setDrawResult] = useState(null) // null | 'success' | 'error'

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

  const drawBtnClass = (type) => {
    const base = 'px-2 py-1 rounded text-xs font-medium transition-colors'
    if (!unlocked)                return `${base} bg-gray-800 text-gray-600 cursor-not-allowed`
    if (drawing === type)         return `${base} bg-gray-700 text-gray-400 cursor-wait`
    if (drawResult === 'success') return `${base} bg-green-800 text-green-300`
    if (drawResult === 'error')   return `${base} bg-red-800 text-red-300`
    return `${base} bg-gray-700 text-gray-300 hover:bg-gray-600`
  }

  const drawLabel = (type) => {
    if (!unlocked)                return type === 'qqq' ? '🔒 Draw QQQ' : '🔒 Draw Both'
    if (drawing === type)         return '⟳ Drawing…'
    if (drawResult === 'success') return '✓ Done'
    if (drawResult === 'error')   return '✗ Failed'
    return type === 'qqq' ? '📊 Draw QQQ' : '📊 Draw Both'
  }

  // Rescore-derived values — only recompute when rescoreData changes (not on price ticks)
  const result     = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const nqRatio    = useMemo(() => result?.nq_ratio ? Number(result.nq_ratio) : null, [result])
  const cascade    = useMemo(() => result?.cascade ?? rescoreData?.cascade ?? null, [rescoreData, result])
  const lastUpdate = useMemo(() => rescoreData?.timestamp ?? null, [rescoreData])

  // Current price — from live price ticks OR most recent rescore
  const currentPrice = priceData?.price ?? result?.current_price

  // NarrativeBlock handles its own fallback — pass raw narrative + result

  if (!connected && !rescoreData && !priceData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm animate-pulse">Connecting to live data…</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-4'}`}>

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {connected ? 'LIVE' : 'RECONNECTING...'}
          </span>
          {/* LivePrice is memo'd — only re-renders when priceData or nqRatio changes */}
          <LivePrice priceData={priceData} nqRatio={nqRatio} />
          <SentimentBadge sentiment={sentiment} compact={true} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => triggerDraw('qqq')}
            disabled={!unlocked || !!drawing}
            className={drawBtnClass('qqq')}
            title="Triggers fresh scoring and dashboard update. Run /draw-qqq in Claude Code to update chart labels."
          >
            {drawLabel('qqq')}
          </button>
          <button
            onClick={() => triggerDraw('both')}
            disabled={!unlocked || !!drawing}
            className={drawBtnClass('both')}
            title="Triggers fresh scoring and dashboard update. Run /draw in Claude Code to update both chart labels."
          >
            {drawLabel('both')}
          </button>
          <button
            onClick={toggle}
            className="text-xs text-gray-400 border border-gray-600 px-2 py-1 rounded hover:text-white transition-colors"
          >
            {compact ? '⛶ Full' : '⊡ Compact'}
          </button>
        </div>
      </div>

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

      {/* Expansion GEX alert — memo'd, stable on price ticks */}
      <ExpansionGexAlert expansionGex={expansionGex} pinningSessions={pinningSessions} />

      {/* Cascade proximity gauge — memo'd */}
      <CascadeProximityGauge cascade={cascade} midDpHistory={midDpHistory} />

      {/* Auto narrative — memo'd */}
      <NarrativeBlock narrative={narrative} result={result} lastUpdate={lastUpdate} compact={compact} narrativeMode={narrativeMode} tacticalBrief={tacticalBrief} />

      {/* Sub-tab navigation */}
      <div className="flex gap-1 flex-wrap">
        {(compact ? SUB_TABS_COMPACT : SUB_TABS).map((tab, i) => (
          <button
            key={i}
            onClick={() => setSubTab(i)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              subTab === i ? 'bg-teal-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className={compact ? 'min-h-[400px]' : 'min-h-[600px]'}>
        {subTab === 0 && <PriceLadder result={result} currentPrice={currentPrice} nqRatio={nqRatio} compact={compact} dpHistory={dpHistory} scoredAt={rescoreData?.result?.scored_at || rescoreData?.timestamp} levelNarratives={levelNarratives} />}
        {subTab === 1 && <DarkPoolChart history={history} compact={compact} />}
        {subTab === 2 && <EtfTideChart history={history} compact={compact} />}
        {subTab === 3 && <NewsHeadlines apiUrl={API_URL} />}
        {subTab === 4 && <RescoreLog history={history} compact={compact} />}
        {subTab === 5 && <Controls compact={compact} />}
      </div>
    </div>
  )
}
