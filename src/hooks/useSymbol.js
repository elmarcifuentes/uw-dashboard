import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function useSymbol() {
  const [activeSymbol, setActiveSymbol] = useState(
    () => localStorage.getItem('activeSymbol') || 'NQ'
  )

  const changeSymbol = (symbol) => {
    setActiveSymbol(symbol)
    localStorage.setItem('activeSymbol', symbol)
    fetch(`${API_URL}/settings/symbol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    }).catch(() => {})
  }

  // Sync active symbol to server on mount
  useEffect(() => {
    const symbol = localStorage.getItem('activeSymbol') || 'NQ'
    fetch(`${API_URL}/settings/symbol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    }).catch(() => {})
  }, [])

  return { activeSymbol, changeSymbol }
}
