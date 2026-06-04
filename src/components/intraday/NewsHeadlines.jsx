import { useState, useEffect, useCallback } from 'react'

const RELEVANT_KEYWORDS = [
  'fed', 'federal reserve', 'powell', 'rate', 'inflation',
  'cpi', 'gdp', 'jobs', 'nasdaq', 'qqq', 'tech', 'ai',
  'nvda', 'nvidia', 'aapl', 'apple', 'msft', 'microsoft',
  'amzn', 'amazon', 'meta', 'googl', 'google', 'tsla', 'tesla',
  'semiconductor', 'earnings', 'market', 'economy', 'tsmc',
  'broadcom', 'avgo', 'amd', 'intel', 'tariff', 'trade',
]

const SENTIMENT_COLOR = {
  bullish: 'text-green-400',
  bearish: 'text-red-400',
  neutral: 'text-gray-400',
}

export default function NewsHeadlines({ apiUrl }) {
  const [headlines, setHeadlines] = useState([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchNews = useCallback(() => {
    fetch(`${apiUrl}/api-data/news`)
      .then(r => r.json())
      .then(json => {
        const items = json.data || []
        const lower = items.map(item => ({
          ...item,
          _lower: (item.headline || '').toLowerCase(),
        }))

        // Filter relevant headlines
        const relevant = lower.filter(item =>
          RELEVANT_KEYWORDS.some(kw => item._lower.includes(kw)) || item.is_major
        )

        // Sort: is_major first, then by created_at descending
        const sorted = [...relevant].sort((a, b) => {
          if (a.is_major !== b.is_major) return a.is_major ? -1 : 1
          return new Date(b.created_at) - new Date(a.created_at)
        })

        setHeadlines(sorted.slice(0, 12))
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

  const fmtTime = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York',
    }) + ' ET'
  }

  if (loading) return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-700 rounded" />)}
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Market News</span>
        {lastUpdate && (
          <span className="text-xs text-gray-600">
            {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} ET
          </span>
        )}
      </div>

      {headlines.length === 0 ? (
        <div className="text-xs text-gray-500">No relevant headlines at this time</div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {headlines.map((item, i) => (
            <div key={i} className={`border rounded p-2 transition-colors ${
              item.is_major
                ? 'border-gray-600 bg-gray-800/60'
                : 'border-gray-700 bg-gray-900/40'
            }`}>
              <p className="text-xs text-gray-200 leading-relaxed">
                {item.headline}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.tickers?.length > 0 && (
                  <span className="text-xs text-blue-400 font-mono">
                    {item.tickers.slice(0, 3).join(' ')}
                  </span>
                )}
                {item.source && (
                  <span className="text-xs text-gray-600">{item.source}</span>
                )}
                {item.sentiment && item.sentiment !== 'neutral' && (
                  <span className={`text-xs font-bold ${SENTIMENT_COLOR[item.sentiment] || 'text-gray-400'}`}>
                    {item.sentiment.toUpperCase()}
                  </span>
                )}
                <span className="text-xs text-gray-600 ml-auto">{fmtTime(item.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
