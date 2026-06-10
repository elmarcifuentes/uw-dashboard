import { useState, useEffect } from 'react'

const HIGH_IMPACT_KEYWORDS = [
  'fomc', 'federal reserve', 'fed ', 'powell', 'interest rate',
  'cpi', 'ppi', 'inflation', 'non-farm', 'nfp', 'employment report',
  'gdp', 'pce', 'unemployment rate', 'jobs',
]

const MEDIUM_IMPACT_KEYWORDS = [
  'ism', 'adp', 'jobless', 'consumer credit', 'retail sales',
  'housing', 'pmi', 'beige book', 'trade balance', 'consumer sentiment',
]

function formatEstimate(value) {
  if (!value && value !== 0) return null
  const num = parseFloat(value)
  if (isNaN(num)) return value
  const abs  = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(1)}K`
  if (abs < 10)             return `${sign}${num.toFixed(1)}%`
  return `${sign}${num.toLocaleString()}`
}

function getImpact(eventName) {
  const lower = (eventName || '').toLowerCase()
  if (HIGH_IMPACT_KEYWORDS.some(k => lower.includes(k))) return 'high'
  if (MEDIUM_IMPACT_KEYWORDS.some(k => lower.includes(k))) return 'medium'
  return 'low'
}

const IMPACT_COLORS = {
  high:   { bg: 'bg-red-950',   border: 'border-red-500',   text: 'text-red-400',   dot: 'bg-red-500'   },
  medium: { bg: 'bg-amber-950', border: 'border-amber-500', text: 'text-amber-400', dot: 'bg-amber-500' },
  low:    { bg: 'bg-bg-elevated',  border: 'border-border-strong',  text: 'text-text-secondary',  dot: 'bg-bg-card2'  },
}

export default function EconomicCalendar({ apiUrl }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/api-data/economic-calendar`)
      .then(r => r.json())
      .then(data => {
        const today = new Date().toISOString().split('T')[0]
        const todayEvents = (data.data || []).filter(e => {
          const t = e.time || ''
          return t.startsWith(today)
        })
        // Attach computed impact and sort: high → medium → low
        const withImpact = todayEvents.map(e => ({ ...e, _impact: getImpact(e.event) }))
        const order = { high: 0, medium: 1, low: 2 }
        withImpact.sort((a, b) => order[a._impact] - order[b._impact])
        setEvents(withImpact)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiUrl])

  if (loading) return null

  const hasHighImpact = events.some(e => e._impact === 'high')
  const hasMediumImpact = events.some(e => e._impact === 'medium')
  const headerColor = hasHighImpact ? 'text-red-400' : hasMediumImpact ? 'text-amber-400' : 'text-text-secondary'
  const containerCls = hasHighImpact
    ? 'bg-bg-card border-state-cascadeWatch/30'
    : hasMediumImpact
    ? 'bg-bg-card border-state-exit/30'
    : 'bg-bg-elevated border-border-default'

  if (events.length === 0) {
    return (
      <div className="bg-bg-elevated border border-border-default rounded px-3 py-2">
        <span className="text-text-tertiary text-xs">📅 No major economic events today</span>
      </div>
    )
  }

  return (
    <div className={`border rounded p-3 ${containerCls}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm font-bold ${headerColor}`}>📅 ECONOMIC EVENTS TODAY</span>
        {hasHighImpact && (
          <span className="text-red-400 text-xs font-bold animate-pulse">● HIGH IMPACT</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {events.slice(0, 5).map((event, i) => {
          const colors = IMPACT_COLORS[event._impact]
          const etTime = event.time
            ? new Date(event.time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: true,
                timeZone: 'America/New_York',
              }) + ' ET'
            : ''
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
              <span className={`text-xs font-mono w-20 shrink-0 ${colors.text}`}>{etTime}</span>
              <span className="text-xs text-text-secondary flex-1">{event.event}</span>
              {event.forecast != null && (
                <span className="text-xs text-text-tertiary shrink-0">
                  est: {formatEstimate(event.forecast) ?? event.forecast}
                </span>
              )}
            </div>
          )
        })}
        {events.length > 5 && (
          <span className="text-text-muted text-xs">+{events.length - 5} more events</span>
        )}
      </div>
    </div>
  )
}
