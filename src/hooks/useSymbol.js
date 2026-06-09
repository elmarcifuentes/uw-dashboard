import { useState } from 'react'

export function useSymbol() {
  const [activeSymbol, setActiveSymbol] = useState(
    () => localStorage.getItem('activeSymbol') || 'NQ'
  )

  const changeSymbol = (symbol) => {
    setActiveSymbol(symbol)
    localStorage.setItem('activeSymbol', symbol)
  }

  return { activeSymbol, changeSymbol }
}
