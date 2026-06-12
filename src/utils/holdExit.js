import { CASCADE_TRIGGER, CASCADE_WATCH } from './cascade'

export function evaluateHoldExit(trade, levels, currentPrice, cascade, dpHistory) {
  if (!trade || !currentPrice) return null

  const isShort = trade.direction === 'short'
  const { entry, target, stop } = trade
  const now = currentPrice

  const holdSignals       = []
  const exitSignals       = []
  const convictionSignals = []

  // 1 — Direction check
  const movingCorrect = isShort ? now < entry : now > entry
  if (movingCorrect) {
    holdSignals.push('Price moving in direction')
  } else {
    exitSignals.push('Price against trade direction')
  }

  // 2 — Progress toward target
  const totalMove    = Math.abs(target - entry)
  const currentMove  = Math.abs(now - entry)
  const progressPct  = totalMove > 0
    ? Math.min(Math.round((currentMove / totalMove) * 100), 100)
    : 0

  // 3 — Stop proximity
  const distToStop = Math.abs(now - stop)
  const stopRange  = Math.abs(stop - entry)
  const stopPct    = stopRange > 0 ? distToStop / stopRange : 1

  if (stopPct < 0.25) {
    exitSignals.push(`Near stop — ${distToStop.toFixed(1)} pts away`)
  }

  // 4 — Cascade health
  const mid    = levels?.find(l => l.id === 'MID')
  const midDp  = mid?.dark_pool || 0
  const cascadeGap = Math.abs(CASCADE_TRIGGER - midDp)

  if (isShort) {
    if (cascade?.active) {
      convictionSignals.push('⚡ CASCADE ACTIVE — maximum conviction')
    } else if (midDp <= CASCADE_WATCH) {
      convictionSignals.push(`Cascade building (${midDp.toFixed(3)}) — ${cascadeGap.toFixed(3)} from trigger`)
    } else if (midDp > -0.300) {
      exitSignals.push(`DP recovering (${midDp.toFixed(3)}) — short thesis weakening`)
    }
  } else {
    if (midDp >= 0.500) {
      convictionSignals.push(`Strong institutional support (${midDp.toFixed(3)})`)
    }
  }

  // 5 — DP sparkline trend
  const dpHist = dpHistory?.MID || []
  if (dpHist.length >= 3) {
    const recent = dpHist.slice(-3).map(h => h.dp ?? h.value ?? 0)
    const trend  = recent[2] - recent[0]
    if (isShort && trend < -0.050) {
      convictionSignals.push('MID DP trending more negative ↓')
    } else if (isShort && trend > 0.050) {
      exitSignals.push('MID DP recovering ↑ — watch closely')
    }
  }

  // 6 — Target / stop hit
  const targetHit = isShort ? now <= target : now >= target
  const stopHit   = isShort ? now >= stop   : now <= stop

  // 7 — Exit conditions
  const exitConditions = []
  exitConditions.push(
    isShort
      ? `Price reclaims $${stop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `Price breaks below $${stop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  )
  if (isShort && midDp < -0.300) {
    exitConditions.push('MID DP recovers above -0.300')
  }
  if (cascade?.active) {
    exitConditions.push('Cascade resolves')
  }
  if (trade.entryLevel) {
    exitConditions.push(`${trade.entryLevel} classification changes`)
  }

  // 8 — Verdict
  let verdict      = 'hold'
  let verdictColor = 'green'
  let verdictLabel = '🟢 HOLD'

  if (stopHit) {
    verdict = 'stop'; verdictColor = 'red'; verdictLabel = '🔴 STOP HIT'
  } else if (targetHit) {
    verdict = 'target'; verdictColor = 'green'; verdictLabel = '🎯 TARGET HIT'
  } else if (exitSignals.length >= 2) {
    verdict = 'consider_exit'; verdictColor = 'amber'; verdictLabel = '🟡 CONSIDER EXIT'
  } else if (convictionSignals.length > 0) {
    verdict = 'hold_strong'; verdictColor = 'green'; verdictLabel = '🟢 HOLD — conviction building'
  }

  return {
    verdict, verdictColor, verdictLabel,
    holdSignals, exitSignals, convictionSignals,
    exitConditions, progressPct, distToStop,
    targetHit, stopHit, movingCorrect,
  }
}
