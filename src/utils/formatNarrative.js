// Post-process Claude narrative text for active symbol display.
// In NQ mode, replaces paired "$703.54 (NQ 28,945)" patterns with just "NQ 28,945".
// In QQQ mode, text is already in the right format — returned unchanged.

export function formatNarrative(text, activeSymbol) {
  if (!text) return text
  if (activeSymbol !== 'NQ') return text
  return text.replace(
    /\$[\d,]+\.?\d*\s*\(NQ\s*([\d,]+\.?\d*)\)/g,
    'NQ $1'
  )
}
