// GammaReactionLine — Stage 2 reaction-probability line. A SECOND line below the verdict on a PR card:
// "and here's what gamma says price will do at this level." Display-only; the distribution is computed
// server-side (displayed == logged for calibration). Cyan accent-gamma = the gamma data class. Lead
// with the dominant outcome + reason + confidence, then the rest of the distribution smaller; surface
// gamma↔scorer conflict; "not in range" for far levels. Reusable across surfaces.

const LABEL = { STALL: 'STALL', BREAK_THROUGH: 'BREAK', FADE_LONG: 'FADE-LONG', FADE_SHORT: 'FADE-SHORT' }
const SHORT = { STALL: 'stall', BREAK_THROUGH: 'break', FADE_LONG: 'fade-long', FADE_SHORT: 'fade-short' }
const ORDER = ['STALL', 'BREAK_THROUGH', 'FADE_LONG', 'FADE_SHORT']

export default function GammaReactionLine({ reaction }) {
  if (!reaction) return null
  if (!reaction.inRange) {
    return <div className="mt-1 mb-1 text-micro text-text-disabled">γ: not in range</div>
  }
  const { dist, dominant, confidence, reason, conflict, contested, breakDir, provisional } = reaction
  const arrow = dominant === 'BREAK_THROUGH' ? (breakDir > 0 ? ' ↑' : ' ↓') : ''
  const rest = ORDER.filter(o => o !== dominant).sort((a, b) => dist[b] - dist[a])

  return (
    <div className="mt-1 mb-1.5">
      <div className="flex items-center gap-1.5 flex-wrap text-xs leading-tight">
        <span className="font-price font-bold text-accent-gamma">γ {LABEL[dominant]}{arrow} {dist[dominant]}%</span>
        {reason && <span className="text-text-tertiary">· {reason}</span>}
        <span className="text-micro px-1 py-0.5 rounded bg-accent-gamma/10 text-accent-gamma uppercase tracking-wide">
          {confidence.bucket}{provisional ? ' · est' : ''}
        </span>
      </div>
      <div className="text-micro text-text-tertiary font-price mt-0.5">
        {contested && <span className="text-accent-gamma/80">contested · </span>}
        {rest.map(o => `${SHORT[o]} ${dist[o]}`).join(' · ')}
      </div>
      {conflict && <div className="text-micro text-text-secondary italic mt-0.5">⚠ {conflict}</div>}
    </div>
  )
}
