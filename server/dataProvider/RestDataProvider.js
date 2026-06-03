import DataProvider from './DataProvider.js'

export default class RestDataProvider extends DataProvider {
  constructor(apiKey, baseUrl, config) {
    super()
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.config = config
    this.mode = 'REST'
    this.callsToday = 0
    this._resetDay = this._utcMidnight()
    this.lastPrice = null
    this.lastRescore = null
    this.lastRescorePrice = null
    this.lastPriceCheck = null
    this.lastRescoreReason = null
    this.levels = []
    this.pollingTimer = null
    this.paused = false
    this.priceCallbacks = []
    this.levelCrossCallbacks = []
    this.rescoreCallbacks = []
  }

  _utcMidnight() {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    return d.getTime()
  }

  _checkDailyReset() {
    if (Date.now() >= this._resetDay + 86400000) {
      this.callsToday = 0
      this._resetDay += 86400000
      console.log('[DataProvider] Daily call counter reset')
    }
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'UW-CLIENT-API-ID': '100001',
    }
  }

  async _uwGet(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url.toString(), { headers: this._headers() })
    if (!res.ok) throw new Error(`UW API ${path} → ${res.status}`)
    return res.json()
  }

  async getCurrentPrice() {
    this._incrementBudget(1)
    const data = await this._uwGet('/api/stock/QQQ/stock-state')
    const row = data?.data ?? data
    const price = parseFloat(row?.close || row?.last || row?.price || 0)
    if (!price || isNaN(price)) throw new Error('getCurrentPrice: no valid price')
    return price
  }

  async getDarkPoolPrints(symbol = 'QQQ') {
    this._incrementBudget(1)
    return this._uwGet(`/api/darkpool/${symbol}`)
  }

  async getFlowAlerts(symbol = 'QQQ') {
    this._incrementBudget(1)
    return this._uwGet('/api/option-trades/flow-alerts', { ticker_symbol: symbol })
  }

  async getOptionsVolume(symbol = 'QQQ') {
    this._incrementBudget(1)
    return this._uwGet(`/api/stock/${symbol}/options-volume`)
  }

  async getGexByStrike(symbol = 'QQQ') {
    this._incrementBudget(1)
    return this._uwGet(`/api/stock/${symbol}/greek-exposure/strike`)
  }

  async getEtfTide(symbol = 'QQQ') {
    this._incrementBudget(1)
    return this._uwGet(`/api/market/${symbol}/etf-tide`)
  }

  _isMarketHours() {
    const now = new Date()
    const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const isWeekday = et.getDay() >= 1 && et.getDay() <= 5
    const timeVal   = et.getHours() * 60 + et.getMinutes()
    const open  = 8  * 60 + 30
    const close = 16 * 60 + 30
    return isWeekday && timeVal >= open && timeVal <= close
  }

  _getInterval(currentPrice) {
    if (!this._isMarketHours()) {
      return this.config.marketHours.overnightInterval
    }
    if (!currentPrice) return this.config.intervals.quiet
    const classified = this.levels.filter(l => l.classification && l.classification !== 'no_edge')
    if (!classified.length) return this.config.intervals.quiet
    const nearest = classified.reduce((min, l) =>
      Math.abs(currentPrice - l.price) < Math.abs(currentPrice - min.price) ? l : min
    )
    const dist = Math.abs(currentPrice - nearest.price)
    const { intervals } = this.config
    if (dist > 2.00) return intervals.quiet
    if (dist > 1.00) return intervals.approaching
    if (dist > 0.50) return intervals.near
    if (dist > 0.25) return intervals.close
    if (dist > 0.10) return intervals.veryClose
    return intervals.atLevel
  }

  _shouldRescore(currentPrice) {
    if (!this._isMarketHours() && !this.config.marketHours.overnightRescores) {
      return { trigger: false, reason: 'outside market hours' }
    }
    const t = this.config.triggers
    for (const level of this.levels) {
      if (Math.abs(currentPrice - level.price) <= t.levelCrossThreshold) {
        return { trigger: true, reason: `price near ${level.id || level.level_id} ±$${t.levelCrossThreshold}` }
      }
    }
    if (this.lastRescorePrice != null &&
        Math.abs(currentPrice - this.lastRescorePrice) >= t.priceMoveTrigger) {
      return { trigger: true, reason: `price moved $${t.priceMoveTrigger}+ from last rescore` }
    }
    if (this.lastRescore == null ||
        Date.now() - this.lastRescore >= t.timeBasedInterval) {
      return { trigger: true, reason: 'time-based 15-min interval' }
    }
    return { trigger: false }
  }

  _incrementBudget(calls) {
    this._checkDailyReset()
    this.callsToday += calls
    const { workingBudget, amberAlert, pauseAt } = this.config.budget
    if (this.callsToday >= pauseAt) {
      console.warn(`[DataProvider] Budget exhausted (${this.callsToday}/${pauseAt}) — pausing`)
      this.pause()
    } else if (this.callsToday >= Math.floor(workingBudget * amberAlert)) {
      console.warn(`[DataProvider] Budget amber: ${this.callsToday}/${workingBudget}`)
    }
  }

  async _poll() {
    if (this.paused) return
    try {
      const price = await this.getCurrentPrice()
      this.lastPrice = price
      this.lastPriceCheck = new Date().toISOString()
      this.priceCallbacks.forEach(cb => cb(price))

      for (const level of this.levels) {
        if (Math.abs(price - level.price) <= this.config.triggers.levelCrossThreshold) {
          this.levelCrossCallbacks.forEach(cb => cb({ price, level }))
        }
      }

      const { trigger, reason } = this._shouldRescore(price)
      if (trigger) {
        console.log(`[DataProvider] Rescore triggered: ${reason}`)
        this.lastRescoreReason = reason
        this.rescoreCallbacks.forEach(cb => cb({ price, reason }))
        this.lastRescore = Date.now()
        this.lastRescorePrice = price
      }
    } catch (err) {
      console.warn('[DataProvider] Poll error:', err.message)
    } finally {
      if (!this.paused) {
        const interval = this._getInterval(this.lastPrice || 0)
        this.pollingTimer = setTimeout(() => this._poll(), interval)
      }
    }
  }

  onPriceUpdate(cb)  { this.priceCallbacks.push(cb) }
  onLevelCross(cb)   { this.levelCrossCallbacks.push(cb) }
  onRescore(cb)      { this.rescoreCallbacks.push(cb) }

  setLevels(levels)  { this.levels = levels }

  start() {
    console.log('[DataProvider] REST polling started')
    this.paused = false
    this._poll()
  }

  pause() {
    this.paused = true
    clearTimeout(this.pollingTimer)
    this.pollingTimer = null
    console.log('[DataProvider] Polling paused')
  }

  resume() {
    console.log('[DataProvider] Polling resumed')
    this.paused = false
    this._poll()
  }

  getStatus() {
    return {
      mode: 'REST',
      callsToday: this.callsToday,
      workingBudget: this.config.budget.workingBudget,
      reserve: this.config.budget.reserve,
      lastPrice: this.lastPrice,
      lastPriceCheck: this.lastPriceCheck,
      lastRescore: this.lastRescore ? new Date(this.lastRescore).toISOString() : null,
      lastRescoreReason: this.lastRescoreReason,
      currentInterval: this._getInterval(this.lastPrice || 0),
      levelsLoaded: this.levels.length,
      pollingActive: !this.paused && !!this.pollingTimer,
      isMarketHours: this._isMarketHours(),
      overnightMode: !this._isMarketHours(),
    }
  }
}
