export default function TabNav({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-gray-700">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={[
            'px-5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            active === tab
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          ].join(' ')}
        >
          {tab === 'Intraday' ? 'Intraday ⏳' : tab}
        </button>
      ))}
    </div>
  )
}
