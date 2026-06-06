const FIELDS = [
  { key: 'now',          label: 'NOW',      color: 'text-white',     border: 'border-gray-700',      labelColor: 'text-gray-500'  },
  { key: 'next',         label: 'NEXT',     color: 'text-blue-200',  border: 'border-blue-900/50',   labelColor: 'text-blue-500'  },
  { key: 'risk',         label: 'RISK',     color: 'text-amber-200', border: 'border-amber-900/50',  labelColor: 'text-amber-500' },
  { key: 'invalidation', label: 'IF WRONG', color: 'text-gray-400',  border: 'border-gray-800',      labelColor: 'text-gray-600'  },
]

export default function AssistantStrip({ assistantRead }) {
  return (
    <div className="border-b border-gray-800 bg-[#0d1424]">
      <div className="max-w-screen-xl mx-auto px-4 py-2">
        {!assistantRead ? (
          <div className="text-xs text-gray-700 py-1">Initializing market read…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FIELDS.map(f => (
              <div key={f.key} className={`border rounded-lg px-3 py-2 ${f.border} bg-[#111827]/50`}>
                <div className={`text-xs font-bold tracking-wider mb-1 ${f.labelColor}`}>{f.label}</div>
                <p className={`text-xs leading-relaxed ${f.color} line-clamp-2`}>{assistantRead[f.key] || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
