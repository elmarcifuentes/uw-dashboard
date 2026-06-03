import { useState, useEffect } from 'react'
import TabNav from './components/TabNav'
import PreSession from './components/PreSession'
import Intraday from './components/Intraday'
import PostSession from './components/PostSession'
import './index.css'

const TABS = ['Pre-Session', 'Intraday', 'Post-Session']

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('uw-active-tab') || 'Pre-Session'
  })

  useEffect(() => {
    localStorage.setItem('uw-active-tab', activeTab)
  }, [activeTab])

  return (
    <div className="min-h-screen bg-[#0D1B2A] text-gray-100 font-mono">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-white tracking-wider">
            UW LEVEL SCORING
          </h1>
          <span className="text-xs text-gray-500">Phase 4a</span>
        </div>

        <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'Pre-Session'  && <PreSession />}
          {activeTab === 'Intraday'     && <Intraday />}
          {activeTab === 'Post-Session' && <PostSession />}
        </div>
      </div>
    </div>
  )
}
