export function getLevelProximity(currentPrice, levelPrice) {
  if (currentPrice == null || levelPrice == null) return null
  const dist    = currentPrice - levelPrice
  const absDist = Math.abs(dist)
  const fromBelow = dist < 0

  let zone
  if      (absDist <= 0.15) zone = 'critical'
  else if (absDist <= 0.50) zone = 'near'
  else if (absDist <= 1.00) zone = 'watching'
  else                      zone = 'away'

  return { zone, dist, absDist, fromBelow }
}

export function getProximityStyles(proximity, classification, level) {
  if (!proximity || proximity.zone === 'away') {
    return { border: '', glow: '', pulse: false, label: null, labelColor: '' }
  }

  const { zone, absDist, fromBelow } = proximity

  const colorMap = {
    sell_resistance: {
      critical: { border: 'border-2 border-red-400',   glow: 'shadow-[0_0_20px_rgba(248,113,113,0.5)]',  labelColor: 'text-red-400'   },
      near:     { border: 'border border-red-500',      glow: 'shadow-[0_0_12px_rgba(248,113,113,0.3)]',  labelColor: 'text-red-500'   },
      watching: { border: 'border border-red-800',      glow: 'shadow-[0_0_6px_rgba(248,113,113,0.15)]',  labelColor: 'text-red-700'   },
    },
    buy_support: {
      critical: { border: 'border-2 border-green-400',  glow: 'shadow-[0_0_20px_rgba(74,222,128,0.5)]',   labelColor: 'text-green-400' },
      near:     { border: 'border border-green-500',    glow: 'shadow-[0_0_12px_rgba(74,222,128,0.3)]',   labelColor: 'text-green-500' },
      watching: { border: 'border border-green-800',    glow: 'shadow-[0_0_6px_rgba(74,222,128,0.15)]',   labelColor: 'text-green-700' },
    },
    no_edge: {
      critical: { border: 'border-2 border-amber-400',  glow: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',   labelColor: 'text-amber-400' },
      near:     { border: 'border border-amber-600',    glow: 'shadow-[0_0_10px_rgba(251,191,36,0.2)]',   labelColor: 'text-amber-500' },
      watching: { border: 'border border-amber-900',    glow: 'shadow-[0_0_4px_rgba(251,191,36,0.1)]',    labelColor: 'text-amber-700' },
    },
    continuation: {
      critical: { border: 'border-2 border-blue-400',   glow: 'shadow-[0_0_20px_rgba(96,165,250,0.4)]',   labelColor: 'text-blue-400'  },
      near:     { border: 'border border-blue-500',     glow: 'shadow-[0_0_10px_rgba(96,165,250,0.2)]',   labelColor: 'text-blue-500'  },
      watching: { border: 'border border-blue-800',     glow: 'shadow-[0_0_4px_rgba(96,165,250,0.1)]',    labelColor: 'text-blue-700'  },
    },
  }

  const cls    = classification || 'no_edge'
  const colors = colorMap[cls]?.[zone] || colorMap.no_edge[zone]

  const labelMap = {
    sell_resistance: {
      critical: fromBelow ? '⚡ AT resistance — supply zone'          : '⚡ AT resistance — retesting from above',
      near:     fromBelow ? `↑ $${absDist.toFixed(2)} — approaching resistance` : `↓ $${absDist.toFixed(2)} — retesting resistance`,
      watching: fromBelow ? `↑ $${absDist.toFixed(2)} — resistance above`       : `↓ $${absDist.toFixed(2)} — above resistance`,
    },
    buy_support: {
      critical: fromBelow ? '⚡ AT support — bouncing off floor'      : '⚡ AT support — testing floor from above',
      near:     fromBelow ? `↑ $${absDist.toFixed(2)} — support below`          : `↓ $${absDist.toFixed(2)} — approaching support`,
      watching: fromBelow ? `↑ $${absDist.toFixed(2)} — support below`          : `↓ $${absDist.toFixed(2)} — approaching support floor`,
    },
    no_edge: {
      critical: '⚡ AT level — no institutional read',
      near:     fromBelow ? `↑ $${absDist.toFixed(2)} — unconfirmed level`      : `↓ $${absDist.toFixed(2)} — unconfirmed level`,
      watching: fromBelow ? `↑ $${absDist.toFixed(2)} — level below`            : `↓ $${absDist.toFixed(2)} — level above`,
    },
    continuation: {
      critical: '⚡ AT continuation level',
      near:     fromBelow ? `↑ $${absDist.toFixed(2)} — continuation setup`     : `↓ $${absDist.toFixed(2)} — continuation setup`,
      watching: fromBelow ? `↑ $${absDist.toFixed(2)} — continuation above`     : `↓ $${absDist.toFixed(2)} — continuation below`,
    },
  }

  let label = labelMap[cls]?.[zone] || labelMap.no_edge[zone]

  // MID override — replace generic label with cascade context
  if (level?.id === 'MID' && label) {
    const dp  = level.dark_pool || 0
    const gap = Math.abs(-0.700 - dp)
    if (dp <= -0.700) {
      label = label.replace('unconfirmed level', '⚠ cascade threshold — monitor S1/S2')
    } else if (dp <= -0.500) {
      label = label.replace('unconfirmed level', `cascade trigger — ${gap.toFixed(3)} from -0.700`)
    }
  }

  return { ...colors, pulse: zone === 'critical', label }
}
