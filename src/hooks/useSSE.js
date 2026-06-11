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
  const [sessionBrief, setSessionBrief]       = useState(null)
  const [tacticalBrief, setTacticalBrief]     = useState(null)
  const [assistantRead, setAssistantRead]     = useState(null)
  const [priceVelocity, setPriceVelocity]     = useState(0)
  const [levelTouches, setLevelTouches]       = useState({})
  const [priceHistory, setPriceHistory]       = useState([])
  const [systemPaused, setSystemPaused]       = useState(false)
  const [pausedAt, setPausedAt]               = useState(null)
  const [activeTrades, setActiveTrades]       = useState({})
  const [sessionRatio, setSessionRatio]       = useState(null)
  const [sessionRatioLockedAt, setSessionRatioLockedAt] = useState(null)
  const [ratioIsLocked, setRatioIsLocked]     = useState(false)
  const [ratioIsFromToday, setRatioIsFromToday] = useState(false)
  const [contractRollover, setContractRollover] = useState(null)
  const esRef = useRef(null)
  const lastRescoreRef = useRef(0)
  const priceHistoryRef = useRef([])

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
            if (data?.systemPaused !== undefined) setSystemPaused(data.systemPaused)
            if (data?.pausedAt !== undefined) setPausedAt(data.pausedAt)
          })
          .catch(() => {})
        // Restore assistant read
        fetch(`${apiBase}/assistant-read`)
          .then(r => r.json())
          .then(data => { if (data?.assistantRead) setAssistantRead(data.assistantRead) })
          .catch(() => {})
        // Restore session + tactical brief
        fetch(`${apiBase}/session-brief`)
          .then(r => r.json())
          .then(data => {
            if (data?.session) setSessionBrief(data.session)
            if (data?.tactical) setTacticalBrief(data.tactical)
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
        // Restore price history
        fetch(`${apiBase}/price-history`)
          .then(r => r.json())
          .then(data => {
            if (data?.priceHistory?.length > 0) {
              priceHistoryRef.current = data.priceHistory
              setPriceHistory(data.priceHistory)
            }
          })
          .catch(() => {})
        // Restore level touches
        fetch(`${apiBase}/level-touches`)
          .then(r => r.json())
          .then(data => { if (data?.touches) setLevelTouches(data.touches) })
          .catch(() => {})
        // Restore ratio lock state + contract recalibrating flag
        fetch(`${apiBase}/status`)
          .then(r => r.json())
          .then(data => {
            if (data?.ratioIsLocked) {
              setRatioIsLocked(true)
              setSessionRatio(data.sessionRatio)
              setSessionRatioLockedAt(data.sessionRatioLockedAt)
              setRatioIsFromToday(data.ratioIsFromToday ?? false)
            }
            if (data?.contractRecalibrating) {
              setContractRollover({
                from: data.contractRolledFrom,
                to: data.nqContract,
                recalibrating: true,
                message: `NQ rolled ${data.contractRolledFrom}→${data.nqContract} — recalibrating levels`,
              })
            }
          })
          .catch(() => {})
        // Restore active trades (per-symbol)
        fetch(`${apiBase}/trade/active`)
          .then(r => r.json())
          .then(data => {
            if (data.trades) {
              setActiveTrades(data.trades)
            } else if (data.trade) {
              // Legacy single-trade fallback
              const sym = data.trade.symbol || 'NQ'
              setActiveTrades(prev => ({ ...prev, [sym]: data.trade }))
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
          console.log('[SSE] rescore levels:', data.result?.levels?.length, '| S1:', data.result?.levels?.find(l => l.id === 'S1')?.classification, 'dp:', data.result?.levels?.find(l => l.id === 'S1')?.dark_pool)
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
          // Safety fetch: ensure rescoreData always reflects current server state
          const apiBase = url.replace(/\/stream$/, '')
          fetch(`${apiBase}/latest`)
            .then(r => r.json())
            .then(latestResult => {
              if (latestResult?.levels?.length > 0) {
                console.log('[SSE] /latest sync: S1:', latestResult.levels.find(l => l.id === 'S1')?.classification, 'dp:', latestResult.levels.find(l => l.id === 'S1')?.dark_pool)
                setRescoreData(prev => prev ? { ...prev, result: latestResult } : { type: 'rescore', result: latestResult })
              }
            })
            .catch(() => {})
          return
        }

        if (data.type === 'price') {
          // Update price only — does NOT trigger rescore re-renders
          setPriceData({ price: data.price, timestamp: data.timestamp, interval: data.interval, isMarketHours: data.isMarketHours })
          // Track velocity
          const ph = priceHistoryRef.current
          ph.push({ price: data.price, ts: Date.now() })
          if (ph.length > 5) ph.shift()
          if (ph.length >= 2) {
            const change  = ph[ph.length - 1].price - ph[0].price
            const elapsed = (ph[ph.length - 1].ts - ph[0].ts) / 1000
            if (elapsed > 0) setPriceVelocity(change / elapsed)
          }
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
        if (data.type === 'assistant_read_update') {
          if (data.assistantRead) setAssistantRead(data.assistantRead)
          return
        }
        if (data.type === 'session_brief_update') {
          if (data.session)  setSessionBrief(data.session)
          if (data.tactical) setTacticalBrief(data.tactical)
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
        if (data.type === 'system_paused')    { setSystemPaused(true);  setPausedAt(data.pausedAt || null);  return }
        if (data.type === 'system_resumed')   { setSystemPaused(false); setPausedAt(null);                   return }
        if (data.type === 'level_source_mode_changed') { console.log('[levels] source mode:', data.mode);          return }
        if (data.type === 'levels_auto_updated')       { console.log('[levels] auto-updated:', data.mode, data.levelData?.r1_qqq); return }
        if (data.type === 'symbol_changed') {
          setNarrative([])
          setAssistantRead(null)
          setSessionBrief(null)
          setTacticalBrief(null)
          setLevelNarratives({})
          return
        }
        if (data.type === 'trade_entered') {
          setActiveTrades(prev => ({ ...prev, [data.symbol]: data.trade }))
          return
        }
        if (data.type === 'trade_exited') {
          setActiveTrades(prev => ({ ...prev, [data.symbol]: null }))
          return
        }
        if (data.type === 'ratio_locked') {
          setRatioIsLocked(true)
          setSessionRatio(data.ratio)
          setSessionRatioLockedAt(data.lockedAt)
          setRatioIsFromToday(true)
          return
        }
        if (data.type === 'contract_rollover') {
          setContractRollover({ from: data.from, to: data.to, recalibrating: true, message: data.message })
          return
        }
        if (data.type === 'contract_ready') {
          setContractRollover(prev => prev ? { ...prev, recalibrating: false } : null)
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
    pendingLevels,
    clearPendingLevels: () => setPendingLevels(null),
    levelNarratives,
    sessionBrief,
    tacticalBrief,
    assistantRead,
    priceVelocity,
    levelTouches,
    priceHistory,
    systemPaused,
    pausedAt,
    activeTrades,
    setActiveTrades,
    sessionRatio,
    sessionRatioLockedAt,
    ratioIsLocked,
    ratioIsFromToday,
    contractRollover,
  }
}
