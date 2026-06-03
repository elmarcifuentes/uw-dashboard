export default {
  intervals: {
    quiet:       60 * 1000,
    approaching: 20 * 1000,
    near:        10 * 1000,
    close:        5 * 1000,
    veryClose:    3 * 1000,
    atLevel:      2 * 1000,
  },

  triggers: {
    levelCrossThreshold:   0.15,
    priceMoveTrigger:      1.00,
    darkPoolShiftTrigger:  0.200,
    structureBreakWarning: 0.25,
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
