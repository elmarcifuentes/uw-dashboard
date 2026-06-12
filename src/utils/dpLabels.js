import { CASCADE_TRIGGER, CASCADE_WATCH } from './cascade'

// Dark-pool condition labels. DP is the supply/demand axis (its own labeled channel, subordinate
// to the scored-bias chip): absorption/buying → signal-support, supply/selling → signal-resistance,
// cascade warnings → state-cascade*, indeterminate → neutral. No raw Tailwind colors.
export function dpConditionLabel(darkPool, levelType, classification) {
  if (darkPool === -1 || darkPool === -1.0) {
    return {
      label:    'PRICE ARTIFACT',
      sublabel: 'Price above level — prints in resistance window only',
      color:    'text-text-tertiary',
      bg:       'bg-bg-elevated',
    }
  }

  if (darkPool === 1 || darkPool === 1.0) {
    const magnet = levelType === 'resistance' && classification === 'buy_support'
    return {
      label:    'MAXIMUM ABSORPTION',
      sublabel: magnet
        ? 'All prints below level — resistance magnet active'
        : 'All institutional prints below this level',
      color:    'text-signal-support',
      bg:       'bg-signal-supportSoft',
    }
  }

  if (darkPool === 0) {
    return {
      label:    'STRUCTURAL VOID',
      sublabel: 'No dark pool prints in either window',
      color:    'text-text-muted',
      bg:       'bg-bg-card2',
    }
  }

  if (darkPool >= 0.700) return {
    label:    'STRONG ABSORPTION',
    sublabel: 'Heavy institutional buying below level',
    color:    'text-signal-support',
    bg:       'bg-signal-supportSoft',
  }

  if (darkPool >= 0.300) return {
    label:    'ACCUMULATION',
    sublabel: 'Buying interest building below level',
    color:    'text-signal-support/80',
    bg:       'bg-signal-supportSoft',
  }

  if (darkPool > 0) return {
    label:    'MILD ABSORPTION',
    sublabel: 'Slight buying lean — monitor for development',
    color:    'text-text-tertiary',
    bg:       'bg-bg-elevated',
  }

  if (darkPool <= -0.700) return {
    label:    'SUPPLY CONFIRMED',
    sublabel: 'Heavy institutional selling above level',
    color:    'text-signal-resistance',
    bg:       'bg-signal-resistanceSoft',
  }

  if (darkPool <= -0.300) return {
    label:    'SUPPLY BUILDING',
    sublabel: 'Selling pressure growing above level',
    color:    'text-signal-resistance/80',
    bg:       'bg-signal-resistanceSoft',
  }

  return {
    label:    'MIXED',
    sublabel: 'No clear directional dark pool signal',
    color:    'text-text-tertiary',
    bg:       'bg-bg-elevated',
  }
}

export function midDpWarning(darkPool) {
  if (darkPool <= CASCADE_TRIGGER) return { show: true, text: 'Past cascade threshold', color: 'text-state-cascadeActive' }
  if (darkPool <= CASCADE_WATCH)   return { show: true, text: 'Approaching cascade threshold', color: 'text-state-cascadeWatch' }
  return { show: false }
}
