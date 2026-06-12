export default class DataProvider {
  async getCurrentPrice()     { throw new Error('not implemented') }
  onPriceUpdate(callback)     { throw new Error('not implemented') }
  onLevelCross(callback)      { throw new Error('not implemented') }
  pause()                     { throw new Error('not implemented') }
  resume()                    { throw new Error('not implemented') }
  getStatus()                 { throw new Error('not implemented') }
}
