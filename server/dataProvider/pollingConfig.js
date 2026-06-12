export default {
  intervals: {
    quiet:       10 * 1000,  // was 60s — reduced to match 10s max
    approaching:  5 * 1000,  // was 20s
    near:         5 * 1000,  // was 10s
    close:        3 * 1000,  // was 5s
    veryClose:    2 * 1000,  // was 3s
    atLevel:      2 * 1000,
  },

  triggers: {
    levelCrossThreshold:   0.15,
    priceMoveTrigger:      1.00,
    timeBasedInterval:     15 * 60 * 1000,
  },

  budget: {
    dailyLimit:    15000,
    workingBudget: 14000,
    reserve:       1000,
    amberAlert:    0.80,
    pauseAt:       14000,
  },

  marketHours: {
    open:  { hour: 8, minute: 30 },
    close: { hour: 16, minute: 30 },
    timezone: 'America/New_York',
    overnightInterval: 5 * 60 * 1000,
    overnightRescores: false,
  },
}
