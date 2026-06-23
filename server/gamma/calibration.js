// server/gamma/calibration.js
//
// Gamma reaction calibration store. Logs every shown prediction + its resolved outcome so the
// displayed percentages earn authority from reality (Outcome Logging principle). Additive: a new
// SQLite table, no scoring touched. Aggregates → /status.gammaCalibration (Brier + reliability bins,
// per-regime so it doubles as regime validation), and the per-dominant resolved counts that drive the
// "provisional / est." marker until a bucket reaches MIN_CALIBRATION_SAMPLES.

import { OUTCOMES, MIN_CALIBRATION_SAMPLES, resolveReaction } from './levelReaction.js'

const REAL = new Set(OUTCOMES)   // resolvable outcomes (excludes NOT_TESTED / NO_DATA)

export function initCalibrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gamma_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER, level_id TEXT, level_price REAL, spot REAL, regime TEXT,
      dominant TEXT, conf_bucket TEXT, dist TEXT, inputs TEXT,
      resolved INTEGER DEFAULT 0, outcome TEXT, resolved_ts INTEGER
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gp_unresolved ON gamma_predictions (resolved, ts)`)
}

export function logPrediction(db, p) {
  return db.prepare(`
    INSERT INTO gamma_predictions (ts, level_id, level_price, spot, regime, dominant, conf_bucket, dist, inputs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.ts, p.level_id, p.level_price, p.spot, p.regime, p.dominant, p.conf_bucket,
         JSON.stringify(p.dist), JSON.stringify(p.inputs || {})).lastInsertRowid
}

// Resolve every unresolved prediction older than the window. getSamples(t0ms, t1ms) → [{ts, price}].
export function resolvePending(db, nowMs, getSamples, res, onResolved) {
  const cutoff = nowMs - res.WINDOW_MIN * 60 * 1000
  const pend = db.prepare(`SELECT * FROM gamma_predictions WHERE resolved = 0 AND ts <= ?`).all(cutoff)
  const upd = db.prepare(`UPDATE gamma_predictions SET resolved = 1, outcome = ?, resolved_ts = ? WHERE id = ?`)
  let n = 0
  for (const p of pend) {
    const samples = getSamples(p.ts, p.ts + res.WINDOW_MIN * 60 * 1000)
    const outcome = resolveReaction({ levelPrice: p.level_price, spot0: p.spot, samples }, res)
    upd.run(outcome, nowMs, p.id)
    n++
    onResolved?.(p, outcome)
  }
  return n
}

const BINS = [[40, 50], [50, 60], [60, 70], [70, 80], [80, 101]]

// Build the calibration summary + per-dominant resolved counts (the provisional gate reads these).
export function aggregateCalibration(db, minSamples = MIN_CALIBRATION_SAMPLES) {
  const rows = db.prepare(`SELECT dominant, dist, outcome, regime FROM gamma_predictions WHERE resolved = 1`).all()
  const real = rows.filter(r => REAL.has(r.outcome))

  const blankDom = () => Object.fromEntries(OUTCOMES.map(o => [o, { predicted: 0, hits: 0 }]))
  const byDominant = blankDom()
  const byRegime = { expansion: blankDom(), pinning: blankDom() }
  const reliability = BINS.map(([lo, hi]) => ({ bin: `${lo}-${hi === 101 ? 100 : hi}`, n: 0, hits: 0 }))
  let brierSum = 0

  for (const r of real) {
    let dist; try { dist = JSON.parse(r.dist) } catch { continue }
    const hit = r.outcome === r.dominant
    byDominant[r.dominant].predicted++
    if (hit) byDominant[r.dominant].hits++
    const reg = byRegime[r.regime]
    if (reg) { reg[r.dominant].predicted++; if (hit) reg[r.dominant].hits++ }
    // Brier across the full distribution
    brierSum += OUTCOMES.reduce((a, k) => a + Math.pow((dist[k] || 0) / 100 - (k === r.outcome ? 1 : 0), 2), 0)
    // reliability by the dominant's predicted probability
    const p = dist[r.dominant] || 0
    const b = reliability.find(x => { const [lo, hi] = x.bin.split('-').map(Number); return p >= lo && p < (hi === 100 ? 101 : hi) })
    if (b) { b.n++; if (hit) b.hits++ }
  }

  const withAcc = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) =>
    [k, { ...v, accuracy: v.predicted ? Math.round((v.hits / v.predicted) * 100) : null }]))

  // provisional gate: a dominant bucket is "calibrated" once it has ≥ minSamples resolved+tested rows.
  const provisional = Object.fromEntries(OUTCOMES.map(o => [o, byDominant[o].predicted < minSamples]))

  return {
    totalResolved: rows.length,
    totalTested: real.length,
    notTested: rows.filter(r => r.outcome === 'NOT_TESTED').length,
    noData: rows.filter(r => r.outcome === 'NO_DATA').length,
    brier: real.length ? Math.round((brierSum / real.length) * 1000) / 1000 : null,
    byDominant: withAcc(byDominant),
    byRegime: { expansion: withAcc(byRegime.expansion), pinning: withAcc(byRegime.pinning) },
    reliability: reliability.map(b => ({ ...b, hitRate: b.n ? Math.round((b.hits / b.n) * 100) : null })),
    minSamples,
    provisional,   // { OUTCOME: true|false } — true = not yet enough samples → show "est."
  }
}
