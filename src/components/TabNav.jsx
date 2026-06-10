const TABS = [
  { id: 'Overview',      label: 'Overview'     },
  { id: 'Scout',         label: '🔍 Scout',    scout: true },
  { id: 'Trade',         label: '📈 Trade',    trade: true },
  { id: 'Pre-Session',   label: 'Pre-Session'  },
  { id: 'Intraday',      label: 'Intraday',    live: true },
  { id: 'Post-Session',  label: 'Post-Session' },
  { id: 'News',          label: 'News'         },
  { id: 'Levels',        label: 'Levels',      locked: true },
  { id: 'Controls',      label: 'Controls',    locked: true },
  { id: 'Guide',         label: 'Guide'        },
  { id: 'Labs',          label: '🧪 Labs',     labs: true },
]

export default function TabNav({ active, onChange, connected, unlocked }) {
  return (
    <div className="flex border-b border-gray-800 bg-[#0a0f1e] sticky top-11 sm:top-12 z-40 overflow-x-auto scrollbar-none scroll-smooth-ios">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px shrink-0 flex items-center gap-1',
            active === tab.id
              ? tab.labs ? 'border-purple-500 text-purple-300' : tab.scout ? 'border-indigo-400 text-indigo-200' : tab.trade ? 'border-green-500 text-green-200' : 'border-indigo-500 text-white'
              : tab.labs ? 'border-transparent text-purple-600 hover:text-purple-400' : tab.scout ? 'border-transparent text-indigo-600 hover:text-indigo-400' : tab.trade ? 'border-transparent text-green-700 hover:text-green-500' : 'border-transparent text-gray-400 hover:text-gray-200',
          ].join(' ')}
        >
          {tab.label}
          {tab.live && connected && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {tab.locked && <span className="text-xs">{unlocked ? '🔓' : '🔒'}</span>}
        </button>
      ))}
    </div>
  )
}
