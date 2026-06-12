# CLAUDE.md — Frozen Constraints

Load every session. Rules, not explanations. If a task conflicts with these, stop and ask.

Deep references: [docs/PREDICTIVE_RANGES.md](docs/PREDICTIVE_RANGES.md) (level engine) ·
[docs/SCORING.md](docs/SCORING.md) (UW scoring).

---

## Protected systems — never modify unless the task explicitly targets them

- `server/scorer/scoreLevel.js` — level scoring math. **Frozen.**
- `server/scorer/fetchData.js` — UW data fetching. **Frozen.**
- `server/scorer/index.js` — score orchestration/classification. Treat as frozen.
- Recurrence math (`initRecurrence`/`advanceRecurrence`/`levelsFromState`).
- Guard thresholds (>20pt / >$0.50 change guard; 30-min freshness; classification cutoffs).
- Ratio system (`getActiveRatio` chain, lock flow).

Anything touching **level calculation** requires a **diagnose-and-report phase before changes** —
present findings, get confirmation, then edit. Never edit-first on the engine.

## Level-engine invariants (see docs/PREDICTIVE_RANGES.md)

- Never round the persisted recurrence state (`{avg, halfWidth, atrState}`) — full precision always.
- Never recompute the recurrence from a sliding window — it is path-dependent; advance the persisted
  state one **closed** bar at a time. Cold-start only from the fixed per-(contract,tf) anchor.
- Closed bars only (drop the forming bar). Never consume stale bars (`barsAreFresh` aborts >30 min).
- Rounding happens at **apply time only**, via `roundLevel()` / `LEVEL_ROUNDING` (one change point).
- Canonical **rounded NQ in `daily_levels` is the source of truth**; QQQ = rounded NQ ÷ active ratio.
- Displays read stored values via `levelNq()` — never reconstruct NQ from QQQ × ratio.
- 1m and 5m are independent indicators (different ATR bases); differing levels is correct.

## Ratio invariants (see docs/SCORING.md §ratio, docs/PREDICTIVE_RANGES.md §7)

- All lock paths (scheduled / catch-up / manual) go through `onRatioLocked()`. Do not fork them.
- Date comparisons in **ET** (`getETNow` / `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`).
  Never use server-local/UTC dates for the daily lock.
- Never lock stale prices — `getFreshLiveRatio()` requires `latest._received_at` ≤ 30 min; otherwise **defer**.

## Scoring invariants (see docs/SCORING.md)

- Do not change weights, thresholds, or classification logic. The five levels score on the **QQQ side**;
  NQ is display/canonical only.
- All rescores funnel through `scoreNow()` (manual/apply/ratio) or `provider.onRescore()` (polling).
  New triggers reuse these, never re-implement scoring.

---

## Design system (enforced by convention, not lint — match it)

**Tailwind tokens** (`tailwind.config.js`) — use tokens, not raw hex, in the core trading UI
(levels, ladder, catalyst). Color = meaning, one job each:

- `signal-support` (green) / `signal-resistance` (red) = **market structure only** (support/resistance, directional bias).
- `signal-continuation` (blue) = MID continuation only.
- `state-hold` (teal) = **HOLD only** (and target/holding rows).
- `state-cascadeWatch` (amber) / `state-cascadeActive` (orange) = **CASCADE only**.
- `accent-price` (yellow) = **current price only** ("now"/crosshair).
- `accent-ai` (purple) = **AI / Claude output only**.
- `state-stop` (red) = stop/max-loss.
- `font-price` (IBM Plex Mono) for **all numbers/prices**. `font-ui` (Inter) for text.

**Icons:** `lucide-react` for all UI icons. **No emoji as UI controls.** Emoji allowed only as content
badges already in use: 🔒/🔓 (lock), 🧪 (Labs), ⚡ (cascade/expansion), 🤖 (AI), ★ (full-stack), ▲/▼/▶ (direction).

**Motion:** at most **one pulsing element** in view (`animate-pulse`) — reserve it for the single highest-priority
live signal (cascade-active / live-connection / volatile move), not decoration.

**Layout philosophy — WHERE · WHY · WHAT** (CatalystTab / LevelCard are the reference): context before
commitment. SCAN (where is price vs this level) → DECISION (why: dark pool, score, flags) → EVIDENCE
(what to do: setup, narrative, GEX). Don't surface WHAT without WHERE/WHY.

---

## Conventions

- **No local-machine integrations.** Everything runs on Railway (backend) + Vercel (frontend). There is no
  draw-relay, MCP client, or local agent. App-internal endpoints (`/levels`, `/status`, the `/stream` SSE,
  `/labs/*`, `/catalyst/*`, etc.) exist to serve the app's own frontend only — never assume an external
  consumer. (TradingView draw was removed; its replacement is TASK-PINE, a native TV indicator — see
  [docs/TASKS.md](docs/TASKS.md).)
- **Log prefixes** bracketed by subsystem: `[server]`, `[labs]` (with `[labs] [5m]`/`[1m]`), `[ratio]`, `[levels]`,
  `[narrative]`, `[DataProvider]`. Keep them.
- **SSE emit pattern** is always: `sseEmitter.emit('event', { type: '<name>', ...payload, timestamp: new Date().toISOString() })`.
- **ESM** (`"type": "module"`). Railway runs `node server/index.js` from repo root.
- **Ship discipline:** commit + push on every change → Railway (backend) + Vercel (frontend) auto-deploy from `main`.
  Update `docs/` + the README Recent-Changes row whenever behavior changes; resolve `_next_` to the commit hash.
- **Verify against source, not memory** when documenting or reasoning about the engine/scoring.
