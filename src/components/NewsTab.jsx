import { useMemo } from 'react'
import { useSSE } from '../hooks/useSSE'
import { formatNarrative } from '../utils/formatNarrative'
import NewsHeadlines from './intraday/NewsHeadlines'
import ThreeColLayout from './layout/ThreeColLayout'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function NewsTab({ activeSymbol = 'NQ' }) {
  const { rescoreData, priceData, assistantRead } = useSSE(`${API_URL}/stream`)

  const result       = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const currentPrice = priceData?.price ?? result?.current_price
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const nqPrice      = nqRatio && currentPrice ? Math.round(currentPrice * nqRatio * 4) / 4 : null
  const cascade      = result?.cascade ?? null
  const levels       = result?.levels || []

  const displayPrice = activeSymbol === 'NQ'
    ? (nqPrice != null ? '$' + nqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
    : (currentPrice != null ? '$' + Number(currentPrice).toFixed(2) : '—')

  const nearestLevel = levels.length > 0 && currentPrice != null
    ? levels.reduce((n, l) => Math.abs(currentPrice - l.price) < Math.abs(currentPrice - n.price) ? l : n)
    : null

  const nearestLevelPrice = nearestLevel
    ? (activeSymbol === 'NQ' && nqRatio
        ? '$' + (Math.round(nearestLevel.price * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '$' + Number(nearestLevel.price).toFixed(2))
    : null

  return (
    <ThreeColLayout
      whereWidth="lg:w-[22%]"
      whyWidth="lg:w-[52%]"
      whatWidth="lg:w-[26%]"
      where={
        <div className="bg-bg-card border border-border-subtle rounded-lg p-4 space-y-3">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Session Context</div>
          <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">{displayPrice}</div>
          {nearestLevel && (
            <div className="space-y-1 text-xs">
              <div className="text-text-muted">Nearest level</div>
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold ${
                  nearestLevel.classification === 'buy_support' ? 'text-green-400'
                    : nearestLevel.classification === 'sell_resistance' ? 'text-red-400'
                    : 'text-text-secondary'
                }`}>{nearestLevel.id}</span>
                <span className="text-text-tertiary">{nearestLevelPrice}</span>
              </div>
            </div>
          )}
          {cascade?.active && (
            <div className="bg-state-cascadeWatch/10 border border-state-cascadeWatch/30 rounded px-3 py-2">
              <div className="text-xs text-state-cascadeWatch font-bold">⚠ CASCADE ACTIVE</div>
              {cascade.target && (
                <div className="text-xs text-text-secondary mt-0.5">Target: {cascade.target}</div>
              )}
            </div>
          )}
        </div>
      }
      why={
        <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
          <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">Market News</div>
          <NewsHeadlines apiUrl={API_URL} />
        </div>
      }
      what={
        assistantRead ? (
          <div className="bg-bg-elevated border border-border-default rounded-lg p-4 space-y-3">
            <div className="text-xs text-text-tertiary uppercase tracking-wider">What This Means</div>
            {assistantRead.now && (
              <p className="text-sm text-text-secondary leading-relaxed">
                {formatNarrative(assistantRead.now, activeSymbol)}
              </p>
            )}
            {assistantRead.next && (
              <div className="border-t border-border-subtle pt-3">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Next</div>
                <p className="text-sm text-text-muted leading-relaxed">
                  {formatNarrative(assistantRead.next, activeSymbol)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">What This Means</div>
            <div className="text-xs text-text-muted italic">Connecting to live analysis…</div>
          </div>
        )
      }
    />
  )
}
