import { useState, useEffect, useRef } from 'react'

export function useSSE(url) {
  const [rescoreData, setRescoreData]         = useState(null)
  const [priceData, setPriceData]             = useState(null)
  const [connected, setConnected]             = useState(false)
  const [history, setHistory]                 = useState([])
  const [levelAlert, setLevelAlert]           = useState(null)
  const [chartStale, setChartStale]           = useState(false)
  const [staleChanges, setStaleChanges]       = useState([])
  const [expansionGex, setExpansionGex]       = useState([])
  const [pinningSessions, setPinningSessions] = useState(0)
  const [midDpHistory, setMidDpHistory]       = useState([])
  const [dpHistory, setDpHistory]             = useState({})
  const [narrative, setNarrative]             = useState([])
  const [sentiment, setSentiment]             = useState(null)
  const [narrativeMode, setNarrativeMode]     = useState('template')
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

        if (data.type === 'rescore') {
          setRescoreData(data)
          setHistory(prev => [data, ...prev].slice(0, 50))
          if (data.expansionGex !== undefined) setExpansionGex(data.expansionGex || [])
          if (data.dpHistory)  setDpHistory(data.dpHistory)
          if (data.narrative)  setNarrative(data.narrative)
          if (data.sentiment)  setSentiment(data.sentiment)
          const midLevel = data.result?.levels?.find(l => l.id === 'MID')
          if (midLevel?.dark_pool !== undefined) {
            setMidDpHistory(prev =>
              [...prev, { value: midLevel.dark_pool, time: data.timestamp }].slice(-5)
            )
          }
          // Also update priceData from rescore so price shows immediately
          if (data.result?.current_price != null) {
            setPriceData({ price: data.result.current_price, timestamp: data.timestamp, interval: null })
          }
          return
        }

        if (data.type === 'price') {
          // Update price only — does NOT trigger rescore re-renders
          setPriceData({ price: data.price, timestamp: data.timestamp, interval: data.interval, isMarketHours: data.isMarketHours })
          return
        }

        if (data.type === 'level_update_alert') { setLevelAlert(data);                            return }
        if (data.type === 'chart_stale')        { setChartStale(true); setStaleChanges(data.changes || []); return }
        if (data.type === 'chart_synced')       { setChartStale(false); setStaleChanges([]);       return }
        if (data.type === 'narrative_mode')     { setNarrativeMode(data.mode);                     return }
        if (data.type === 'expansion_gex') {
          setExpansionGex(data.levels || [])
          setPinningSessions(data.consecutivePinningSessions ?? 0)
          return
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
    return () => { destroyed = true; esRef.current?.close() }
  }, [url])

  return {
    rescoreData,
    priceData,
    connected,
    history,
    levelAlert,
    clearLevelAlert: () => setLevelAlert(null),
    chartStale,
    staleChanges,
    expansionGex,
    pinningSessions,
    midDpHistory,
    dpHistory,
    narrative,
    sentiment,
    narrativeMode,
  }
}
