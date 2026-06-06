const FIELDS = [
  { key: 'now',          label: 'NOW',      color: 'text-white'      },
  { key: 'next',         label: 'NEXT',     color: 'text-blue-300'   },
  { key: 'risk',         label: 'RISK',     color: 'text-amber-300'  },
  { key: 'invalidation', label: 'IF WRONG', color: 'text-gray-400'   },
]

export default function AssistantStrip({ assistantRead }) {
  return (
    <div className="border-b border-gray-800/50 bg-[#0d1424] sticky top-12 z-40">
      <div className="max-w-screen-xl mx-auto px-4 py-1.5 flex items-start gap-6 overflow-x-auto">
        {!assistantRead ? (
          <span className="text-xs text-gray-700 py-0.5">Initializing market read…</span>
        ) : FIELDS.map(f => (
          <div key={f.key} className="flex items-baseline gap-1.5 shrink-0 max-w-xs">
            <span className="text-xs font-bold text-gray-600 shrink-0 tracking-wider">{f.label}</span>
            <span className={`text-xs ${f.color} leading-relaxed`}>{assistantRead[f.key] || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
