// Post-process Claude narrative text for active symbol display.
// In NQ mode, converts paired "$703.54 (NQ 28,945)" to "$28,945.00" —
// showing only the NQ price with universal $ prefix.
// In QQQ mode, text is already in the right format — returned unchanged.

export function formatNarrative(text, activeSymbol) {
  if (!text) return text
  if (activeSymbol !== 'NQ') return text
  return text.replace(
    /\$[\d,]+\.?\d*\s*\(NQ\s*([\d,]+\.?\d*)\)/g,
    (_, nqStr) => {
      const num = parseFloat(nqStr.replace(/,/g, ''))
      return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
  )
}
