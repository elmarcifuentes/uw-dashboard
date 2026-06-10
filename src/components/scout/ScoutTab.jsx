import { useState, useMemo } from 'react'
import { useSSE } from '../../hooks/useSSE'
import { formatNarrative } from '../../utils/formatNarrative'
import LevelMap from './LevelMap'
import LevelPlanCard from './LevelPlanCard'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function ScoutTab({ activeSymbol, onEnterTrade }) {
  const { rescoreData, priceData, dpHistory, assistantRead, levelNarratives } = useSSE(`${API_URL}/stream`)

  const result       = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const currentPrice = priceData?.price ?? result?.current_price
  const cascade      = result?.cascade ?? null

  const [selectedLevel, setSelectedLevel] = useState(null)
  const selectedLevelData = levels.find(l => l.id === selectedLevel)

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Scout</h2>
          <p className="text-xs text-gray-600 mt-0.5">Click a level to plan your trade</p>
        </div>
        {assistantRead?.now && (
          <div className="text-xs text-gray-400 max-w-xs text-right hidden sm:block">
            {formatNarrative(assistantRead.now, activeSymbol)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left — Level Map */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Level Map</div>
          <LevelMap
            levels={levels}
            currentPrice={currentPrice}
            nqRatio={nqRatio}
            activeSymbol={activeSymbol}
            selectedLevel={selectedLevel}
            onLevelSelect={setSelectedLevel}
          />
          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-800 text-xs text-gray-600">
            <span><span className="text-red-500">█</span> Resistance</span>
            <span><span className="text-green-500">█</span> Support</span>
            <span><span className="text-gray-700">█</span> No edge</span>
            <span><span className="text-yellow-400">▶</span> Price</span>
          </div>
        </div>

        {/* Right — Level Plan */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
          {selectedLevelData ? (
            <LevelPlanCard
              level={selectedLevelData}
              allLevels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              activeSymbol={activeSymbol}
              narrative={levelNarratives?.[selectedLevel]}
              dpHistory={dpHistory}
              cascade={cascade}
              onEnterTrade={onEnterTrade}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-gray-700 text-2xl">←</span>
              <span className="text-xs text-gray-600">Select a level to plan</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
