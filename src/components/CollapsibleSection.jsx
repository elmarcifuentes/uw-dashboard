import { useState } from 'react'

export default function CollapsibleSection({ title, children, defaultOpen = true, badge = null }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</span>
          {badge && (
            <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{badge}</span>
          )}
        </div>
        <span className="text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}
