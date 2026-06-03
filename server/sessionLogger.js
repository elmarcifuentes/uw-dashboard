import db from './db.js'

const stmts = {
  getSession:    db.prepare('SELECT * FROM sessions WHERE date = ?'),
  insertSession: db.prepare(`
    INSERT INTO sessions (date, run_type, open_price, session_high, session_low)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateSession: db.prepare(`
    UPDATE sessions SET
      session_high          = MAX(session_high, ?),
      session_low           = MIN(session_low, ?),
      close_price           = ?,
      cascade_fired         = MAX(cascade_fired, ?),
      structure_break_fired = MAX(structure_break_fired, ?),
      updated_at            = datetime('now')
    WHERE date = ?
  `),
  setMagnet: db.prepare('UPDATE sessions SET magnet_streak = ? WHERE date = ?'),

  insertEvent: db.prepare(`
    INSERT INTO events
      (session_date, time, event_type, trigger, price, cascade_active, structure_break_active, data_json)
    VALUES (?, ?, 'rescore', ?, ?, ?, ?, ?)
  `),

  getLevelOutcome: db.prepare(
    'SELECT id FROM level_outcomes WHERE session_date = ? AND level_id = ?'
  ),
  insertLevelOutcome: db.prepare(`
    INSERT INTO level_outcomes
      (session_date, level_id, price, classification, confidence, score,
       dark_pool, etf_direction, flow_matches, full_stack, conflict,
       boundary, continuation, passive_target, price_at_classification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateLevelOutcome: db.prepare(`
    UPDATE level_outcomes SET
      classification = ?, confidence = ?, score = ?,
      dark_pool = ?, etf_direction = ?, full_stack = ?,
      conflict = ?, boundary = ?, continuation = ?,
      updated_at = datetime('now')
    WHERE session_date = ? AND level_id = ?
  `),
  setOutcome: db.prepare(`
    UPDATE level_outcomes SET
      price_30min_later = ?,
      price_move        = ?,
      outcome           = ?,
      outcome_auto      = 1,
      updated_at        = datetime('now')
    WHERE session_date = ? AND level_id = ? AND outcome IS NULL
  `),
  overrideOutcome: db.prepare(`
    UPDATE level_outcomes SET
      outcome      = ?,
      outcome_auto = 0,
      notes        = ?,
      updated_at   = datetime('now')
    WHERE session_date = ? AND level_id = ?
  `),

  insertCascade: db.prepare(`
    INSERT INTO cascade_events (session_date, fired_at, price_at_fire, conditions_met)
    VALUES (?, ?, ?, ?)
  `),
  closeCascade: db.prepare(`
    UPDATE cascade_events SET resolved_at = ?, price_at_resolve = ?
    WHERE session_date = ? AND resolved_at IS NULL
  `),

  getStorySession: db.prepare('SELECT * FROM sessions WHERE date = ?'),
  getStoryEvents:  db.prepare('SELECT * FROM events WHERE session_date = ? ORDER BY time ASC'),
  getStoryLevels:  db.prepare('SELECT * FROM level_outcomes WHERE session_date = ? ORDER BY id ASC'),
  getStoryCascade: db.prepare('SELECT * FROM cascade_events WHERE session_date = ? ORDER BY fired_at ASC'),

  getAllSessions: db.prepare(
    'SELECT date, run_type, open_price, close_price, cascade_fired, magnet_streak FROM sessions ORDER BY date DESC'
  ),
}

export class SessionLogger {
  constructor() {
    this.activeDate            = null
    this.classificationTimestamps = new Map()  // key: "date-levelId" → {timestamp, price, level}
    this.cascadeOpenTime       = null
  }

  startSession(date, openPrice, runType) {
    this.activeDate = date
    const existing = stmts.getSession.get(date)
    if (!existing) {
      stmts.insertSession.run(date, runType, openPrice, openPrice, openPrice)
      console.log(`[logger] Session started: ${date}`)
    }
  }

  logRescore(event) {
    const { result, trigger, price, timestamp } = event
    if (!result?.session) return

    const date = result.session
    this.activeDate = date
    this.startSession(date, price, result.run_type)

    // Event log
    stmts.insertEvent.run(
      date, timestamp, trigger, price,
      result.cascade?.active ? 1 : 0,
      result.structure_break?.active ? 1 : 0,
      JSON.stringify(result)
    )

    // Session stats
    if (price != null) {
      stmts.updateSession.run(
        price, price, price,
        result.cascade?.active ? 1 : 0,
        result.structure_break?.active ? 1 : 0,
        date
      )
    }

    // Level outcomes — upsert
    for (const level of result.levels || []) {
      const existing = stmts.getLevelOutcome.get(date, level.id)
      if (!existing) {
        stmts.insertLevelOutcome.run(
          date, level.id, level.price, level.classification,
          level.confidence, level.score, level.dark_pool,
          level.etf_direction, level.flow_matches ?? 0,
          level.full_stack ? 1 : 0, level.conflict ? 1 : 0,
          level.boundary ? 1 : 0, level.continuation ?? null,
          level.passive_target ? 1 : 0, price
        )
        this.classificationTimestamps.set(`${date}-${level.id}`, {
          timestamp: new Date(timestamp), price, level,
        })
      } else {
        stmts.updateLevelOutcome.run(
          level.classification, level.confidence, level.score,
          level.dark_pool, level.etf_direction,
          level.full_stack ? 1 : 0, level.conflict ? 1 : 0,
          level.boundary ? 1 : 0, level.continuation ?? null,
          date, level.id
        )
      }
    }

    // Cascade tracking
    if (result.cascade?.active) {
      this._openCascade(date, price, timestamp, result.cascade)
    } else if (this.cascadeOpenTime) {
      this._closeCascade(date, price, timestamp)
    }

    if (result.magnet_streak != null) {
      stmts.setMagnet.run(result.magnet_streak, date)
    }
  }

  logPrice(price, timestamp) {
    this._checkOutcomes(price, new Date(timestamp))
  }

  _checkOutcomes(currentPrice, now) {
    for (const [key, data] of this.classificationTimestamps.entries()) {
      const elapsed = (now - data.timestamp) / 60000  // minutes
      if (elapsed < 30) continue

      const priceMove = currentPrice - data.price
      const cl = data.level.classification
      let outcome = 'noise'
      if (cl === 'buy_support') {
        if (priceMove >= 0.50)  outcome = 'correct'
        if (priceMove <= -0.50) outcome = 'incorrect'
      } else if (cl === 'sell_resistance') {
        if (priceMove <= -0.50) outcome = 'correct'
        if (priceMove >= 0.50)  outcome = 'incorrect'
      }

      const [date, levelId] = key.split(/-(.+)/)   // split on first hyphen only
      stmts.setOutcome.run(currentPrice, priceMove, outcome, date, levelId)

      if (outcome !== 'noise') {
        console.log(`[logger] Outcome: ${levelId} ${cl} → ${outcome} (Δ${priceMove.toFixed(2)})`)
      }
      this.classificationTimestamps.delete(key)
    }
  }

  _openCascade(date, price, timestamp, cascade) {
    if (this.cascadeOpenTime) return
    this.cascadeOpenTime = timestamp
    stmts.insertCascade.run(date, timestamp, price, JSON.stringify(cascade))
    console.log(`[logger] Cascade opened at $${price}`)
  }

  _closeCascade(date, price, timestamp) {
    stmts.closeCascade.run(timestamp, price, date)
    this.cascadeOpenTime = null
    console.log(`[logger] Cascade resolved at $${price}`)
  }

  getSessionStory(date) {
    const session = stmts.getStorySession.get(date)
    if (!session) return null

    const events        = stmts.getStoryEvents.all(date)
    const levelOutcomes = stmts.getStoryLevels.all(date)
    const cascadeEvents = stmts.getStoryCascade.all(date)

    const classified    = levelOutcomes.filter(l => l.classification !== 'no_edge' && l.outcome != null)
    const correct       = classified.filter(l => l.outcome === 'correct').length
    const incorrect     = classified.filter(l => l.outcome === 'incorrect').length
    const noise         = classified.filter(l => l.outcome === 'noise').length
    const highConf      = levelOutcomes.filter(l => l.confidence === 'high' && l.outcome != null)
    const highCorrect   = highConf.filter(l => l.outcome === 'correct').length

    return {
      session: {
        date:                  session.date,
        run_type:              session.run_type,
        open_price:            session.open_price,
        close_price:           session.close_price,
        session_high:          session.session_high,
        session_low:           session.session_low,
        cascade_fired:         !!session.cascade_fired,
        structure_break_fired: !!session.structure_break_fired,
        magnet_streak:         session.magnet_streak,
      },
      timeline: events.map(e => ({
        time:                  e.time,
        type:                  e.event_type,
        trigger:               e.trigger,
        price:                 e.price,
        cascade_active:        !!e.cascade_active,
        structure_break_active: !!e.structure_break_active,
      })),
      level_outcomes: levelOutcomes.map(l => ({
        level:                  l.level_id,
        price:                  l.price,
        classification:         l.classification,
        confidence:             l.confidence,
        score:                  l.score,
        dark_pool:              l.dark_pool,
        full_stack:             !!l.full_stack,
        continuation:           l.continuation,
        price_at_classification: l.price_at_classification,
        price_30min_later:      l.price_30min_later,
        price_move:             l.price_move,
        outcome:                l.outcome,
        outcome_auto:           !!l.outcome_auto,
        notes:                  l.notes,
      })),
      cascade_events: cascadeEvents,
      accuracy: {
        total_classified:             classified.length,
        correct,
        incorrect,
        noise,
        accuracy_pct:                 classified.length > 0 ? ((correct / classified.length) * 100).toFixed(1) : null,
        high_confidence_calls:        highConf.length,
        high_confidence_correct:      highCorrect,
        high_confidence_accuracy_pct: highConf.length > 0 ? ((highCorrect / highConf.length) * 100).toFixed(1) : null,
      },
    }
  }

  getAllSessions() {
    return stmts.getAllSessions.all()
  }
}

export const logger = new SessionLogger()
