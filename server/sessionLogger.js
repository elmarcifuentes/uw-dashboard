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

  // Fix 1: read price + classification for change detection
  getLevelOutcomeDetail: db.prepare(
    'SELECT id, price, classification FROM level_outcomes WHERE session_date = ? AND level_id = ?'
  ),
  insertLevelOutcome: db.prepare(`
    INSERT INTO level_outcomes
      (session_date, level_id, price, classification, confidence, score,
       dark_pool, etf_direction, flow_matches, full_stack, conflict,
       boundary, continuation, passive_target, price_at_classification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  // Full update when price or classification changes
  updateLevelOutcomeFull: db.prepare(`
    UPDATE level_outcomes SET
      price                = ?,
      classification       = ?,
      confidence           = ?,
      score                = ?,
      dark_pool            = ?,
      etf_direction        = ?,
      full_stack           = ?,
      conflict             = ?,
      boundary             = ?,
      continuation         = ?,
      price_at_classification = ?,
      price_30min_later    = NULL,
      price_move           = NULL,
      outcome              = NULL,
      outcome_auto         = 1,
      updated_at           = datetime('now')
    WHERE session_date = ? AND level_id = ?
  `),
  // Light update — same price/classification, just refresh dp/score
  updateLevelOutcomeLight: db.prepare(`
    UPDATE level_outcomes SET
      dark_pool      = ?,
      score          = ?,
      confidence     = ?,
      etf_direction  = ?,
      updated_at     = datetime('now')
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
  // Fix 3: mark S1/S2 reached during cascade
  cascadeReachS1: db.prepare(
    'UPDATE cascade_events SET reached_s1 = 1 WHERE session_date = ? AND resolved_at IS NULL'
  ),
  cascadeReachS2: db.prepare(
    'UPDATE cascade_events SET reached_s2 = 1 WHERE session_date = ? AND resolved_at IS NULL'
  ),

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
    this.activeDate               = null
    this.classificationTimestamps = new Map()
    this.cascadeOpenTime          = null
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

    // Fix 1: Level outcomes — smart upsert with change detection
    for (const level of result.levels || []) {
      const existing = stmts.getLevelOutcomeDetail.get(date, level.id)
      const key = `${date}-${level.id}`

      if (!existing) {
        stmts.insertLevelOutcome.run(
          date, level.id, level.price, level.classification,
          level.confidence, level.score, level.dark_pool,
          level.etf_direction, level.flow_matches ?? 0,
          level.full_stack ? 1 : 0, level.conflict ? 1 : 0,
          level.boundary ? 1 : 0, level.continuation ?? null,
          level.passive_target ? 1 : 0, price
        )
        this.classificationTimestamps.set(key, {
          timestamp: new Date(timestamp), price, level,
        })
      } else {
        const priceChanged = Math.abs((existing.price ?? 0) - level.price) > 0.50
        const classChanged = existing.classification !== level.classification

        if (priceChanged || classChanged) {
          // New level set or classification flip — reset outcome measurement
          stmts.updateLevelOutcomeFull.run(
            level.price, level.classification, level.confidence,
            level.score, level.dark_pool, level.etf_direction,
            level.full_stack ? 1 : 0, level.conflict ? 1 : 0,
            level.boundary ? 1 : 0, level.continuation ?? null,
            price, date, level.id
          )
          this.classificationTimestamps.set(key, {
            timestamp: new Date(timestamp), price, level,
          })
          console.log(`[logger] Level updated: ${level.id} price=${level.price} class=${level.classification}`)
        } else {
          // Same level — just refresh dp/score
          stmts.updateLevelOutcomeLight.run(
            level.dark_pool, level.score, level.confidence, level.etf_direction,
            date, level.id
          )
        }
      }
    }

    // S1/S2 reach flags — run FIRST, independently, on most recent cascade event
    // Uses id-based update so it fires even after cascade resolves or server restart
    if (result.levels && price != null) {
      const recentCascade = db.prepare(`
        SELECT id FROM cascade_events
        WHERE session_date = ?
        ORDER BY fired_at DESC LIMIT 1
      `).get(date)
      if (recentCascade) {
        const s1Level = result.levels.find(l => l.id === 'S1')
        const s2Level = result.levels.find(l => l.id === 'S2')
        if (s1Level && price <= s1Level.price) {
          db.prepare('UPDATE cascade_events SET reached_s1 = 1 WHERE id = ?').run(recentCascade.id)
        }
        if (s2Level && price <= s2Level.price) {
          db.prepare('UPDATE cascade_events SET reached_s2 = 1 WHERE id = ?').run(recentCascade.id)
        }
      }
    }

    // Cascade open / close with DB-recovery
    if (result.cascade?.active) {
      this._openCascade(date, price, timestamp, result.cascade)
    } else {
      const openCascade = db.prepare(
        'SELECT id FROM cascade_events WHERE session_date = ? AND resolved_at IS NULL'
      ).get(date)
      if (openCascade) {
        db.prepare(`
          UPDATE cascade_events SET resolved_at = ?, price_at_resolve = ?
          WHERE session_date = ? AND resolved_at IS NULL
        `).run(timestamp, price, date)
        this.cascadeOpenTime = null
        console.log(`[logger] Cascade resolved (DB recovery) at $${price}`)
      } else if (this.cascadeOpenTime) {
        this._closeCascade(date, price, timestamp)
      }
    }

    // Fix 2: Persist magnet streak from SQLite history
    const streak = this._getMagnetStreak()
    stmts.setMagnet.run(streak, date)
  }

  logPrice(price, timestamp) {
    this._checkOutcomes(price, new Date(timestamp))
  }

  _checkOutcomes(currentPrice, now) {
    for (const [key, data] of this.classificationTimestamps.entries()) {
      const elapsed = (now - data.timestamp) / 60000
      if (elapsed < 30) continue

      const cl = data.level.classification

      // Skip no_edge entirely — only track classified levels
      if (!cl || cl === 'no_edge' || cl === 'continuation') {
        this.classificationTimestamps.delete(key)
        continue
      }

      const priceMove = currentPrice - data.price
      let outcome = 'noise'
      if (cl === 'buy_support') {
        if (priceMove >= 0.50)  outcome = 'correct'
        if (priceMove <= -0.50) outcome = 'incorrect'
      } else if (cl === 'sell_resistance') {
        if (priceMove <= -0.50) outcome = 'correct'
        if (priceMove >= 0.50)  outcome = 'incorrect'
      }

      const [date, levelId] = key.split(/-(.+)/)
      db.prepare(`
        UPDATE level_outcomes SET
          price_30min_later = ?,
          price_move        = ?,
          outcome           = ?,
          outcome_auto      = 1,
          updated_at        = datetime('now')
        WHERE session_date = ? AND level_id = ?
          AND outcome IS NULL
          AND classification NOT IN ('no_edge', 'continuation')
      `).run(currentPrice, priceMove, outcome, date, levelId)

      if (outcome !== 'noise') {
        console.log(`[logger] Outcome: ${levelId} ${cl} → ${outcome} ($${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(2)})`)
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

  // Fix 1: compute streak from events table (survives mid-session level changes)
  _getMagnetStreak() {
    try {
      const sessionFirstEvents = db.prepare(`
        SELECT session_date, MIN(time) as first_time
        FROM events
        WHERE event_type = 'rescore'
        GROUP BY session_date
        ORDER BY session_date DESC
        LIMIT 30
      `).all()

      let streak = 0
      for (const session of sessionFirstEvents) {
        const event = db.prepare(
          'SELECT data_json FROM events WHERE session_date = ? AND time = ?'
        ).get(session.session_date, session.first_time)

        if (!event?.data_json) break
        try {
          const data = JSON.parse(event.data_json)
          const hasResistanceMagnet = (data.levels || []).some(l =>
            ['R1', 'R2'].includes(l.id) &&
            l.classification === 'buy_support' &&
            l.conflict === true
          )
          if (hasResistanceMagnet) streak++
          else break
        } catch { break }
      }
      return streak
    } catch { return 0 }
  }

  getSessionStory(date) {
    const session = stmts.getStorySession.get(date)
    if (!session) return null

    const events        = stmts.getStoryEvents.all(date)
    const levelOutcomes = stmts.getStoryLevels.all(date)
    const cascadeEvents = stmts.getStoryCascade.all(date)

    // Fix 4: enrich cascade events
    const enrichedCascade = cascadeEvents.map(e => {
      const drawdown = (e.price_at_fire != null && e.price_at_resolve != null)
        ? +(e.price_at_fire - e.price_at_resolve).toFixed(2)
        : null
      let conditionsParsed = null
      try { conditionsParsed = JSON.parse(e.conditions_met) } catch {}
      return { ...e, drawdown, conditions_parsed: conditionsParsed }
    })

    const classified  = levelOutcomes.filter(l => l.classification !== 'no_edge' && l.outcome != null)
    const correct     = classified.filter(l => l.outcome === 'correct').length
    const incorrect   = classified.filter(l => l.outcome === 'incorrect').length
    const noise       = classified.filter(l => l.outcome === 'noise').length
    const highConf    = levelOutcomes.filter(l => l.confidence === 'high' && l.outcome != null)
    const highCorrect = highConf.filter(l => l.outcome === 'correct').length

    // Fix 4: session_notes summary
    const maxDrawdown = enrichedCascade
      .map(e => e.drawdown)
      .filter(d => d != null && d > 0)
      .sort((a, b) => b - a)[0] ?? null

    const expansionGexFired = levelOutcomes.some(l => {
      try {
        const lastEvent = events.filter(e => e.data_json).pop()
        if (!lastEvent) return false
        const data = JSON.parse(lastEvent.data_json)
        const lvl = data.levels?.find(x => x.id === l.level_id)
        return (lvl?.net_gex ?? 0) < 0
      } catch { return false }
    })

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
        level:                   l.level_id,
        price:                   l.price,
        classification:          l.classification,
        confidence:              l.confidence,
        score:                   l.score,
        dark_pool:               l.dark_pool,
        full_stack:              !!l.full_stack,
        continuation:            l.continuation,
        price_at_classification: l.price_at_classification,
        price_30min_later:       l.price_30min_later,
        price_move:              l.price_move,
        outcome:                 l.outcome,
        outcome_auto:            !!l.outcome_auto,
        notes:                   l.notes,
      })),
      cascade_events: enrichedCascade,
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
      session_notes: {
        cascade_count:         enrichedCascade.length,
        cascade_max_drawdown:  maxDrawdown,
        expansion_gex_fired:   expansionGexFired,
      },
    }
  }

  getAllSessions() {
    return stmts.getAllSessions.all()
  }
}

export const logger = new SessionLogger()
