import { useState } from 'react'
import { Zap, RefreshCw, TrendingUp, TrendingDown, Minus, Target, Shield } from 'lucide-react'
import { INSTRUMENTS } from '../../utils/pnl'

const API_URL = import.meta.env.VITE_API_URL || 'https://uw-dashboard-api-production.up.railway.app'

export default function CatalystTab({
  levels, currentPrice, nqRatio,
  activeSymbol, activeTrades, setActiveTrades,
  onEnterTrade,
}) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [mode, setMode]           = useState('normal')
  const [maxRisk, setMaxRisk]     = useState(50)
  const [instrument, setInstrument] = useState(activeSymbol === 'NQ' ? 'MNQ' : 'QQQ')

  const isNQ = activeSymbol === 'NQ'
  const ratio = nqRatio || 41.14

  const fmt = (p) => {
    if (p == null) return '—'
    if (isNQ) {
      const nq = Math.round(p * ratio * 4) / 4
      return '$' + nq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return `$${p.toFixed(2)}`
  }

  const fmtDist = (d) => {
    if (d == null || isNaN(d)) return '—'
    const v = isNQ ? Math.round(Math.abs(d) * ratio * 4) / 4 : Math.abs(d)
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleFetch = async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API_URL}/catalyst/fetch`, { method: 'POST' })
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError('Fetch failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Level references
  const sorted = [...(data?.levels || levels || [])].sort((a, b) => b.price - a.price)
  const r2  = sorted.find(l => l.id === 'R2')
  const r1  = sorted.find(l => l.id === 'R1')
  const mid = sorted.find(l => l.id === 'MID')
  const s1  = sorted.find(l => l.id === 'S1')
  const s2  = sorted.find(l => l.id === 'S2')

  const price = data?.currentPrice || currentPrice

  // Contract sizing for speculative mode
  function calcSpecContracts(entryQqq, stopQqq) {
    const inst = INSTRUMENTS[instrument]
    if (!inst) return 1
    const riskPerContract = Math.abs(entryQqq - stopQqq) * inst.pointValue
    return Math.max(1, Math.floor(maxRisk / riskPerContract))
  }

  // Upside: entry R1, target R2, stop MID
  const upEntry  = r1?.price
  const upTarget = r2?.price
  const upStop   = mid?.price
  const upEntryQqq = upEntry ? (isNQ ? upEntry * ratio : upEntry) : null
  const upStopQqq  = upStop  ? (isNQ ? upStop  * ratio : upStop)  : null
  const upContracts = (upEntryQqq && upStopQqq) ? calcSpecContracts(upEntryQqq, upStopQqq) : 1
  const upPtVal  = INSTRUMENTS[instrument]?.pointValue || 1
  const upRisk   = (upEntry && upStop)   ? Math.abs(upEntry  - upStop)  * (isNQ ? ratio : 1) * upPtVal * upContracts : null
  const upGain   = (upEntry && upTarget) ? Math.abs(upTarget - upEntry) * (isNQ ? ratio : 1) * upPtVal * upContracts : null
  const upRR     = (upRisk && upGain)    ? (upGain / upRisk).toFixed(1) : null

  // Downside: entry S1, target S2, stop MID
  const dnEntry  = s1?.price
  const dnTarget = s2?.price
  const dnStop   = mid?.price
  const dnEntryQqq = dnEntry ? (isNQ ? dnEntry * ratio : dnEntry) : null
  const dnStopQqq  = dnStop  ? (isNQ ? dnStop  * ratio : dnStop)  : null
  const dnContracts = (dnEntryQqq && dnStopQqq) ? calcSpecContracts(dnEntryQqq, dnStopQqq) : 1
  const dnPtVal  = INSTRUMENTS[instrument]?.pointValue || 1
  const dnRisk   = (dnEntry && dnStop)   ? Math.abs(dnEntry  - dnStop)  * (isNQ ? ratio : 1) * dnPtVal * dnContracts : null
  const dnGain   = (dnEntry && dnTarget) ? Math.abs(dnTarget - dnEntry) * (isNQ ? ratio : 1) * dnPtVal * dnContracts : null
  const dnRR     = (dnRisk && dnGain)    ? (dnGain / dnRisk).toFixed(1) : null

  const score    = data?.score
  const biasUp   = score?.direction === 'UP'
  const biasDown = score?.direction === 'DOWN'

  function toNqPrice(p) {
    return p != null ? Math.round(p * ratio * 4) / 4 : null
  }

  return (
    <div className="py-3 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-state-cascadeWatch" />
          <h2 className="text-lg2 font-bold text-text-primary">Catalyst</h2>
          <span className="text-micro text-text-muted uppercase tracking-wider">News Event Trading</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-bg-card2 rounded-lg p-0.5">
            <button
              onClick={() => setMode('normal')}
              className={`px-3 py-1.5 rounded text-micro font-bold transition-colors ${
                mode === 'normal' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setMode('speculative')}
              className={`px-3 py-1.5 rounded text-micro font-bold transition-colors ${
                mode === 'speculative'
                  ? 'bg-state-cascadeWatchSoft text-state-cascadeWatch'
                  : 'text-text-muted'
              }`}
            >
              ⚡ Speculative
            </button>
          </div>
        </div>
      </div>

      {/* Speculative mode config */}
      {mode === 'speculative' && (
        <div className="bg-state-cascadeWatchSoft border border-state-cascadeWatch/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-micro font-bold text-state-cascadeWatch uppercase tracking-wider">
              ⚡ Speculative Mode
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm2 text-text-secondary">Max Risk $</span>
              <input
                type="number"
                value={maxRisk}
                onChange={e => setMaxRisk(parseFloat(e.target.value) || 50)}
                step="25" min="25" max="500"
                className="bg-bg-elevated text-text-primary font-price text-sm2 rounded px-2 py-1 border border-border-default focus:border-state-cascadeWatch focus:outline-none w-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm2 text-text-secondary">Instrument</span>
              <select
                value={instrument}
                onChange={e => setInstrument(e.target.value)}
                className="bg-bg-elevated text-text-primary text-sm2 rounded px-2 py-1 border border-border-default focus:outline-none"
              >
                {activeSymbol === 'NQ' ? (
                  <>
                    <option value="MNQ">MNQ ($2/pt)</option>
                    <option value="NQ">NQ ($20/pt)</option>
                  </>
                ) : (
                  <option value="QQQ">QQQ</option>
                )}
              </select>
            </div>
            <div className="text-sm2 text-text-muted">Contracts auto-calculated from max risk</div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Column 1 — Price in range */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
          <div className="text-micro font-semibold text-text-tertiary uppercase tracking-wider mb-3">
            Current Position in Range
          </div>

          <div className="space-y-2 font-price">
            {[r2, r1, mid, s1, s2].filter(Boolean).map(level => {
              const isAbove = price != null && level.price > price
              const dist    = price != null ? Math.abs(level.price - price) : null
              const isCurrent = dist != null && dist < 1.0
              return (
                <div key={level.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                  isCurrent
                    ? 'border-accent-price/50 bg-accent-priceSoft'
                    : level.classification === 'sell_resistance'
                    ? 'border-signal-resistance/30 bg-signal-resistanceSoft'
                    : level.classification === 'buy_support'
                    ? 'border-signal-support/30 bg-signal-supportSoft'
                    : 'border-border-subtle bg-bg-card2'
                }`}>
                  <span className={`text-sm2 font-bold ${
                    level.classification === 'sell_resistance' ? 'text-signal-resistance'
                    : level.classification === 'buy_support'  ? 'text-signal-support'
                    : level.id === 'MID' ? 'text-signal-continuation'
                    : 'text-text-tertiary'
                  }`}>
                    {level.id}
                  </span>
                  <span className="text-sm2 text-text-primary">{fmt(level.price)}</span>
                  {isCurrent ? (
                    <span className="text-micro text-accent-price font-bold">▶ NOW</span>
                  ) : (
                    <span className="text-micro text-text-muted">
                      {isAbove ? '+' : '-'}{fmtDist(dist)}
                    </span>
                  )}
                </div>
              )
            })}

            {price != null && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-2 border-accent-price/60 bg-accent-priceSoft rounded-lg">
                <span className="text-sm2 font-bold text-accent-price">▶ NOW</span>
                <span className="text-md2 font-price font-bold text-text-primary">{fmt(price)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2 — Flow Analysis */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-micro font-semibold text-text-tertiary uppercase tracking-wider">
              Flow Analysis
            </div>
            <button
              onClick={handleFetch}
              disabled={loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-micro font-bold transition-colors ${
                loading
                  ? 'bg-bg-card2 text-text-muted'
                  : 'bg-state-cascadeWatchSoft text-state-cascadeWatch hover:bg-state-cascadeWatch hover:text-bg-base'
              }`}
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Fetching...' : 'Fetch Data'}
            </button>
          </div>

          {!data && !loading && !error && (
            <div className="text-center py-8">
              <Zap size={24} className="text-text-disabled mx-auto mb-2" />
              <p className="text-sm2 text-text-muted">Press Fetch Data to analyze current flow conditions</p>
              <p className="text-micro text-text-disabled mt-1">Use before any news event</p>
            </div>
          )}

          {error && (
            <div className="text-sm2 text-state-stop py-4 text-center">{error}</div>
          )}

          {data && (
            <div className="space-y-2">
              <div className="text-micro text-text-muted mb-2">
                Fetched {new Date(data.fetchedAt).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit'
                })} ET
              </div>

              {score?.factors?.map((f, i) => {
                const noData = f.available === false
                return (
                <div key={i} className={`flex items-start gap-3 py-2 border-b border-border-subtle ${noData ? 'opacity-50' : ''}`}>
                  <div className="shrink-0 mt-0.5">
                    {noData                  ? <Minus        size={12} className="text-text-disabled" />
                    : f.vote === 'UP'        ? <TrendingUp   size={12} className="text-signal-support" />
                    : f.vote === 'DOWN'      ? <TrendingDown size={12} className="text-signal-resistance" />
                    : f.vote === 'EXPANSION' ? <Zap          size={12} className="text-state-cascadeWatch" />
                    :                          <Minus        size={12} className="text-text-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm2 font-medium ${noData ? 'text-text-disabled' : 'text-text-secondary'}`}>{f.name}</span>
                      <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${
                        noData                 ? 'bg-bg-card2 text-text-disabled'
                        : f.vote === 'UP'        ? 'bg-signal-supportSoft text-signal-support'
                        : f.vote === 'DOWN'    ? 'bg-signal-resistanceSoft text-signal-resistance'
                        : f.vote === 'EXPANSION' ? 'bg-state-cascadeWatchSoft text-state-cascadeWatch'
                        : 'bg-bg-card2 text-text-muted'
                      }`}>
                        {f.vote}
                      </span>
                    </div>
                    <div className="text-micro text-text-muted mt-0.5">{f.note}</div>
                  </div>
                  <span className={`text-micro shrink-0 ${f.weight === 'HIGH' ? 'text-text-tertiary' : 'text-text-disabled'}`}>
                    {f.weight}
                  </span>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Column 3 — Trade Setups */}
        <div className="space-y-3">

          {/* Directional bias */}
          {score && (
            <div className={`border rounded-lg p-4 ${
              biasUp   ? 'border-signal-support/40 bg-signal-supportSoft'
              : biasDown ? 'border-signal-resistance/40 bg-signal-resistanceSoft'
              : 'border-border-default bg-bg-card'
            }`}>
              <div className="text-micro font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Directional Bias
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {biasUp    ? <TrendingUp   size={20} className="text-signal-support" />
                  : biasDown ? <TrendingDown size={20} className="text-signal-resistance" />
                  :            <Minus        size={20} className="text-text-muted" />}
                  <span className={`text-lg2 font-bold ${
                    biasUp ? 'text-signal-support' : biasDown ? 'text-signal-resistance' : 'text-text-muted'
                  }`}>
                    {score.direction === 'UP' ? 'BULLISH' : score.direction === 'DOWN' ? 'BEARISH' : 'NEUTRAL'}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xl2 font-bold font-price text-text-primary">{score.confidence}/10</div>
                  <div className={`text-micro ${score.degraded ? 'text-state-cascadeWatch' : 'text-text-muted'}`}>
                    {score.degraded
                      ? `confidence · ${score.factorsAvailable} of ${score.factorsTotal} factors`
                      : 'confidence'}
                  </div>
                </div>
              </div>
              <div className="text-sm2 text-text-secondary mt-2">{score.summary}</div>
              {score.gexNote === 'expansion' && (
                <div className="flex items-center gap-1.5 mt-2 text-sm2 text-state-cascadeWatch">
                  <Zap size={12} />
                  GEX expansion — move may accelerate through levels
                </div>
              )}
            </div>
          )}

          {/* Bullish setup */}
          <SetupCard
            label="Bullish Setup"
            direction="long"
            icon={<TrendingUp size={14} className="text-signal-support" />}
            labelColor="text-signal-support"
            borderActive="border-signal-support/50 bg-signal-supportSoft"
            borderIdle="border-border-subtle bg-bg-card"
            favored={biasUp && !!data}
            favoredStyle="bg-signal-supportSoft text-signal-support"
            entry={upEntry}
            entryLabel="R1"
            target={upTarget}
            targetLabel="R2"
            stop={upStop}
            stopLabel="MID"
            fmt={fmt}
            mode={mode}
            contracts={upContracts}
            instrument={instrument}
            risk={upRisk}
            gain={upGain}
            rr={upRR}
            btnClass="bg-signal-supportSoft text-signal-support hover:bg-signal-support hover:text-bg-base"
            btnLabel="↑ Enter Bullish Trade"
            onEnter={() => onEnterTrade({
              direction: 'long',
              entry:       isNQ ? toNqPrice(upEntry)  : upEntry,
              target:      isNQ ? toNqPrice(upTarget) : upTarget,
              stop:        isNQ ? toNqPrice(upStop)   : upStop,
              entryLevel:  'R1', targetLevel: 'R2',
              instrument,
              contracts:   mode === 'speculative' ? upContracts : 1,
              priceUnit:   activeSymbol, symbol: activeSymbol, mode,
            })}
          />

          {/* Bearish setup */}
          <SetupCard
            label="Bearish Setup"
            direction="short"
            icon={<TrendingDown size={14} className="text-signal-resistance" />}
            labelColor="text-signal-resistance"
            borderActive="border-signal-resistance/50 bg-signal-resistanceSoft"
            borderIdle="border-border-subtle bg-bg-card"
            favored={biasDown && !!data}
            favoredStyle="bg-signal-resistanceSoft text-signal-resistance"
            entry={dnEntry}
            entryLabel="S1"
            target={dnTarget}
            targetLabel="S2"
            stop={dnStop}
            stopLabel="MID"
            fmt={fmt}
            mode={mode}
            contracts={dnContracts}
            instrument={instrument}
            risk={dnRisk}
            gain={dnGain}
            rr={dnRR}
            btnClass="bg-signal-resistanceSoft text-signal-resistance hover:bg-signal-resistance hover:text-bg-base"
            btnLabel="↓ Enter Bearish Trade"
            onEnter={() => onEnterTrade({
              direction: 'short',
              entry:       isNQ ? toNqPrice(dnEntry)  : dnEntry,
              target:      isNQ ? toNqPrice(dnTarget) : dnTarget,
              stop:        isNQ ? toNqPrice(dnStop)   : dnStop,
              entryLevel:  'S1', targetLevel: 'S2',
              instrument,
              contracts:   mode === 'speculative' ? dnContracts : 1,
              priceUnit:   activeSymbol, symbol: activeSymbol, mode,
            })}
          />
        </div>
      </div>

      {mode === 'speculative' && (
        <div className="text-micro text-text-disabled text-center">
          ⚡ Speculative mode — risk capped at ${maxRisk} max loss per trade. News events are high volatility. Trade at your own risk.
        </div>
      )}
    </div>
  )
}

function SetupCard({
  label, icon, labelColor, borderActive, borderIdle,
  favored, favoredStyle,
  entry, entryLabel, target, targetLabel, stop, stopLabel,
  fmt, mode, contracts, instrument, risk, gain, rr,
  btnClass, btnLabel, onEnter,
}) {
  return (
    <div className={`border rounded-lg p-4 ${favored ? borderActive : borderIdle}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className={`text-sm2 font-bold uppercase tracking-wider ${labelColor}`}>{label}</span>
        {favored && (
          <span className={`text-micro px-1.5 py-0.5 rounded font-bold ${favoredStyle}`}>★ FAVORED</span>
        )}
      </div>

      <div className="space-y-1.5 font-price text-sm2 mb-3">
        <div className="flex justify-between">
          <span className="text-text-muted">Entry</span>
          <span className="text-text-primary font-bold">{fmt(entry)} {entryLabel}</span>
        </div>
        <div className="flex justify-between">
          <div className="flex items-center gap-1">
            <Target size={10} className="text-state-hold" />
            <span className="text-text-muted">Target</span>
          </div>
          <span className="text-state-hold font-bold">{fmt(target)} {targetLabel}</span>
        </div>
        <div className="flex justify-between">
          <div className="flex items-center gap-1">
            <Shield size={10} className="text-state-stop" />
            <span className="text-text-muted">Stop</span>
          </div>
          <span className="text-state-stop font-bold">{fmt(stop)} {stopLabel}</span>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-2 mb-3 space-y-1">
        {mode === 'speculative' && (
          <div className="flex justify-between text-sm2">
            <span className="text-text-muted">Contracts</span>
            <span className="text-text-primary font-price font-bold">{contracts}× {instrument}</span>
          </div>
        )}
        <div className="flex justify-between text-sm2">
          <span className="text-text-muted">Max Loss</span>
          <span className="text-state-stop font-price font-bold">{risk ? `-$${risk.toFixed(2)}` : '—'}</span>
        </div>
        <div className="flex justify-between text-sm2">
          <span className="text-text-muted">Max Gain</span>
          <span className="text-state-hold font-price font-bold">{gain ? `+$${gain.toFixed(2)}` : '—'}</span>
        </div>
        <div className="flex justify-between text-sm2">
          <span className="text-text-muted">R/R</span>
          <span className={`font-price font-bold ${parseFloat(rr) >= 2 ? 'text-state-hold' : 'text-state-exit'}`}>
            {rr ? `${rr}:1` : '—'}
          </span>
        </div>
      </div>

      <button
        onClick={onEnter}
        disabled={!entry || !target || !stop}
        className={`w-full py-2 rounded text-sm2 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${btnClass}`}
      >
        {btnLabel}
      </button>
    </div>
  )
}
