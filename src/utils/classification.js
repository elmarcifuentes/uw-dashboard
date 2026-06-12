import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Scored directional bias = the ACTION ──────────────────────────────────────
// signal-* (red/green/blue) means scored bias ONLY, app-wide. Literal class strings
// (not template-constructed) so Tailwind's JIT keeps them. Icons are Lucide per the
// design-system Lucide-only rule.
export const CLASSIFICATION_META = {
  buy_support: {
    label: 'BUY', full: 'BUY SUPPORT', direction: 'long',
    text: 'text-signal-support', bg: 'bg-signal-supportSoft', border: 'border-signal-support', hex: '#2fd47a',
    icon: TrendingUp,
  },
  sell_resistance: {
    label: 'SELL', full: 'SELL RESISTANCE', direction: 'short',
    text: 'text-signal-resistance', bg: 'bg-signal-resistanceSoft', border: 'border-signal-resistance', hex: '#ff6b6b',
    icon: TrendingDown,
  },
  continuation: {
    label: 'CONT', full: 'CONTINUATION', direction: null,
    text: 'text-signal-continuation', bg: 'bg-signal-continuationSoft', border: 'border-signal-continuation', hex: '#5ba7ff',
    icon: Minus,
  },
  no_edge: {
    label: 'NO EDGE', full: 'NO EDGE', direction: null,
    text: 'text-text-tertiary', bg: 'bg-bg-elevated', border: 'border-border-subtle', hex: '#73819f',
    icon: Minus,
  },
}

export function classMeta(classification) {
  return CLASSIFICATION_META[classification] || CLASSIFICATION_META.no_edge
}

// ── Structural identity = INFORMATIONAL, never an action color ─────────────────
// Derived from the level's id/type. Used for the neutral structural label + conflict cue.
export function structuralRole(level) {
  const id = String(level?.id || level?.level_id || '')
  if (id === 'MID') return 'mid'
  const t = level?.type
  if (t === 'resistance' || id[0] === 'R') return 'resistance'
  if (t === 'support'    || id[0] === 'S') return 'support'
  return 'unknown'
}

// Does scored bias OPPOSE structural identity? (resistance scored buy / support scored sell)
export function structuralConflict(level) {
  const role = structuralRole(level)
  const cls  = level?.classification
  if (role === 'resistance' && cls === 'buy_support')     return 'buying into resistance'
  if (role === 'support'    && cls === 'sell_resistance') return 'selling into support'
  return null
}

// Combined inline conflict tag — structural conflict + dark-pool-vs-bias opposition.
// Returns a single string (parts joined with ·) or null. Color this NEUTRAL, not signal-*.
export function conflictTag(level) {
  const parts = []
  const sc = structuralConflict(level)
  if (sc) parts.push(sc)
  const dp  = level?.dark_pool
  const cls = level?.classification
  if (dp != null) {
    if (cls === 'buy_support'     && dp < 0) parts.push('DP supply')
    if (cls === 'sell_resistance' && dp > 0) parts.push('DP demand')
  }
  return parts.length ? parts.join(' · ') : null
}
