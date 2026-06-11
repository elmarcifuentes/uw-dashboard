// Canonical NQ price for a scored level. Prefer the stored whole-point value the server
// attaches (level.nq_price, from daily_levels) so every tab shows the SAME number; only
// fall back to reconstructing from QQQ × ratio when it's absent (legacy / before an apply).
// Never re-round the stored value — it is already the canonical applied level.
export function levelNq(level, nqRatio) {
  if (level?.nq_price != null) return level.nq_price
  if (level?.price != null && nqRatio) return Math.round(level.price * nqRatio * 4) / 4
  return null
}
