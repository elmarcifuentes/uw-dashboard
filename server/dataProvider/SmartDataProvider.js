import RestDataProvider from './RestDataProvider.js'

// WebSocket support was removed (the WS provider was a no-op stub; REST polling is the only
// live path). This wrapper now just delegates to RestDataProvider, preserving the public
// interface the server relies on (getCurrentPrice / onRescore / setLevels / start / pause /
// resume / getStatus).
export default class SmartDataProvider {
  constructor(apiKey, baseUrl, config) {
    this.rest   = new RestDataProvider(apiKey, baseUrl, config)
    this.active = this.rest
  }

  async getCurrentPrice()    { return this.active.getCurrentPrice() }
  onPriceUpdate(cb)          { this.active.onPriceUpdate(cb) }
  onLevelCross(cb)           { this.active.onLevelCross(cb) }
  onRescore(cb)              { this.active.onRescore(cb) }
  setLevels(levels)          { this.rest.setLevels(levels) }

  start() {
    console.log('[SmartDataProvider] Starting in REST mode')
    this.active.start()
  }

  pause()  { this.active.pause() }
  resume() { this.active.resume() }

  getStatus() {
    return {
      ...this.active.getStatus(),
      smartProvider: true,
      activeMode: this.active.mode,
    }
  }
}
