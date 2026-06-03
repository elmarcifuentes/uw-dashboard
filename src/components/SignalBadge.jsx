const BADGE_STYLES = {
  full_stack: 'bg-yellow-500 text-black',
  conflict:   'bg-amber-500 text-black',
  boundary:   'bg-orange-500 text-black',
  lower_high: 'bg-purple-600 text-white',
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
