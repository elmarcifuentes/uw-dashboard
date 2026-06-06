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
  const [pendingLevels, setPendingLevels]     = useState(null)
  const [levelNarratives, setLevelNarratives] = useState({})
  const esRef = useRef(null)
  const lastRescoreRef = useRef(0)

  useEffect(() => {
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => {
        if (destroyed) return
        setConnected(true)
        console.log('[SSE] connected')
        const apiBase = url.replace(/\/stream$/, '')
        // Restore narrative mode immediately — no waiting for SSE event
        fetch(`${apiBase}/status`)
          .then(r => r.json())
          .then(data => {
            if (data?.narrativeMode) {
              console.log('[SSE] narrative mode restored from status:', data.narrativeMode)
              setNarrativeMode(data.narrativeMode)
            }
          })
          .catch(() => {})
        // Restore level narratives
        fetch(`${apiBase}/level-narratives`)
          .then(r => r.json())
          .then(data => {
            if (data?.narratives && Object.keys(data.narratives).length > 0) {
              console.log('[SSE] restored level narratives:', Object.keys(data.narratives))
              setLevelNarratives(data.narratives)
            }
          })
          .catch(() => {})
        // Restore last narrative content immediately
        fetch(`${apiBase}/narrative`)
          .then(r => r.json())
          .then(data => {
            if (data?.narrative?.length > 0) {
              console.log('[SSE] restored narrative on connect:', data.narrative.length, 'lines')
              setNarrative(data.narrative)
            }
          })
          .catch(() => {})
      }

      es.onmessage = (event) => {
        if (destroyed) return
        const data = JSON.parse(event.data)
        if (data.type === 'heartbeat') return

        if (data.type === 'rescore') {
          const now = Date.now()
          if (now - lastRescoreRef.current < 2000) {
            console.log('[SSE] Debouncing rapid rescore')
            return
          }
          lastRescoreRef.current = now
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
        if (data.type === 'narrative_update')   {
          console.log('[SSE] narrative_update received:', data.narrative?.length, 'lines')
          console.log('[SSE] line 1:', data.narrative?.[0])
          setNarrative(data.narrative || [])
          return
        }
        if (data.type === 'expansion_gex') {
          setExpansionGex(data.levels || [])
          setPinningSessions(data.consecutivePinningSessions ?? 0)
          return
        }
        if (data.type === 'level_narratives_update') {
          console.log('[SSE] level narratives updated:', Object.keys(data.narratives || {}))
          setLevelNarratives(data.narratives || {})
          return
        }
        if (data.type === 'levels_pending')   { setPendingLevels(data.levels); return }
        if (data.type === 'levels_dismissed') { setPendingLevels(null);        return }
        if (data.type === 'levels_updated')   { setPendingLevels(null);        return }
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
    pendingLevels,
    clearPendingLevels: () => setPendingLevels(null),
    levelNarratives,
  }
}
