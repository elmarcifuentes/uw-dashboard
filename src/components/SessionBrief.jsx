import { formatNarrative } from '../utils/formatNarrative'

export default function SessionBrief({ brief, mode, activeSymbol = 'NQ' }) {
  if (!brief || mode !== 'claude') return null

  return (
    <div className="border border-purple-900 bg-purple-950/20 rounded p-3">
      <div className="flex items-center gap-2 mb-2">
        <svg height="0.9em" width="0.9em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="inline shrink-0">
          <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
        </svg>
        <span className="text-xs text-purple-400 uppercase tracking-wide">Session Brief</span>
        <span className="text-xs text-text-muted">Claude Haiku</span>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">
        {formatNarrative(brief, activeSymbol)}
      </p>
    </div>
  )
}
