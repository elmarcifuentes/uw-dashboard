// Instrument registry — add new instruments here, nothing else needs to change

export const INSTRUMENT_REGISTRY = {

  // ─── NQ Futures ───────────────────────────────────────────────────────────
  NQ: {
    symbol:        'NQ',
    name:          'Nasdaq 100 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    20,
    tickSize:      0.25,
    tickValue:     5,
    priceUnit:     'NQ',
    label:         'NQ (Full)',
    description:   'Full-size NQ · $20/pt · $5/tick',
    relatedSymbol: 'QQQ',
  },

  MNQ: {
    symbol:        'MNQ',
    name:          'Micro Nasdaq 100 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    2,
    tickSize:      0.25,
    tickValue:     0.50,
    priceUnit:     'NQ',
    label:         'MNQ (Micro)',
    description:   'Micro NQ · $2/pt · $0.50/tick',
    relatedSymbol: 'QQQ',
  },

  // ─── ES Futures ───────────────────────────────────────────────────────────
  ES: {
    symbol:        'ES',
    name:          'S&P 500 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    50,
    tickSize:      0.25,
    tickValue:     12.50,
    priceUnit:     'ES',
    label:         'ES (Full)',
    description:   'Full-size ES · $50/pt · $12.50/tick',
    relatedSymbol: 'SPY',
  },

  MES: {
    symbol:        'MES',
    name:          'Micro S&P 500 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    5,
    tickSize:      0.25,
    tickValue:     1.25,
    priceUnit:     'ES',
    label:         'MES (Micro)',
    description:   'Micro ES · $5/pt · $1.25/tick',
    relatedSymbol: 'SPY',
  },

  // ─── RTY Futures ──────────────────────────────────────────────────────────
  RTY: {
    symbol:        'RTY',
    name:          'Russell 2000 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    50,
    tickSize:      0.10,
    tickValue:     5,
    priceUnit:     'RTY',
    label:         'RTY (Full)',
    description:   'Full-size RTY · $50/pt · $5/tick',
    relatedSymbol: 'IWM',
  },

  M2K: {
    symbol:        'M2K',
    name:          'Micro Russell 2000 Futures',
    type:          'futures',
    exchange:      'CME',
    pointValue:    5,
    tickSize:      0.10,
    tickValue:     0.50,
    priceUnit:     'RTY',
    label:         'M2K (Micro)',
    description:   'Micro RTY · $5/pt · $0.50/tick',
    relatedSymbol: 'IWM',
  },

  // ─── ETFs / Equities ──────────────────────────────────────────────────────
  QQQ: {
    symbol:        'QQQ',
    name:          'Invesco QQQ ETF',
    type:          'equity',
    exchange:      'NASDAQ',
    pointValue:    1,
    tickSize:      0.01,
    tickValue:     0.01,
    priceUnit:     'QQQ',
    label:         'QQQ',
    description:   'QQQ ETF · $1/pt per share',
    relatedSymbol: 'NQ',
    shareUnit:     true,
  },

  SPY: {
    symbol:        'SPY',
    name:          'SPDR S&P 500 ETF',
    type:          'equity',
    exchange:      'NYSE',
    pointValue:    1,
    tickSize:      0.01,
    tickValue:     0.01,
    priceUnit:     'SPY',
    label:         'SPY',
    description:   'SPY ETF · $1/pt per share',
    relatedSymbol: 'ES',
    shareUnit:     true,
  },

  IWM: {
    symbol:        'IWM',
    name:          'iShares Russell 2000 ETF',
    type:          'equity',
    exchange:      'NYSE',
    pointValue:    1,
    tickSize:      0.01,
    tickValue:     0.01,
    priceUnit:     'IWM',
    label:         'IWM',
    description:   'IWM ETF · $1/pt per share',
    relatedSymbol: 'RTY',
    shareUnit:     true,
  },
}

// ─── Registry helpers ─────────────────────────────────────────────────────

export function getInstrument(symbol) {
  const inst = INSTRUMENT_REGISTRY[symbol]
  if (!inst) { console.warn('[pnl] Unknown instrument:', symbol); return null }
  return inst
}

export function isFutures(symbol) {
  return getInstrument(symbol)?.type === 'futures'
}

export function isEquity(symbol) {
  return getInstrument(symbol)?.type === 'equity'
}

export function getInstrumentsForSymbol(activeSymbol) {
  return Object.values(INSTRUMENT_REGISTRY).filter(inst =>
    inst.priceUnit === activeSymbol || inst.symbol === activeSymbol
  )
}

export function getInstrumentGroups(activeSymbol) {
  const all = getInstrumentsForSymbol(activeSymbol)
  const groups = {}
  all.forEach(inst => {
    const group = inst.type === 'futures'
      ? inst.name.replace('Micro ', '').replace(' Futures', '')
      : 'ETF'
    if (!groups[group]) groups[group] = []
    groups[group].push(inst)
  })
  return groups
}

// ─── P&L calculation ──────────────────────────────────────────────────────

export function calcPnL(direction, entryPrice, currentPrice, instrumentSymbol, contracts = 1) {
  const inst = getInstrument(instrumentSymbol)
  if (!inst) return null
  if (entryPrice == null || currentPrice == null) return null

  const pnlPoints  = direction === 'short' ? entryPrice - currentPrice : currentPrice - entryPrice
  const pnlDollars = pnlPoints * inst.pointValue * contracts
  const ticksMoved = pnlPoints / inst.tickSize

  return {
    points:     parseFloat(pnlPoints.toFixed(2)),
    dollars:    parseFloat(pnlDollars.toFixed(2)),
    ticks:      parseFloat(ticksMoved.toFixed(1)),
    isProfit:   pnlPoints > 0,
    contracts,
    instrument: inst,
    pointsStr:  `${pnlPoints > 0 ? '+' : ''}${pnlPoints.toFixed(2)} pts`,
    dollarsStr: `${pnlDollars > 0 ? '+' : ''}$${Math.abs(pnlDollars).toFixed(2)}`,
  }
}

// ─── Risk / reward ────────────────────────────────────────────────────────

export function calcMaxLoss(entry, stop, instrumentSymbol, contracts = 1) {
  const inst = getInstrument(instrumentSymbol)
  if (!inst) return null
  const riskPoints  = Math.abs(entry - stop)
  const riskDollars = riskPoints * inst.pointValue * contracts
  return { points: parseFloat(riskPoints.toFixed(2)), dollars: parseFloat(riskDollars.toFixed(2)) }
}

export function calcMaxGain(entry, target, instrumentSymbol, contracts = 1) {
  const inst = getInstrument(instrumentSymbol)
  if (!inst) return null
  const gainPoints  = Math.abs(target - entry)
  const gainDollars = gainPoints * inst.pointValue * contracts
  return { points: parseFloat(gainPoints.toFixed(2)), dollars: parseFloat(gainDollars.toFixed(2)) }
}

// ─── Format helpers ───────────────────────────────────────────────────────

export function formatPnL(pnl) {
  if (!pnl?.instrument) return '—'
  return pnl.instrument.type === 'futures'
    ? `${pnl.pointsStr} · ${pnl.dollarsStr}`
    : pnl.dollarsStr
}

export function formatPrice(price, instrumentSymbol) {
  const inst = getInstrument(instrumentSymbol)
  if (!inst) return price?.toString() || '—'
  if (inst.type === 'futures') {
    return price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '—'
  }
  return price != null ? `$${price.toFixed(2)}` : '—'
}

// Legacy export for compatibility
export const INSTRUMENTS = INSTRUMENT_REGISTRY
