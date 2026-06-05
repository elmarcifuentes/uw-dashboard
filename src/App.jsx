import { useState, useEffect } from 'react'
import TabNav from './components/TabNav'
import PreSession from './components/PreSession'
import Intraday from './components/Intraday'
import PostSession from './components/PostSession'
import Guide from './components/Guide'
import LockModal from './components/LockModal'
import RestartBanner from './components/RestartBanner'
import LevelsTab from './components/LevelsTab'
import { useServerHealth } from './hooks/useServerHealth'
import { LayoutProvider } from './context/LayoutContext'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import './index.css'

const TABS    = ['Pre-Session', 'Intraday', 'Post-Session', '📐 Levels', 'Guide']
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function AppInner() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('uw-active-tab') || 'Pre-Session'
  })
  const [showModal, setShowModal] = useState(false)
  const { unlocked } = useAuth()
  const { restarted, hasData, dismiss } = useServerHealth(API_URL)

  useEffect(() => {
    localStorage.setItem('uw-active-tab', activeTab)
  }, [activeTab])

  return (
    <div className="min-h-screen bg-[#0D1B2A] text-gray-100 font-mono">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-white tracking-wider">
            TradesAlgo
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">v4b</span>
            <button
              onClick={() => setShowModal(true)}
              title={unlocked ? 'Actions unlocked — click to lock' : 'Click to unlock actions'}
              className="text-lg leading-none hover:opacity-80 transition-opacity"
            >
              {unlocked ? '🔓' : '🔒'}
            </button>
          </div>
        </div>

        {/* Global restart / no-data banner — visible on all tabs */}
        <RestartBanner restarted={restarted} hasData={hasData} onDismiss={dismiss} />

        <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'Pre-Session'  && <PreSession />}
          {activeTab === 'Intraday'     && <Intraday />}
          {activeTab === 'Post-Session' && <PostSession />}
          {activeTab === '📐 Levels'   && <LevelsTab />}
          {activeTab === 'Guide'        && <Guide />}
        </div>
      </div>

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
