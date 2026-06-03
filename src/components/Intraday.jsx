import { useState } from 'react'
import { useSSE } from '../hooks/useSSE'
import { useLayout } from '../context/LayoutContext'
import PriceLadder from './intraday/PriceLadder'
import DarkPoolChart from './intraday/DarkPoolChart'
import EtfTideChart from './intraday/EtfTideChart'
import RescoreLog from './intraday/RescoreLog'
import Controls from './intraday/Controls'
import ExpansionGexAlert from './intraday/ExpansionGexAlert'
import CascadeProximityGauge from './intraday/CascadeProximityGauge'

const SUB_TABS         = ['Price Ladder', 'Dark Pool', 'ETF Tide', 'Log', 'Controls']
const SUB_TABS_COMPACT = ['PL', 'DP', 'ETF', 'Log', 'Ctrl']

export default function Intraday() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const { lastEvent, connected, history, levelAlert, clearLevelAlert, chartStale, staleChanges, expansionGex, pinningSessions, midDpHistory } = useSSE(`${API_URL}/stream`)
  const { compact, toggle } = useLayout()
  const [subTab, setSubTab] = useState(0)

  const result       = lastEvent?.type === 'rescore' ? lastEvent.result : null
  const currentPrice = lastEvent?.price ?? result?.current_price
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const cascade      = result?.cascade ?? lastEvent?.cascade ?? null

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-4'}`}>

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {connected ? 'LIVE' : 'RECONNECTING...'}
          </span>
          {currentPrice != null && (
            <span className="text-white font-mono font-bold">
              QQQ ${Number(currentPrice).toFixed(2)}
            </span>
          )}
        </div>
        <button
          onClick={toggle}
          className="text-xs text-gray-400 border border-gray-600 px-2 py-1 rounded hover:text-white transition-colors"
        >
          {compact ? '⛶ Full' : '⊡ Compact'}
        </button>
      </div>

      {/* Chart stale badge */}
      {chartStale && (() => {
        const isCritical = staleChanges.some(c => c.type === 'cascade')
        return (
          <div className={`flex items-center gap-2 border rounded px-3 py-1.5 ${
            isCritical
              ? 'bg-red-900/80 border-red-500 animate-pulse'
              : 'bg-amber-900/80 border-amber-500'
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
            <span className={`text-xs ml-1 shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
              — run /draw
            </span>
          </div>
        )
      })()}

      {/* $2.50 move alert banner */}
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
            <button
              onClick={clearLevelAlert}
              className="text-amber-600 hover:text-amber-300 text-sm leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Expansion GEX alert */}
      <ExpansionGexAlert expansionGex={expansionGex} pinningSessions={pinningSessions} />

      {/* Cascade proximity gauge */}
      <CascadeProximityGauge cascade={cascade} midDpHistory={midDpHistory} />

      {/* Sub-tab navigation */}
      <div className="flex gap-1 flex-wrap">
        {(compact ? SUB_TABS_COMPACT : SUB_TABS).map((tab, i) => (
          <button
            key={i}
            onClick={() => setSubTab(i)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              subTab === i
                ? 'bg-teal-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className={compact ? 'min-h-[400px]' : 'min-h-[600px]'}>
        {subTab === 0 && <PriceLadder result={result} currentPrice={currentPrice} nqRatio={nqRatio} compact={compact} />}
        {subTab === 1 && <DarkPoolChart history={history} compact={compact} />}
        {subTab === 2 && <EtfTideChart history={history} compact={compact} />}
        {subTab === 3 && <RescoreLog history={history} compact={compact} />}
        {subTab === 4 && <Controls compact={compact} />}
      </div>
    </div>
  )
}
