export function dpConditionLabel(darkPool, levelType, classification) {
  if (darkPool === -1 || darkPool === -1.0) {
    return {
      label:    'PRICE ARTIFACT',
      sublabel: 'Price above level — prints in resistance window only',
      color:    'text-gray-400',
      bg:       'bg-gray-800',
    }
  }

  if (darkPool === 1 || darkPool === 1.0) {
    const magnet = levelType === 'resistance' && classification === 'buy_support'
    return {
      label:    'MAXIMUM ABSORPTION',
      sublabel: magnet
        ? 'All prints below level — resistance magnet active'
        : 'All institutional prints below this level',
      color:    'text-green-400',
      bg:       'bg-green-950',
    }
  }

  if (darkPool === 0) {
    return {
      label:    'STRUCTURAL VOID',
      sublabel: 'No dark pool prints in either window',
      color:    'text-gray-500',
      bg:       'bg-gray-900',
    }
  }

  if (darkPool >= 0.700) return {
    label:    'STRONG ABSORPTION',
    sublabel: 'Heavy institutional buying below level',
    color:    'text-green-400',
    bg:       'bg-green-950',
  }

  if (darkPool >= 0.300) return {
    label:    'ACCUMULATION',
    sublabel: 'Buying interest building below level',
    color:    'text-green-300',
    bg:       'bg-green-950',
  }

  if (darkPool > 0) return {
    label:    'MILD ABSORPTION',
    sublabel: 'Slight buying lean — monitor for development',
    color:    'text-gray-400',
    bg:       'bg-gray-800',
  }

  if (darkPool <= -0.700) return {
    label:    'SUPPLY CONFIRMED',
    sublabel: 'Heavy institutional selling above level',
    color:    'text-red-400',
    bg:       'bg-red-950',
  }

  if (darkPool <= -0.300) return {
    label:    'SUPPLY BUILDING',
    sublabel: 'Selling pressure growing above level',
    color:    'text-amber-400',
    bg:       'bg-amber-950',
  }

  return {
    label:    'MIXED',
    sublabel: 'No clear directional dark pool signal',
    color:    'text-gray-400',
    bg:       'bg-gray-800',
  }
}

export function midDpWarning(darkPool) {
  if (darkPool <= -0.700) return { show: true, text: 'Past cascade threshold', color: 'text-red-400' }
  if (darkPool <= -0.500) return { show: true, text: 'Approaching cascade threshold', color: 'text-amber-400' }
  return { show: false }
}
