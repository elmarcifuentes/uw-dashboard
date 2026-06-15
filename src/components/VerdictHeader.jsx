import { TrendingUp, TrendingDown, Clock, Eye, Ban } from 'lucide-react'

// Shared verdict headline for every level surface. Leads with the verdict state + color (design
// tokens only): green=ACT buy, red=ACT sell, amber=SMALL/WAIT (differentiated by fill + icon),
// purple=CONFLICT/AVOID, neutral=WATCH. The verdict frames; it never hides the card's data.
const TONE = {
  ACT_LONG:    { text: 'text-signal-support',     bg: 'bg-signal-supportSoft',     border: 'border-signal-support/60',     label: 'ACT · BUY',  fill: true  },
  ACT_SHORT:   { text: 'text-signal-resistance',  bg: 'bg-signal-resistanceSoft',  border: 'border-signal-resistance/60',  label: 'ACT · SELL', fill: true  },
  SMALL:       { text: 'text-state-exit',         bg: 'bg-state-exitSoft',         border: 'border-state-exit/60',         label: 'SMALL',      fill: true  },  // filled amber
  WAIT:        { text: 'text-state-cascadeWatch', bg: 'bg-transparent',            border: 'border-state-cascadeWatch/70', label: 'WAIT',       fill: false },  // outline amber — distinct from SMALL
  CONFLICT:    { text: 'text-accent-conflict',    bg: 'bg-accent-conflictSoft',    border: 'border-accent-conflict/60',    label: 'AVOID',      fill: true  },
  NOT_IN_PLAY: { text: 'text-text-tertiary',      bg: 'bg-bg-elevated',            border: 'border-border-default',        label: 'WATCH',      fill: false },
}

function iconFor(state, dir) {
  if (state === 'ACT_LONG')  return TrendingUp
  if (state === 'ACT_SHORT') return TrendingDown
  if (state === 'SMALL')     return dir === 'short' ? TrendingDown : TrendingUp
  if (state === 'WAIT')      return Clock
  if (state === 'CONFLICT')  return Ban
  return Eye
}

export default function VerdictHeader({ verdict, size = 'sm', className = '' }) {
  if (!verdict) return null
  const t = TONE[verdict.state] || TONE.NOT_IN_PLAY
  const Icon = iconFor(verdict.state, verdict.dir)
  const px = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  const iconSz = size === 'lg' ? 15 : 12
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <span className={`inline-flex items-center gap-1 rounded font-bold shrink-0 border ${px} ${t.fill ? t.bg : 'bg-transparent'} ${t.border} ${t.text}`}>
        <Icon size={iconSz} strokeWidth={2.5} />
        {t.label}
      </span>
      <span className="text-xs text-text-secondary leading-snug pt-0.5">{verdict.summary}</span>
    </div>
  )
}
