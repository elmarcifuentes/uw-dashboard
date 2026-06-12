import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = process.env.DB_PATH || path.join(__dirname, 'data/sessions.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    date                  TEXT NOT NULL UNIQUE,
    run_type              TEXT,
    open_price            REAL,
    close_price           REAL,
    session_high          REAL,
    session_low           REAL,
    cascade_fired         INTEGER DEFAULT 0,
    structure_break_fired INTEGER DEFAULT 0,
    magnet_streak         INTEGER DEFAULT 0,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date            TEXT NOT NULL,
    time                    TEXT NOT NULL,
    event_type              TEXT NOT NULL,
    trigger                 TEXT,
    price                   REAL,
    interval_ms             INTEGER,
    cascade_active          INTEGER DEFAULT 0,
    structure_break_active  INTEGER DEFAULT 0,
    data_json               TEXT,
    created_at              TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS level_outcomes (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date             TEXT NOT NULL,
    level_id                 TEXT NOT NULL,
    price                    REAL,
    classification           TEXT,
    confidence               TEXT,
    score                    INTEGER,
    dark_pool                REAL,
    etf_direction            TEXT,
    flow_matches             INTEGER,
    full_stack               INTEGER DEFAULT 0,
    conflict                 INTEGER DEFAULT 0,
    boundary                 INTEGER DEFAULT 0,
    continuation             TEXT,
    passive_target           INTEGER DEFAULT 0,
    price_at_classification  REAL,
    price_30min_later        REAL,
    price_move               REAL,
    outcome                  TEXT,
    outcome_auto             INTEGER DEFAULT 1,
    notes                    TEXT,
    created_at               TEXT DEFAULT (datetime('now')),
    updated_at               TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cascade_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date     TEXT NOT NULL,
    fired_at         TEXT NOT NULL,
    resolved_at      TEXT,
    conditions_met   TEXT,
    price_at_fire    REAL,
    price_at_resolve REAL,
    max_drawdown     REAL,
    reached_s1       INTEGER DEFAULT 0,
    reached_s2       INTEGER DEFAULT 0,
    validated        INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_levels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    r2_nq REAL, r2_qqq REAL,
    r1_nq REAL, r1_qqq REAL,
    mid_nq REAL, mid_qqq REAL,
    s1_nq REAL, s1_qqq REAL,
    s2_nq REAL, s2_qqq REAL,
    nq_ratio   REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date)
  );

  CREATE TABLE IF NOT EXISTS level_touches (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date   TEXT NOT NULL,
    level_id       TEXT NOT NULL,
    touch_type     TEXT NOT NULL,
    price          REAL,
    dp             REAL,
    classification TEXT,
    touched_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`)
// pending_levels table removed with the TradingView webhook feature (levels are native now).

export default db
