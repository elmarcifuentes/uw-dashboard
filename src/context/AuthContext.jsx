import { createContext, useContext, useState } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin]           = useState('')

  const unlock = (enteredPin) => {
    setPin(enteredPin)
    setUnlocked(true)
  }

  const lock = () => {
    setUnlocked(false)
    setPin('')
  }

  const authPost = async (url, body = {}) => {
    if (!unlocked) throw new Error('Not unlocked')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, pin }),
    })
    if (res.status === 401) {
      lock()
      throw new Error('Invalid PIN — locked')
    }
    return res.json()
  }

  return (
    <AuthContext.Provider value={{ unlocked, pin, unlock, lock, authPost }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
