const BADGE_STYLES = {
  full_stack: 'bg-accent-price text-bg-base',
  conflict:   'bg-state-cascadeWatch text-bg-base',
  boundary:   'bg-accent-price/80 text-bg-base',
  lower_high: 'bg-accent-aiSoft text-accent-ai',
}

const BADGE_LABELS = {
  full_stack: '★ FULL STACK',
  conflict:   '⚠ CONFLICT',
  boundary:   '⚡ BOUNDARY',
  lower_high: '↙ LOWER HIGH',
}

export default function SignalBadge({ type }) {
  const style = BADGE_STYLES[type]
  const label = BADGE_LABELS[type]
  if (!style) return null
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-bold rounded ${style}`}>
      {label}
    </span>
  )
}
