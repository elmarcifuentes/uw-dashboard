import { useState, useMemo } from 'react'
import { useSSE } from '../../hooks/useSSE'
import { formatNarrative } from '../../utils/formatNarrative'
import LevelMap from './LevelMap'
import LevelPlanCard from './LevelPlanCard'
import LevelCard from '../LevelCard'
import ThreeColLayout from '../layout/ThreeColLayout'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function ScoutTab({ activeSymbol, onEnterTrade }) {
  const { rescoreData, priceData, dpHistory, assistantRead, levelNarratives, levelTouches } = useSSE(`${API_URL}/stream`)

  const result       = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const levels       = result?.levels || []
  const nqRatio      = result?.nq_ratio ? Number(result.nq_ratio) : null
  const currentPrice = priceData?.price ?? result?.current_price
  const cascade      = result?.cascade ?? null

  const [selectedLevel, setSelectedLevel] = useState(null)
  const selectedLevelData = levels.find(l => l.id === selectedLevel)

  return (
    <div>
      <div className="flex items-center justify-between mb-0 pt-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">Scout</h2>
          <p className="text-xs text-text-muted mt-0.5">Click a level to plan your trade</p>
        </div>
        {assistantRead?.now && (
          <div className="text-xs text-text-secondary max-w-xs text-right hidden sm:block">
            {formatNarrative(assistantRead.now, activeSymbol)}
          </div>
        )}
      </div>

      <ThreeColLayout
        whereWidth="lg:w-[30%]"
        whyWidth="lg:w-[35%]"
        whatWidth="lg:w-[35%]"
        where={
          <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">Level Map</div>
            <LevelMap
              levels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              activeSymbol={activeSymbol}
              selectedLevel={selectedLevel}
              onLevelSelect={setSelectedLevel}
            />
            <div className="flex gap-4 mt-4 pt-3 border-t border-border-subtle text-xs text-text-muted">
              <span><span className="text-red-500">█</span> Resistance</span>
              <span><span className="text-green-500">█</span> Support</span>
              <span><span className="text-text-disabled">█</span> No edge</span>
              <span><span className="text-yellow-400">▶</span> Price</span>
            </div>
          </div>
        }
        why={
          selectedLevelData ? (
            <LevelCard
              level={selectedLevelData}
              allLevels={levels}
              currentPrice={currentPrice}
              nqRatio={nqRatio}
              dpHistory={dpHistory}
              levelNarrative={levelNarratives?.[selectedLevel]}
              levelTouches={levelTouches?.[selectedLevel]}
              activeSymbol={activeSymbol}
            />
          ) : (
            <div className="bg-bg-card border border-border-subtle rounded-lg p-4 flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-text-disabled text-2xl">←</span>
              <span className="text-xs text-text-muted">Select a level to see evidence</span>
            </div>
          )
        }
        what={
          selectedLevelData ? (
            <div className="bg-bg-elevated border border-border-default rounded-lg p-4 shadow-elevated">
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
            </div>
          ) : (
            <div className="bg-bg-card border border-border-subtle rounded-lg p-4 flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-text-disabled text-2xl">←</span>
              <span className="text-xs text-text-muted">Select a level to plan a trade</span>
            </div>
          )
        }
      />
    </div>
  )
}
