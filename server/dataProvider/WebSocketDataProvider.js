import DataProvider from './DataProvider.js'

export default class WebSocketDataProvider extends DataProvider {
  constructor(apiKey, baseUrl, config) {
    super()
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.config = config
    this.mode = 'WebSocket'
    this.connected = false
    this.lastPrice = null
    this.priceCallbacks = []
    this.levelCrossCallbacks = []
    this.rescoreCallbacks = []
    this.disconnectCallbacks = []
    this.reconnectCallbacks = []
  }

  async getCurrentPrice() {
    return this.lastPrice || null
  }

  onPriceUpdate(cb)    { this.priceCallbacks.push(cb) }
  onLevelCross(cb)     { this.levelCrossCallbacks.push(cb) }
  onRescore(cb)        { this.rescoreCallbacks.push(cb) }
  onDisconnect(cb)     { this.disconnectCallbacks.push(cb) }
  onReconnect(cb)      { this.reconnectCallbacks.push(cb) }

  setLevels() { /* no-op — WebSocket streams updates */ }

  start() {
    console.log('[DataProvider] WebSocket stub — not connected')
    console.log('[DataProvider] Upgrade UW subscription to activate')
  }

  pause()  { /* no-op */ }
  resume() { /* no-op */ }

  getStatus() {
    return {
      mode: 'WebSocket',
      connected: false,
      note: 'Stub — activate when UW WebSocket subscription purchased',
    }
  }
}
