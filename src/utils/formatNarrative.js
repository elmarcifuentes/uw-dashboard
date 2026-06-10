const fmt = (nqVal) =>
  '$' + parseFloat(nqVal.replace(/,/g, '')).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export function formatNarrative(text, activeSymbol) {
  if (!text) return text

  if (activeSymbol === 'NQ') {
    // Pattern 1: "$703.54 (NQ 28,945)" → "$28,945.00"
    text = text.replace(
      /\$[\d,]+\.?\d*\s*\(NQ\s*([\d,]+\.?\d*)\)/g,
      (_, nqVal) => fmt(nqVal)
    )
    // Pattern 2: standalone "NQ 28,945" → "$28,945.00"
    text = text.replace(
      /\bNQ\s+([\d,]+\.?\d*)\b/g,
      (_, nqVal) => fmt(nqVal)
    )
    return text
  }

  if (activeSymbol === 'QQQ') {
    // Strip parenthetical NQ refs: "$706.67 (NQ 29,069)" → "$706.67"
    text = text.replace(
      /(\$[\d,]+\.?\d*)\s*\(NQ\s*[\d,]+\.?\d*\)/g,
      '$1'
    )
    // Strip standalone parenthetical NQ refs
    text = text.replace(/\s*\(NQ\s*[\d,]+\.?\d*\)/g, '')
    return text
  }

  return text
}
