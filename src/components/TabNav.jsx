const TABS = [
  { id: 'Overview',      label: 'Overview'     },
  { id: 'Pre-Session',   label: 'Pre-Session'  },
  { id: 'Intraday',      label: 'Intraday',    live: true },
  { id: 'Post-Session',  label: 'Post-Session' },
  { id: 'Levels',        label: 'Levels',      icon: '⚙' },
  { id: 'Guide',         label: 'Guide'        },
]

export default function TabNav({ active, onChange, connected }) {
  return (
    <div className="flex border-b border-gray-800 bg-[#0a0f1e] sticky top-12 z-40 overflow-x-auto">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px shrink-0 flex items-center gap-1.5',
            active === tab.id
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200',
          ].join(' ')}
        >
          {tab.label}
          {tab.live && connected && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {tab.icon && <span className="text-gray-600 text-xs">{tab.icon}</span>}
        </button>
      ))}
    </div>
  )
}
