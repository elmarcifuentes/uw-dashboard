import { useState, useEffect, useRef } from 'react'

export function useServerHealth(apiUrl) {
  const [restarted, setRestarted]   = useState(false)
  const [hasData, setHasData]       = useState(true)
  const lastStartedAtRef            = useRef(null)

  useEffect(() => {
    console.log('[health] Starting server health checks')
    const check = async () => {
      try {
        const res  = await fetch(`${apiUrl}/uptime`)
        const data = await res.json()
        console.log('[health] uptime check:', data.uptime_seconds + 's | has_data:', data.has_data, '| started:', data.started_at?.slice(11, 19))

        // Detect restart: started_at changed AND data not yet loaded
        if (lastStartedAtRef.current &&
            lastStartedAtRef.current !== data.started_at &&
            !data.has_data) {
          setRestarted(true)
          console.log('[health] Server restart detected (no data)')
        }

        // Clear banner the moment data is present
        if (data.has_data) {
          setRestarted(false)
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
