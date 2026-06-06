export function getPulseLevel(cascadeActive, structureBreak, midDpLevel, sentiment, proximityZone) {
  if (cascadeActive)             return 'cascade'
  if (structureBreak)            return 'break'
  if (midDpLevel === 'critical') return 'cascade_arm'
  if (proximityZone === 'critical') return 'level'
  if (sentiment === 'HIGH_RISK') return 'sentiment'
  return 'none'
}

export function shouldPulse(element, priority) {
  const pulseMap = {
    cascade:     ['cascade_badge', 'connection_dot', 'cascade_thermometer'],
    break:       ['structure_break_badge', 'connection_dot'],
    cascade_arm: ['mid_dp_value', 'cascade_gauge'],
    level:       ['level_card'],
    sentiment:   ['sentiment_badge'],
    none:        ['connection_dot'],
  }
  return pulseMap[priority]?.includes(element) ?? false
}
