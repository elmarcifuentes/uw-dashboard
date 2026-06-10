import { useState, useEffect, useCallback } from 'react'

const RELEVANT_KEYWORDS = [
  'fed', 'federal reserve', 'powell', 'rate', 'inflation',
  'cpi', 'gdp', 'jobs', 'nasdaq', 'qqq', 'tech', 'ai',
  'nvda', 'nvidia', 'aapl', 'apple', 'msft', 'microsoft',
  'amzn', 'amazon', 'meta', 'googl', 'google', 'tsla', 'tesla',
  'semiconductor', 'earnings', 'market', 'economy', 'tsmc',
  'broadcom', 'avgo', 'amd', 'intel', 'tariff', 'trade',
  'crowdstrike', 'crwd', 'openai', 'palantir',
]

const SENTIMENT_COLOR = {
  bullish: 'text-green-300',
  bearish: 'text-red-300',
  neutral: 'text-gray-200',
}

export default function NewsHeadlines({ apiUrl }) {
  const [headlines, setHeadlines] = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchNews = useCallback(() => {
    fetch(`${apiUrl}/api-data/news`)
      .then(r => r.json())
      .then(json => {
        const items = json.data || []

        const isRelevant = item => {
          const lower = (item.headline || '').toLowerCase()
          return RELEVANT_KEYWORDS.some(kw => lower.includes(kw))
        }

        // Sort: is_major first, then relevant, then rest — within each group newest first
        const withScore = items.map(item => ({
          ...item,
          _score: item.is_major ? 2 : isRelevant(item) ? 1 : 0,
        }))
        withScore.sort((a, b) =>
          b._score - a._score || new Date(b.created_at) - new Date(a.created_at)
        )

        setHeadlines(withScore.slice(0, 12))
        setLastUpdate(new Date())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiUrl])

  useEffect(() => {
    fetchNews()
    const t = setInterval(fetchNews, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchNews])

  const fmtTime = item => {
    const d = new Date(item.created_at)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York',
    }) + ' ET'
  }

  if (loading) return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-10 bg-bg-elevated rounded" />)}
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary uppercase tracking-wide">Market News</span>
        {lastUpdate && (
          <span className="text-xs text-text-muted">
            {lastUpdate.toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', hour12: true,
              timeZone: 'America/New_York',
            })} ET
          </span>
        )}
      </div>

      {headlines.length === 0 ? (
        <div className="text-xs text-text-tertiary">No headlines available</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {headlines.map((item, i) => (
            <div key={i} className={`rounded p-2.5 border transition-colors ${
              item.is_major
                ? 'border-border-strong bg-bg-elevated'
                : 'border-border-default bg-bg-card2/50'
            }`}>
              <p className={`text-xs leading-relaxed ${SENTIMENT_COLOR[item.sentiment] || 'text-gray-200'}`}>
                {item.is_major && <span className="text-amber-400 font-bold mr-1">★</span>}
                {item.headline}
              </p>

              {item.tickers?.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {item.tickers.map(t => (
                    <span key={t} className="text-xs bg-bg-elevated text-text-secondary px-1.5 py-0.5 rounded font-mono">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-muted">{item.source}</span>
                <span className="text-xs text-text-muted ml-auto">{fmtTime(item)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
