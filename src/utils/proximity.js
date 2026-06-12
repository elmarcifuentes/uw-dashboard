import { CASCADE_TRIGGER, CASCADE_WATCH } from './cascade'

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

  // Proximity glow/border tracks scored bias (the action) → signal-* tokens, zone = intensity.
  // no_edge is neutral (no action color). Glow rgba match the token hexes.
  const colorMap = {
    sell_resistance: {
      critical: { border: 'border-2 border-signal-resistance',    glow: 'shadow-[0_0_20px_rgba(255,107,107,0.5)]',  labelColor: 'text-signal-resistance'    },
      near:     { border: 'border border-signal-resistance/70',   glow: 'shadow-[0_0_12px_rgba(255,107,107,0.3)]',  labelColor: 'text-signal-resistance'    },
      watching: { border: 'border border-signal-resistance/40',   glow: 'shadow-[0_0_6px_rgba(255,107,107,0.15)]',  labelColor: 'text-signal-resistance/80' },
    },
    buy_support: {
      critical: { border: 'border-2 border-signal-support',       glow: 'shadow-[0_0_20px_rgba(47,212,122,0.5)]',   labelColor: 'text-signal-support'    },
      near:     { border: 'border border-signal-support/70',      glow: 'shadow-[0_0_12px_rgba(47,212,122,0.3)]',   labelColor: 'text-signal-support'    },
      watching: { border: 'border border-signal-support/40',      glow: 'shadow-[0_0_6px_rgba(47,212,122,0.15)]',   labelColor: 'text-signal-support/80' },
    },
    no_edge: {
      critical: { border: 'border-2 border-border-strong',        glow: '',  labelColor: 'text-text-tertiary' },
      near:     { border: 'border border-border-default',         glow: '',  labelColor: 'text-text-tertiary' },
      watching: { border: 'border border-border-subtle',          glow: '',  labelColor: 'text-text-muted'    },
    },
    continuation: {
      critical: { border: 'border-2 border-signal-continuation',  glow: 'shadow-[0_0_20px_rgba(91,167,255,0.4)]',   labelColor: 'text-signal-continuation'    },
      near:     { border: 'border border-signal-continuation/70', glow: 'shadow-[0_0_10px_rgba(91,167,255,0.2)]',   labelColor: 'text-signal-continuation'    },
      watching: { border: 'border border-signal-continuation/40', glow: 'shadow-[0_0_4px_rgba(91,167,255,0.1)]',    labelColor: 'text-signal-continuation/80' },
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
    const gap = Math.abs(CASCADE_TRIGGER - dp)
    if (dp <= CASCADE_TRIGGER) {
      label = label.replace('unconfirmed level', '⚠ cascade threshold — monitor S1/S2')
    } else if (dp <= CASCADE_WATCH) {
      label = label.replace('unconfirmed level', `cascade trigger — ${gap.toFixed(3)} from -0.700`)
    }
  }

  return { ...colors, pulse: zone === 'critical', label }
}
