// UW API calls — mirrors uw-level-filter/src/fetchData.js
// Uses global fetch (Node 25+). No node-fetch dependency required.

const BASE_URL = process.env.UW_API_BASE || 'https://api.unusualwhales.com'

function headers() {
  return {
    Authorization: `Bearer ${process.env.UW_API_KEY}`,
    'UW-CLIENT-API-ID': '100001',
  }
}

async function uwGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: headers() })
  if (!res.ok) throw new Error(`UW API ${path} → ${res.status} ${res.statusText}`)
  return res.json()
}

export async function getDarkPool(symbol) {
  return uwGet(`/api/darkpool/${symbol}`)
}

export async function getOptionsFlow(symbol) {
  return uwGet('/api/option-trades/flow-alerts', { ticker_symbol: symbol })
}

export async function getOptionsVolume(symbol) {
  return uwGet(`/api/stock/${symbol}/options-volume`)
}

export async function getGEXStrikes(symbol) {
  return uwGet(`/api/stock/${symbol}/greek-exposure/strike`)
}

export async function getEtfTide(symbol) {
  return uwGet(`/api/market/${symbol}/etf-tide`)
}
