import NewsHeadlines from './intraday/NewsHeadlines'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function NewsTab() {
  return (
    <div className="space-y-3 py-3">
      <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
        <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">Market News</div>
        <NewsHeadlines apiUrl={API_URL} />
      </div>
    </div>
  )
}
