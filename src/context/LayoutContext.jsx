import { createContext, useContext, useState } from 'react'

const LayoutContext = createContext()

export function LayoutProvider({ children }) {
  const [compact, setCompact] = useState(() => {
    return localStorage.getItem('uw-layout') === 'compact'
  })

  const toggle = () => {
    setCompact(prev => {
      const next = !prev
      localStorage.setItem('uw-layout', next ? 'compact' : 'full')
      return next
    })
  }

  return (
    <LayoutContext.Provider value={{ compact, toggle }}>
      {children}
    </LayoutContext.Provider>
  )
}

export const useLayout = () => useContext(LayoutContext)
