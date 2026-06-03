import { useState, useEffect, useRef } from 'react'

export function useSSE(url) {
  const [lastEvent, setLastEvent]         = useState(null)
  const [connected, setConnected]         = useState(false)
  const [history, setHistory]             = useState([])
  const [levelAlert, setLevelAlert]       = useState(null)
  const [chartStale, setChartStale]       = useState(false)
  const [staleChanges, setStaleChanges]   = useState([])
  const [expansionGex, setExpansionGex]       = useState([])
  const [pinningSessions, setPinningSessions] = useState(0)
  const [midDpHistory, setMidDpHistory]       = useState([])
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

        if (data.type === 'chart_stale') {
          setChartStale(true)
          setStaleChanges(data.changes || [])
          return
        }

        if (data.type === 'chart_synced') {
          setChartStale(false)
          setStaleChanges([])
          return
        }

        if (data.type === 'expansion_gex') {
          setExpansionGex(data.levels || [])
          setPinningSessions(data.consecutivePinningSessions ?? 0)
          return
        }

        setLastEvent(data)

        if (data.type === 'rescore') {
          setHistory(prev => [data, ...prev].slice(0, 50))
          if (data.expansionGex !== undefined) {
            setExpansionGex(data.expansionGex || [])
          }
          const midLevel = data.result?.levels?.find(l => l.id === 'MID')
          if (midLevel?.dark_pool !== undefined) {
            setMidDpHistory(prev =>
              [...prev, { value: midLevel.dark_pool, time: data.timestamp }].slice(-5)
            )
          }
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

  return {
    lastEvent,
    connected,
    history,
    levelAlert,
    clearLevelAlert: () => setLevelAlert(null),
    chartStale,
    staleChanges,
    expansionGex,
    pinningSessions,
    midDpHistory,
  }
}
