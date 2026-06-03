import { useState, useEffect, useRef } from 'react'

export function useSSE(url) {
  const [lastEvent, setLastEvent]   = useState(null)
  const [connected, setConnected]   = useState(false)
  const [history, setHistory]       = useState([])
  const [levelAlert, setLevelAlert] = useState(null)
  const esRef = useRef(null)

  useEffect(() => {
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => { if (!destroyed) setConnected(true) }

      es.onmessage = (event) => {
        if (destroyed) return
        const data = JSON.parse(event.data)
        if (data.type === 'heartbeat') return

        if (data.type === 'level_update_alert') {
          setLevelAlert(data)
          return
        }

        setLastEvent(data)
        if (data.type === 'rescore') {
          setHistory(prev => [data, ...prev].slice(0, 50))
        }
      }

      es.onerror = () => {
        if (destroyed) return
        setConnected(false)
        es.close()
        setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      destroyed = true
      esRef.current?.close()
    }
  }, [url])

  return { lastEvent, connected, history, levelAlert, clearLevelAlert: () => setLevelAlert(null) }
}
