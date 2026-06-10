import { useState, useEffect, useMemo } from 'react'
import DpSparkline from '../DpSparkline'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { calcPnL } from '../../utils/pnl'
import { evaluateHoldExit } from '../../utils/holdExit'
import ActiveTradePanel from '../trade/ActiveTradePanel'
import CascadeHealth from '../trade/CascadeHealth'
import HoldExitGuide from '../trade/HoldExitGuide'
import TradeEntryForm from '../trade/TradeEntryForm'
import InstrumentSelector from '../trade/InstrumentSelector'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function RightRail({
  levels, currentPrice, nqPrice, nqRatio,
  dpHistory, levelNarratives,
  cascade, activeSymbol,
  activeTrade, setActiveTrade,
  pendingTrade, onPendingTradeConsumed,
  selectedLevel,
}) {
  const [activeLevel, setActiveLevel]           = useState(null)
  const [userSelected, setUserSelected]         = useState(false)
  const [narrativeExpanded, setNarrativeExpanded] = useState(false)
  const [railMode, setRailMode]                 = useState(activeTrade ? 'trade' : 'evidence')
  const [showEntryForm, setShowEntryForm]       = useState(false)
  const [instrument, setInstrument]             = useState(activeSymbol === 'NQ' ? 'MNQ' : 'QQQ')
  const [contracts, setContracts]               = useState(1)
  const [scoring, setScoring]                   = useState(false)

  // External level selection from PriceLadder
  useEffect(() => {
    if (selectedLevel) {
      setActiveLevel(selectedLevel)
      setUserSelected(true)
    }
  }, [selectedLevel])

  const nearestLevelId = useMemo(() => {
    if (!levels?.length || !currentPrice) return null
    return levels.reduce((nearest, l) => {
      const d  = Math.abs(currentPrice - l.price)
      const nd = Math.abs(currentPrice - nearest.price)
      return d < nd ? l : nearest
    }).id
  }, [currentPrice, levels])

  useEffect(() => {
    if (!userSelected && nearestLevelId) {
      setActiveLevel(nearestLevelId)
    }
  }, [nearestLevelId, userSelected])

  // Auto-switch to trade mode when active trade appears
  useEffect(() => {
    if (activeTrade) setRailMode('trade')
  }, [activeTrade?.id])

  // Open entry form when pendingTrade arrives from Scout
  useEffect(() => {
    if (pendingTrade) {
      setShowEntryForm(true)
      setRailMode('trade')
    }
  }, [pendingTrade])

  const tradeUnit = activeTrade?.priceUnit || activeTrade?.symbol || activeSymbol
  const tradeCurrentPrice = (() => {
    if (tradeUnit === 'NQ' || tradeUnit === 'MNQ') return nqPrice
    if (tradeUnit === 'QQQ') return currentPrice
    if (tradeUnit === 'ES'  || tradeUnit === 'MES') return nqPrice // replace with ES price when available
    return currentPrice
  })()

  const pnl = activeTrade && tradeCurrentPrice
    ? calcPnL(
        activeTrade.direction, activeTrade.entry,
        tradeCurrentPrice,
        activeTrade.instrument || instrument,
        activeTrade.contracts || contracts
      )
    : null

  const evaluation = activeTrade && tradeCurrentPrice
    ? evaluateHoldExit(activeTrade, levels || [], tradeCurrentPrice, cascade, dpHistory)
    : null

  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool ?? 0
  const gap    = Math.abs(-0.700 - midDp)
  const activeLevelData = activeLevel ? levels?.find(l => l.id === activeLevel) : null

  const handleEnterTrade = async (tradeData) => {
    setScoring(true)
    try {
      const res = await fetch(`${API_URL}/trade/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tradeData, instrument, contracts, symbol: activeSymbol }),
      })
      const data = await res.json()
      if (data.trade) {
        setActiveTrade(data.trade)
        setShowEntryForm(false)
        setRailMode('trade')
        onPendingTradeConsumed?.()
      }
    } catch (e) { console.warn('[trade] enter failed:', e.message) }
    setScoring(false)
  }

  const handleExitTrade = async (reason) => {
    try {
      const res = await fetch(`${API_URL}/trade/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitPrice: currentPrice, exitReason: reason || 'manual' }),
      })
      const data = await res.json()
      if (data.success) {
        setActiveTrade(null)
        setRailMode('evidence')
      }
    } catch (e) { console.warn('[trade] exit failed:', e.message) }
  }

  return (
    <div className="space-y-3">

      {/* Mode switcher */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-0.5">
        <button
          onClick={() => setRailMode('evidence')}
          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
            railMode === 'evidence' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setRailMode('trade')}
          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors relative ${
            railMode === 'trade' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Trade
          {activeTrade && (
            <span className="absolute top-0.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
          )}
        </button>
      </div>

      {/* EVIDENCE MODE */}
      {railMode === 'evidence' && (
        <>
          {/* Cascade summary */}
          <div className={`border rounded-lg p-3 ${
            cascade?.active
              ? 'border-red-800 bg-red-950/20'
              : midDp <= -0.500
              ? 'border-amber-800/50 bg-amber-950/10'
              : 'border-gray-800 bg-[#111827]'
          }`}>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Cascade Monitor</div>
            <div className={`text-sm font-bold mb-1 ${
              cascade?.active ? 'text-red-400'
                : midDp <= -0.500 ? 'text-amber-400'
                : 'text-green-400'
            }`}>
              {cascade?.active ? '⚠ ACTIVE' : midDp <= -0.500 ? '⚡ APPROACHING' : '✓ SAFE'}
            </div>
            <div className="text-xs text-gray-400 font-mono">MID dp {midDp.toFixed(3)}</div>
            {!cascade?.active && (
              <div className={`text-xs font-mono mt-0.5 ${midDp <= -0.500 ? 'text-amber-400' : 'text-gray-600'}`}>
                {gap.toFixed(3)} from trigger
              </div>
            )}
          </div>

          {/* Level selector + evidence detail */}
          <div className="border border-gray-800 bg-[#111827] rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Level Evidence</div>

            {userSelected && activeLevel && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-xs text-indigo-400">Showing {activeLevel} evidence</span>
                <button
                  onClick={() => { setUserSelected(false); setActiveLevel(nearestLevelId) }}
                  className="text-xs text-gray-600 hover:text-gray-400 ml-auto"
                >
                  reset
                </button>
              </div>
            )}

            <div className="flex gap-1 mb-3">
              {levels?.map(level => (
                <button
                  key={level.id}
                  onClick={() => {
                    setUserSelected(true)
                    setActiveLevel(activeLevel === level.id ? null : level.id)
                  }}
                  className={`flex-1 py-1 rounded text-xs font-bold transition-all duration-200 ${
                    activeLevel === level.id
                      ? level.classification === 'sell_resistance'
                        ? 'bg-red-800 text-white ring-1 ring-red-500'
                        : level.classification === 'buy_support'
                        ? 'bg-green-800 text-white ring-1 ring-green-500'
                        : 'bg-gray-600 text-white ring-1 ring-gray-400'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {level.id}
                </button>
              ))}
            </div>

            {activeLevelData ? (
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-white">
                    ${activeLevelData.price?.toFixed(2)}
                    {nqRatio && (
                      <span className="text-xs text-gray-500 ml-1">
                        NQ {Math.round(activeLevelData.price * nqRatio).toLocaleString()}
                      </span>
                    )}
                  </span>
                  {currentPrice != null && (
                    <span className="text-xs font-mono text-gray-400">
                      {(currentPrice - activeLevelData.price) >= 0 ? '+' : ''}
                      {(currentPrice - activeLevelData.price).toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span style={{ minWidth: '64px', flexShrink: 0 }}
                        className="text-xs text-gray-600 whitespace-nowrap">
                    Dark Pool
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}
                       className="h-1.5 bg-gray-800 rounded relative overflow-hidden">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-gray-700 z-10" />
                    {(() => {
                      const dp  = activeLevelData.dark_pool || 0
                      const pct = ((dp + 1) / 2) * 100
                      return pct >= 50 ? (
                        <div className="absolute inset-y-0 left-1/2 bg-green-500"
                             style={{ width: `${(pct - 50) * 2}%` }} />
                      ) : (
                        <div className="absolute inset-y-0 right-1/2 bg-red-500"
                             style={{ width: `${(50 - pct) * 2}%` }} />
                      )
                    })()}
                  </div>
                  <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                        className="text-xs font-mono text-gray-400">
                    {activeLevelData.dark_pool?.toFixed(3)}
                  </span>
                </div>

                {dpHistory?.[activeLevelData.id]?.length > 1 && (
                  <div style={{ marginLeft: '72px' }}>
                    <DpSparkline history={dpHistory[activeLevelData.id]} />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span style={{ minWidth: '64px', flexShrink: 0 }}
                        className="text-xs text-gray-600 whitespace-nowrap">
                    Score
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}
                       className="h-1.5 bg-gray-800 rounded overflow-hidden">
                    <div className={`h-full ${
                      activeLevelData.classification === 'sell_resistance' ? 'bg-red-500'
                        : activeLevelData.classification === 'buy_support' ? 'bg-green-500'
                        : 'bg-gray-600'
                    }`}
                         style={{ width: `${Math.min(activeLevelData.score || 0, 100)}%` }} />
                  </div>
                  <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                        className="text-xs font-mono text-gray-400">
                    {activeLevelData.score || 0}/100
                  </span>
                </div>

                <div className={`text-xs font-medium ${
                  activeLevelData.classification === 'sell_resistance' ? 'text-red-400'
                    : activeLevelData.classification === 'buy_support' ? 'text-green-400'
                    : 'text-gray-500'
                }`}>
                  {activeLevelData.classification?.replace('_', ' ').toUpperCase()}
                  {activeLevelData.confidence && activeLevelData.confidence.toLowerCase() !== 'none' && (
                    <span className="text-gray-600 font-normal ml-1">
                      · {activeLevelData.confidence.toLowerCase()}
                    </span>
                  )}
                </div>

                {activeLevelData.full_stack && (
                  <div className="text-xs text-yellow-400 font-bold">★ FULL STACK</div>
                )}

                {levelNarratives?.[activeLevelData.id] && (
                  <div className="border-t border-gray-800 pt-2 mt-1">
                    <p className={`text-xs text-gray-300 leading-relaxed italic border-l-2 border-purple-900 pl-2 ${narrativeExpanded ? '' : 'line-clamp-4'}`}>
                      {stripMarkdown(levelNarratives[activeLevelData.id])}
                    </p>
                    {levelNarratives[activeLevelData.id].length > 300 && (
                      <button
                        onClick={() => setNarrativeExpanded(!narrativeExpanded)}
                        className="text-xs text-purple-700 hover:text-purple-500 mt-1"
                      >
                        {narrativeExpanded ? '▲ less' : '▼ more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-700 text-center py-2">Select a level to see evidence</p>
            )}
          </div>

          {/* Active signals summary */}
          <div className="border border-gray-800 bg-[#111827] rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Signals</div>
            <div className="space-y-1">
              {levels?.filter(l => l.classification !== 'no_edge').map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold shrink-0 ${
                    l.classification === 'sell_resistance' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {l.id}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {l.classification?.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono text-gray-600 shrink-0">
                    DP {l.dark_pool?.toFixed(3)}
                  </span>
                </div>
              ))}
              {!levels?.some(l => l.classification !== 'no_edge') && (
                <p className="text-xs text-gray-700">No classified levels</p>
              )}
            </div>
          </div>

          {/* Enter trade button */}
          <button
            onClick={() => { setShowEntryForm(true); setRailMode('trade') }}
            className="w-full py-2 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
          >
            + Enter Trade
          </button>
        </>
      )}

      {/* TRADE MODE */}
      {railMode === 'trade' && (
        <>
          {!activeTrade && (
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-3">
              <InstrumentSelector
                instrument={instrument}
                contracts={contracts}
                onInstrumentChange={setInstrument}
                onContractsChange={setContracts}
                activeSymbol={activeSymbol}
              />
            </div>
          )}

          {showEntryForm && !activeTrade && (
            <TradeEntryForm
              levels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              activeSymbol={activeSymbol}
              instrument={instrument}
              contracts={contracts}
              prefill={pendingTrade}
              onEnter={handleEnterTrade}
              onCancel={() => { setShowEntryForm(false); setRailMode('evidence') }}
            />
          )}

          {activeTrade && (
            <>
              <ActiveTradePanel
                trade={activeTrade}
                currentPrice={tradeCurrentPrice}
                pnl={pnl}
                evaluation={evaluation}
                activeSymbol={activeSymbol}
              />
              <CascadeHealth cascade={cascade} levels={levels} trade={activeTrade} />
              <HoldExitGuide evaluation={evaluation} />
              <div className="flex gap-2">
                <button
                  onClick={() => handleExitTrade('manual')}
                  className="flex-1 py-2 rounded text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white"
                >
                  ✓ Close
                </button>
                <button
                  onClick={() => handleExitTrade('stop')}
                  className="flex-1 py-2 rounded text-xs font-bold bg-red-800 hover:bg-red-700 text-white"
                >
                  ✗ Stop Out
                </button>
              </div>
              <button
                onClick={() => setRailMode('evidence')}
                className="w-full py-1.5 rounded text-xs text-gray-600 hover:text-gray-400 border border-gray-800"
              >
                View Level Evidence
              </button>
            </>
          )}

          {!activeTrade && !showEntryForm && (
            <div className="text-center py-6">
              <div className="text-gray-700 mb-2">No active trade</div>
              <button
                onClick={() => setShowEntryForm(true)}
                className="text-xs text-indigo-500 hover:text-indigo-400"
              >
                + Manual entry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
