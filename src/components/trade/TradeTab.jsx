import { useState, useEffect, useRef, useMemo } from 'react'
import { useSSE } from '../../hooks/useSSE'
import { calcPnL } from '../../utils/pnl'
import { evaluateHoldExit } from '../../utils/holdExit'
import ActiveTradePanel from './ActiveTradePanel'
import CascadeHealth from './CascadeHealth'
import HoldExitGuide from './HoldExitGuide'
import TradePriceLadder from './TradePriceLadder'
import TradeEntryForm from './TradeEntryForm'
import InstrumentSelector from './InstrumentSelector'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function TradeTab({ activeSymbol, pendingTrade }) {
  const { rescoreData, priceData, dpHistory, connected } = useSSE(`${API_URL}/stream`)

  const result       = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const currentPrice = priceData?.price ?? result?.current_price
  const cascade      = result?.cascade ?? null

  const [activeTrade, setActiveTrade]       = useState(null)
  const [instrument,  setInstrument]        = useState(activeSymbol === 'NQ' ? 'MNQ' : 'QQQ')
  const [contracts,   setContracts]         = useState(1)
  const [showManualEntry, setShowManualEntry] = useState(false)

  const soundPlayedRef = useRef({ target: false, stop: false, cascade: false })

  // Load active trade on mount
  useEffect(() => {
    fetch(`${API_URL}/trade/active`)
      .then(r => r.json())
      .then(data => { if (data.trade) setActiveTrade(data.trade) })
      .catch(() => {})
  }, [])

  // Auto-show entry form when a pending trade arrives from Scout
  useEffect(() => {
    if (pendingTrade && !activeTrade) setShowManualEntry(true)
  }, [pendingTrade])

  const pnl = activeTrade && currentPrice
    ? calcPnL(activeTrade.direction, activeTrade.entry, currentPrice, activeTrade.instrument || instrument, activeTrade.contracts || contracts)
    : null

  const evaluation = activeTrade && currentPrice
    ? evaluateHoldExit(activeTrade, levels, currentPrice, cascade, dpHistory)
    : null

  // Sound alerts
  useEffect(() => {
    if (!activeTrade || !evaluation) return
    const playTone = (freq, duration = 0.5) => {
      try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)()
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration)
        setTimeout(() => { try { ctx.close() } catch(e) {} }, 1000)
      } catch(e) {}
    }
    if (evaluation.targetHit && !soundPlayedRef.current.target) {
      soundPlayedRef.current.target = true
      ;[523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.4), i * 200))
    }
    const distToStop = currentPrice != null ? Math.abs(currentPrice - activeTrade.stop) : Infinity
    const stopRange  = Math.abs(activeTrade.entry - activeTrade.stop)
    if (stopRange > 0 && distToStop / stopRange < 0.25 && !soundPlayedRef.current.stop) {
      soundPlayedRef.current.stop = true
      ;[440, 370].forEach((f, i) => setTimeout(() => playTone(f, 0.3), i * 200))
    }
    if (cascade?.active && !soundPlayedRef.current.cascade) {
      soundPlayedRef.current.cascade = true
      ;[311, 277, 233].forEach((f, i) => setTimeout(() => playTone(f, 0.4), i * 150))
    }
  }, [evaluation, cascade?.active, currentPrice, activeTrade])

  useEffect(() => {
    soundPlayedRef.current = { target: false, stop: false, cascade: false }
  }, [activeTrade?.id])

  const handleEnterTrade = async (tradeData) => {
    try {
      const payload = { ...tradeData, instrument, contracts, symbol: activeSymbol }
      const res  = await fetch(`${API_URL}/trade/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.trade) { setActiveTrade(data.trade); setShowManualEntry(false) }
    } catch (e) { console.warn('[trade] enter failed:', e.message) }
  }

  const handleExitTrade = async (reason) => {
    try {
      const res  = await fetch(`${API_URL}/trade/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitPrice: currentPrice, exitReason: reason || 'manual' }),
      })
      const data = await res.json()
      if (data.success) setActiveTrade(null)
    } catch (e) { console.warn('[trade] exit failed:', e.message) }
  }

  return (
    <div className="py-3 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Trade</h2>
          <InstrumentSelector
            instrument={instrument}
            contracts={contracts}
            onInstrumentChange={setInstrument}
            onContractsChange={setContracts}
            activeSymbol={activeSymbol}
          />
        </div>

        {activeTrade && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleExitTrade('manual')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded font-medium"
            >
              ✓ Close Trade
            </button>
            <button
              onClick={() => handleExitTrade('stop')}
              className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs rounded font-bold"
            >
              ✗ Stop Out
            </button>
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Left — price ladder */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
          <TradePriceLadder
            levels={levels}
            currentPrice={currentPrice}
            nqRatio={nqRatio}
            activeSymbol={activeSymbol}
            activeTrade={activeTrade}
          />
        </div>

        {/* Right — trade monitor */}
        <div className="space-y-3">
          {activeTrade ? (
            <>
              <ActiveTradePanel
                trade={activeTrade}
                currentPrice={currentPrice}
                pnl={pnl}
                evaluation={evaluation}
                activeSymbol={activeSymbol}
                nqRatio={nqRatio}
              />
              <CascadeHealth cascade={cascade} levels={levels} trade={activeTrade} />
              <HoldExitGuide evaluation={evaluation} />
            </>
          ) : (
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-6 text-center space-y-3">
              <div className="text-gray-700 text-2xl">—</div>
              <div className="text-xs text-gray-500">No active trade</div>
              <div className="text-xs text-gray-700">Use Scout tab to plan a trade, then click "→ Trade This"</div>
              <button
                onClick={() => setShowManualEntry(true)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded font-medium"
              >
                + Manual Entry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Manual entry form */}
      {showManualEntry && (
        <TradeEntryForm
          levels={levels}
          currentPrice={currentPrice}
          nqRatio={nqRatio}
          activeSymbol={activeSymbol}
          instrument={instrument}
          contracts={contracts}
          prefill={pendingTrade}
          onEnter={handleEnterTrade}
          onCancel={() => setShowManualEntry(false)}
        />
      )}
    </div>
  )
}
