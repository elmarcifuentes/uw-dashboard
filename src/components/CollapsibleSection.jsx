import { useState } from 'react'

export default function CollapsibleSection({ title, children, defaultOpen = true, badge = null }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-bg-card border border-border-subtle rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{title}</span>
          {badge && (
            <span className="text-xs bg-bg-elevated text-text-secondary px-1.5 py-0.5 rounded">{badge}</span>
          )}
        </div>
        <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}
