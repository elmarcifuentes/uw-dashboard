import NewsHeadlines from './intraday/NewsHeadlines'
import TopNetImpact from './TopNetImpact'
import SectorETF from './SectorETF'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function NewsTab() {
  return (
    <div className="space-y-3 py-3">

      <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Market News</div>
        <NewsHeadlines apiUrl={API_URL} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Top Movers</div>
          <TopNetImpact apiUrl={API_URL} />
        </div>
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Sector Flow</div>
          <SectorETF apiUrl={API_URL} />
        </div>
      </div>

    </div>
  )
}
