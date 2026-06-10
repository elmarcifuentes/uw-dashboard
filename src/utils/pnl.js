export const INSTRUMENTS = {
  NQ:  { type: 'futures', pointValue: 20,  tickSize: 0.25, label: 'NQ (Full)'   },
  MNQ: { type: 'futures', pointValue: 2,   tickSize: 0.25, label: 'MNQ (Micro)' },
  ES:  { type: 'futures', pointValue: 50,  tickSize: 0.25, label: 'ES (Full)'   },
  MES: { type: 'futures', pointValue: 5,   tickSize: 0.25, label: 'MES (Micro)' },
  QQQ: { type: 'equity',  pointValue: 1,   tickSize: 0.01, label: 'QQQ'         },
  SPY: { type: 'equity',  pointValue: 1,   tickSize: 0.01, label: 'SPY'         },
}

export function calcPnL(direction, entry, currentPrice, instrument, contracts = 1) {
  const inst = INSTRUMENTS[instrument]
  if (!inst) return null

  const pnlPoints  = direction === 'short' ? entry - currentPrice : currentPrice - entry
  const pnlDollars = pnlPoints * inst.pointValue * contracts

  return {
    points:     parseFloat(pnlPoints.toFixed(2)),
    dollars:    parseFloat(pnlDollars.toFixed(2)),
    isProfit:   pnlPoints > 0,
    instrument: inst,
    contracts,
  }
}

export function formatPnL(pnl) {
  if (!pnl) return '—'
  const sign = pnl.isProfit ? '+' : ''
  if (pnl.instrument.type === 'futures') {
    return `${sign}${pnl.points.toFixed(2)} pts · ${sign}$${Math.abs(pnl.dollars).toFixed(2)}`
  }
  return `${sign}$${Math.abs(pnl.dollars).toFixed(2)}`
}
