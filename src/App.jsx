import { useState, useEffect, useMemo } from 'react'
import TabNav from './components/TabNav'
import AppBar from './components/shell/AppBar'
import AssistantStrip from './components/shell/AssistantStrip'
import OverviewTab from './components/OverviewTab'
import PreSession from './components/PreSession'
import Intraday from './components/Intraday'
import PostSession from './components/PostSession'
import NewsTab from './components/NewsTab'
import ControlsTab from './components/ControlsTab'
import GuideTab from './components/GuideTab'
import LockModal from './components/LockModal'
import RestartBanner from './components/RestartBanner'
import LevelsTab from './components/LevelsTab'
import { useServerHealth } from './hooks/useServerHealth'
import { useSSE } from './hooks/useSSE'
import { LayoutProvider } from './context/LayoutContext'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STRIP_TABS = new Set(['Overview', 'Pre-Session', 'Intraday'])

function AppInner() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('uw-active-tab') || 'Overview')
  const [showModal, setShowModal] = useState(false)
  const { unlocked } = useAuth()
  const { restarted, hasData, dismiss } = useServerHealth(API_URL)

  const { connected, priceData, rescoreData, assistantRead, narrativeMode, systemPaused, pausedAt } = useSSE(`${API_URL}/stream`)

  const result        = useMemo(() => rescoreData?.result ?? null, [rescoreData])
  const currentPrice  = priceData?.price ?? result?.current_price
  const nqRatio       = result?.nq_ratio ? Number(result.nq_ratio) : null
  const nqPrice       = nqRatio && currentPrice ? Math.round(currentPrice * nqRatio) : null
  const cascadeActive = result?.cascade?.active ?? false

  useEffect(() => { localStorage.setItem('uw-active-tab', activeTab) }, [activeTab])

  const showStrip = STRIP_TABS.has(activeTab)

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-gray-100 font-mono">

      <AppBar
        connected={connected}
        price={currentPrice}
        nqPrice={nqPrice}
        narrativeMode={narrativeMode}
        unlocked={unlocked}
        onLockClick={() => setShowModal(true)}
        cascadeActive={cascadeActive}
        systemPaused={systemPaused}
        pausedAt={pausedAt}
      />

      <TabNav active={activeTab} onChange={setActiveTab} connected={connected} unlocked={unlocked} />

      {showStrip && <AssistantStrip assistantRead={assistantRead} />}

      <main className="max-w-screen-xl mx-auto px-4">
        <RestartBanner restarted={restarted} hasData={hasData} onDismiss={dismiss} />

        <div className="mt-4">
          {activeTab === 'Overview'     && <OverviewTab onNavigate={setActiveTab} />}
          {activeTab === 'Pre-Session'  && <PreSession assistantRead={assistantRead} />}
          {activeTab === 'Intraday'     && <Intraday />}
          {activeTab === 'Post-Session' && <PostSession />}
          {activeTab === 'News'         && <NewsTab />}
          {activeTab === 'Levels'       && <LevelsTab />}
          {activeTab === 'Controls'     && <ControlsTab systemPaused={systemPaused} pausedAt={pausedAt} />}
          {activeTab === 'Guide'        && <GuideTab />}
        </div>
      </main>

      {showModal && <LockModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </AuthProvider>
  )
}
