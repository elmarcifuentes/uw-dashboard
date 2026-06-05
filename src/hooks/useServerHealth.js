import { useState, useEffect, useRef } from 'react'

export function useServerHealth(apiUrl) {
  const [restarted, setRestarted]   = useState(false)
  const [hasData, setHasData]       = useState(true)
  const lastStartedAtRef            = useRef(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch(`${apiUrl}/uptime`)
        const data = await res.json()

        // Detect restart: started_at changed from what we last saw
        if (lastStartedAtRef.current &&
            lastStartedAtRef.current !== data.started_at) {
          setRestarted(true)
          console.log('[health] Server restart detected')
        }

        // Flag if server is very fresh and has no data
        if (data.uptime_seconds < 180 && !data.has_data) {
          setRestarted(true)
        }

        lastStartedAtRef.current = data.started_at
        setHasData(data.has_data)
      } catch {
        // Unreachable — may be mid-restart, don't change state
      }
    }

    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [apiUrl])

  return { restarted, hasData, dismiss: () => setRestarted(false) }
}
