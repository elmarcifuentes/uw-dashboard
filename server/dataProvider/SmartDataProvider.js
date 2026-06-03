import RestDataProvider from './RestDataProvider.js'
import WebSocketDataProvider from './WebSocketDataProvider.js'

export default class SmartDataProvider {
  constructor(apiKey, baseUrl, config) {
    this.rest = new RestDataProvider(apiKey, baseUrl, config)
    this.ws   = new WebSocketDataProvider(apiKey, baseUrl, config)
    this.useWebSocket = process.env.USE_WEBSOCKET === 'true'
    this.active = this.useWebSocket ? this.ws : this.rest
  }

  async getCurrentPrice()    { return this.active.getCurrentPrice() }
  onPriceUpdate(cb)          { this.active.onPriceUpdate(cb) }
  onLevelCross(cb)           { this.active.onLevelCross(cb) }
  onRescore(cb)              { this.active.onRescore(cb) }
  setLevels(levels)          { this.rest.setLevels(levels); this.ws.setLevels(levels) }

  start() {
    console.log(`[SmartDataProvider] Starting in ${this.useWebSocket ? 'WebSocket' : 'REST'} mode`)
    this.active.start()

    if (this.useWebSocket) {
      this.ws.onDisconnect?.(() => {
        console.warn('[SmartDataProvider] WebSocket dropped — switching to REST polling')
        this.ws.pause()
        this.active = this.rest
        this.rest.start()
      })
      this.ws.onReconnect?.(() => {
        console.log('[SmartDataProvider] WebSocket restored — switching back')
        this.rest.pause()
        this.active = this.ws
      })
    }
  }

  pause()  { this.active.pause() }
  resume() { this.active.resume() }

  getStatus() {
    return {
      ...this.active.getStatus(),
      smartProvider: true,
      configuredMode: this.useWebSocket ? 'WebSocket' : 'REST',
      activeMode: this.active.mode,
    }
  }

  switchMode(useWebSocket) {
    this.active.pause()
    this.useWebSocket = useWebSocket
    this.active = useWebSocket ? this.ws : this.rest
    this.active.start()
    console.log(`[SmartDataProvider] Switched to ${useWebSocket ? 'WebSocket' : 'REST'} mode`)
  }
}
