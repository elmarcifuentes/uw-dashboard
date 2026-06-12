// Cascade thresholds — single source for the duplicated MID dark-pool levels (C1 dedup).
// Values are unchanged from the prior hardcoded literals. These mirror the scorer's FROZEN
// cascade cond1 (MID dp ≤ CASCADE_TRIGGER); if the engine ever changes, keep these in sync.
export const CASCADE_TRIGGER = -0.700  // MID dp ≤ this → cascade condition 1 / fire
export const CASCADE_WATCH   = -0.500  // MID dp ≤ this → approaching / pre-warning band
