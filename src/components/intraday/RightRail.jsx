import { useState, useEffect, useMemo } from 'react'
import { levelNq } from '../../utils/levelNq'
import DpSparkline from '../DpSparkline'
import { stripMarkdown } from '../../utils/stripMarkdown'
import { formatNarrative } from '../../utils/formatNarrative'
import { calcPnL } from '../../utils/pnl'
import { evaluateHoldExit } from '../../utils/holdExit'
import ActiveTradePanel from '../trade/ActiveTradePanel'
import CascadeHealth from '../trade/CascadeHealth'
import HoldExitGuide from '../trade/HoldExitGuide'
import TradeEntryForm from '../trade/TradeEntryForm'
import InstrumentSelector from '../trade/InstrumentSelector'
import ClassificationChip from '../ClassificationChip'
import { CASCADE_TRIGGER, CASCADE_WATCH } from '../../utils/cascade'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function RightRail({
  levels, currentPrice, nqPrice, nqRatio,
  dpHistory, levelNarratives,
  cascade, activeSymbol,
  activeTrade, setActiveTrades,
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

  useEffect(() => {
    if (activeTrade) setRailMode('trade')
  }, [activeTrade?.id])

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
    if (tradeUnit === 'ES'  || tradeUnit === 'MES') return nqPrice
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
  const gap    = Math.abs(CASCADE_TRIGGER - midDp)
  const activeLevelData = activeLevel ? levels?.find(l => l.id === activeLevel) : null

  const handleEnterTrade = async (tradeData) => {
    setScoring(true)
    try {
      const res = await fetch(`${API_URL}/trade/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tradeData, instrument, contracts, symbol: activeSymbol, priceUnit: activeSymbol }),
      })
      const data = await res.json()
      if (data.trade) {
        setActiveTrades(prev => ({ ...prev, [activeSymbol]: data.trade }))
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
        body: JSON.stringify({ symbol: activeSymbol, exitPrice: currentPrice, exitReason: reason || 'manual' }),
      })
      const data = await res.json()
      if (data.success) {
        setActiveTrades(prev => ({ ...prev, [activeSymbol]: null }))
        setRailMode('evidence')
      }
    } catch (e) { console.warn('[trade] exit failed:', e.message) }
  }

  return (
    <div className="space-y-3">

      <div className="flex gap-1 bg-bg-elevated/50 rounded-lg p-0.5">
        <button
          onClick={() => setRailMode('evidence')}
          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
            railMode === 'evidence' ? 'bg-bg-card text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setRailMode('trade')}
          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors relative ${
            railMode === 'trade' ? 'bg-bg-card text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Trade
          {activeTrade && (
            <span className="absolute top-0.5 right-1.5 w-1.5 h-1.5 rounded-full bg-state-hold" />
          )}
        </button>
      </div>

      {/* EVIDENCE MODE */}
      {railMode === 'evidence' && (
        <>
          <div className={`border rounded-lg p-3 ${
            cascade?.active
              ? 'border-state-stop bg-state-stopSoft'
              : midDp <= CASCADE_WATCH
              ? 'border-state-cascadeWatch/50 bg-state-cascadeWatchSoft'
              : 'border-border-subtle bg-bg-card'
          }`}>
            <div className="text-micro text-text-tertiary uppercase tracking-wider mb-2">Cascade Monitor</div>
            <div className={`text-sm font-bold mb-1 ${
              cascade?.active ? 'text-state-stop'
                : midDp <= CASCADE_WATCH ? 'text-state-cascadeWatch'
                : 'text-state-hold'
            }`}>
              {cascade?.active ? '⚠ ACTIVE' : midDp <= CASCADE_WATCH ? '⚡ APPROACHING' : '✓ SAFE'}
            </div>
            <div className="text-xs text-text-secondary font-price">MID dp {midDp.toFixed(3)}</div>
            {!cascade?.active && (
              <div className={`text-xs font-price mt-0.5 ${midDp <= CASCADE_WATCH ? 'text-state-cascadeWatch' : 'text-text-muted'}`}>
                {gap.toFixed(3)} from trigger
              </div>
            )}
          </div>

          <div className="border border-border-subtle bg-bg-card rounded-lg p-3">
            <div className="text-micro text-text-tertiary uppercase tracking-wider mb-2">Level Evidence</div>

            {userSelected && activeLevel && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-continuation" />
                <span className="text-xs text-signal-continuation">Showing {activeLevel} evidence</span>
                <button
                  onClick={() => { setUserSelected(false); setActiveLevel(nearestLevelId) }}
                  className="text-xs text-text-muted hover:text-text-secondary ml-auto"
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
                        ? 'bg-signal-resistanceSoft text-signal-resistance ring-1 ring-signal-resistance/50'
                        : level.classification === 'buy_support'
                        ? 'bg-signal-supportSoft text-signal-support ring-1 ring-signal-support/50'
                        : 'bg-bg-card2 text-text-secondary ring-1 ring-border-default'
                      : 'bg-bg-elevated text-text-secondary hover:bg-bg-card2'
                  }`}
                >
                  {level.id}
                </button>
              ))}
            </div>

            {activeLevelData ? (
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-text-primary font-price">
                    {activeSymbol === 'NQ' && nqRatio
                      ? '$' + (levelNq(activeLevelData, nqRatio)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '$' + (activeLevelData.price?.toFixed(2) ?? '—')}
                  </span>
                  {currentPrice != null && (
                    <span className="text-xs font-price text-text-secondary">
                      {(() => {
                        const rawDist = currentPrice - activeLevelData.price
                        const sign = rawDist >= 0 ? '+' : '-'
                        const val = activeSymbol === 'NQ' && nqRatio
                          ? Math.round(Math.abs(rawDist) * nqRatio * 4) / 4
                          : Math.abs(rawDist)
                        return `${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      })()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span style={{ minWidth: '64px', flexShrink: 0 }}
                        className="text-xs text-text-muted whitespace-nowrap">
                    Dark Pool
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}
                       className="h-1.5 bg-bg-elevated rounded relative overflow-hidden">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-text-disabled z-10" />
                    {(() => {
                      const dp  = activeLevelData.dark_pool || 0
                      const pct = ((dp + 1) / 2) * 100
                      return pct >= 50 ? (
                        <div className="absolute inset-y-0 left-1/2 bg-signal-support"
                             style={{ width: `${(pct - 50) * 2}%` }} />
                      ) : (
                        <div className="absolute inset-y-0 right-1/2 bg-signal-resistance"
                             style={{ width: `${(50 - pct) * 2}%` }} />
                      )
                    })()}
                  </div>
                  <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                        className="text-xs font-price text-text-secondary">
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
                        className="text-xs text-text-muted whitespace-nowrap">
                    Score
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}
                       className="h-1.5 bg-bg-elevated rounded overflow-hidden">
                    <div className={`h-full ${
                      activeLevelData.classification === 'sell_resistance' ? 'bg-signal-resistance'
                        : activeLevelData.classification === 'buy_support' ? 'bg-signal-support'
                        : 'bg-signal-neutral'
                    }`}
                         style={{ width: `${Math.min(activeLevelData.score || 0, 100)}%` }} />
                  </div>
                  <span style={{ minWidth: '44px', flexShrink: 0, textAlign: 'right' }}
                        className="text-xs font-price text-text-secondary">
                    {activeLevelData.score || 0}/100
                  </span>
                </div>

                <ClassificationChip classification={activeLevelData.classification} confidence={activeLevelData.confidence} level={activeLevelData} />

                {activeLevelData.full_stack && (
                  <div className="text-xs text-accent-price font-bold">★ FULL STACK</div>
                )}

                {levelNarratives?.[activeLevelData.id] && (
                  <div className="border-t border-border-subtle pt-2 mt-1">
                    <p className={`text-xs text-text-secondary leading-relaxed italic border-l-2 border-accent-ai/50 pl-2 ${narrativeExpanded ? '' : 'line-clamp-4'}`}>
                      {formatNarrative(stripMarkdown(levelNarratives[activeLevelData.id]), activeSymbol)}
                    </p>
                    {levelNarratives[activeLevelData.id].length > 300 && (
                      <button
                        onClick={() => setNarrativeExpanded(!narrativeExpanded)}
                        className="text-xs text-accent-ai/60 hover:text-accent-ai mt-1"
                      >
                        {narrativeExpanded ? '▲ less' : '▼ more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-disabled text-center py-2">Select a level to see evidence</p>
            )}
          </div>

          <div className="border border-border-subtle bg-bg-card rounded-lg p-3">
            <div className="text-micro text-text-tertiary uppercase tracking-wider mb-2">Active Signals</div>
            <div className="space-y-1">
              {levels?.filter(l => l.classification !== 'no_edge').map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  {/* Structural name neutral; bias on the chip */}
                  <span className="text-xs font-bold shrink-0 text-text-tertiary">{l.id}</span>
                  <ClassificationChip classification={l.classification} confidence={l.confidence} level={l} size="xs" />
                  <span className="text-xs font-price text-text-muted shrink-0">
                    DP {l.dark_pool?.toFixed(3)}
                  </span>
                </div>
              ))}
              {!levels?.some(l => l.classification !== 'no_edge') && (
                <p className="text-xs text-text-disabled">No classified levels</p>
              )}
            </div>
          </div>

          <button
            onClick={() => { setShowEntryForm(true); setRailMode('trade') }}
            className="w-full py-2 rounded text-xs font-medium bg-bg-elevated hover:bg-bg-card2 text-text-secondary hover:text-text-primary transition-colors border border-border-default"
          >
            + Enter Trade
          </button>
        </>
      )}

      {/* TRADE MODE */}
      {railMode === 'trade' && (
        <>
          {!activeTrade && (
            <div className="bg-bg-card border border-border-subtle rounded-lg p-3">
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
              {evaluation && (
                <div className={`border rounded-lg px-3 py-2 flex items-center gap-2 ${
                  evaluation.verdictColor === 'red'   ? 'bg-state-stopSoft border-state-stop'
                  : evaluation.verdictColor === 'amber' ? 'bg-state-cascadeWatchSoft border-state-cascadeWatch'
                  : 'bg-state-holdSoft border-state-hold'
                }`}>
                  <span className={`text-sm font-bold ${
                    evaluation.verdictColor === 'red'   ? 'text-state-stop'
                    : evaluation.verdictColor === 'amber' ? 'text-state-cascadeWatch'
                    : 'text-state-hold'
                  }`}>
                    {evaluation.verdictLabel}
                  </span>
                  {pnl && (
                    <span className={`text-xs font-price ml-auto ${pnl.isProfit ? 'text-state-hold' : 'text-state-stop'}`}>
                      {pnl.dollarsStr}
                    </span>
                  )}
                </div>
              )}
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
                  className="flex-1 py-2 rounded text-xs font-bold bg-bg-elevated hover:bg-bg-card2 text-text-primary border border-border-default"
                >
                  ✓ Close
                </button>
                <button
                  onClick={() => handleExitTrade('stop')}
                  className="flex-1 py-2 rounded text-xs font-bold bg-state-stopSoft hover:bg-state-stop/30 text-state-stop border border-state-stop/60"
                >
                  ✗ Stop Out
                </button>
              </div>
              <button
                onClick={() => setRailMode('evidence')}
                className="w-full py-1.5 rounded text-xs text-text-muted hover:text-text-secondary border border-border-subtle"
              >
                View Level Evidence
              </button>
            </>
          )}

          {!activeTrade && !showEntryForm && (
            <div className="text-center py-6">
              <div className="text-text-disabled mb-2">No active trade</div>
              <button
                onClick={() => setShowEntryForm(true)}
                className="text-xs text-signal-continuation hover:text-signal-continuation/80"
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
