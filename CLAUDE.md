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
- The 9:30 lock **samples a live NQ÷QQQ pair**, it does NOT read a stored/sticky ratio: NQ = active
  contract's latest 1-min close (Polygon futures), QQQ = `provider.lastPrice` (the existing UW poll —
  no extra calls), **median of 3 ticks (09:30/31/32)**, **sanity-bounded** (±2% of prior, or `[40,43]`
  with no prior) → reject + keep prior + retry; **defer** if a leg is unavailable. (Catch-up after a
  restart samples the *then-current* basis — it cannot recover the open without a historical QQQ feed,
  which the plan lacks; basis stability makes this single-digit-points and self-healing.) The manual
  `/contract/roll` re-lock uses the same median + bound. See `maybeLockSessionRatio`.
- **`getActiveRatio()` / `sessionRatio` is the SINGLE authority** for the global NQ ratio (live ticker +
  scoring derivation). Chain: `sessionRatio ‖ latest?.nq_ratio ‖ getNqRatioFromDb(db) ‖ 41.14`. **Never put a
  second mutable copy ahead of the live value** (a stale copy must not be able to win — cf. the removed
  `nqOffsets.ratio` fallback). `nqOffsets` is **auto_qqq-mode-only** config: its `ratio` defaults to
  `getActiveRatio()` when null, and its per-level offsets **reset to 0 on every contract roll**
  (`resetNqOffsetsOnRoll()`) so a fresh contract never inherits stale NQM6-era tweaks.

## Scoring invariants (see docs/SCORING.md)

- Do not change weights, thresholds, or classification logic. The five levels score on the **QQQ side**;
  NQ is display/canonical only.
- All rescores funnel through `scoreNow()` (manual/apply/ratio) or `provider.onRescore()` (polling).
  New triggers reuse these, never re-implement scoring.

---

## Design system (enforced by convention, not lint — match it)

**Tailwind tokens** (`tailwind.config.js`) — use tokens, not raw hex, in the core trading UI
(levels, ladder, catalyst). Color = meaning, one job each:

- `signal-support` (green) / `signal-resistance` (red) = **SCORED directional bias (the action) only, app-wide.**
  Structural identity (R/S names, unscored Predictive-Ranges bands) renders in **neutral treatments**
  (`text-text-tertiary` family) with text labels — never `signal-*`. **MID** keeps its blue continuation token
  as the range anchor. Surfaces showing unscored structure carry a **"structure — not scored bias"** caption.
  **Conflicted levels** (structure opposing classification) are **always flagged inline and never filtered
  out** of any surface. (Shared `ClassificationChip` + `src/utils/classification.js` are the one source for
  bias label/color/icon/conflict-tag; the chip's Lucide icon satisfies the Lucide-only rule.)
- `signal-continuation` (blue) = MID continuation + the structural range anchor (light blue — distinct from AI).
- `state-hold` (teal) = **HOLD only** (and target/holding rows).
- `state-cascadeWatch` (amber) / `state-cascadeActive` (orange) = **CASCADE only** (orange stays sacred for the hold/exit workflow — never reused).
- `accent-price` (yellow) = **current price only** ("now"/crosshair).
- `accent-ai` (**darker blue**, `#3b5bdb`) = **AI / Claude output only** — deliberately distinct from MID's lighter `signal-continuation` blue so the two never read as the same. Placeholder shade; swap in one place (the `accent-ai` token). Use the token, never a raw `purple-*`/`blue-*` class for AI.
- `accent-conflict` (**purple**) = **CONFLICT / AVOID verdict state only** (freed from AI). Not cascade's orange; dedicated, no overloading.
- `accent-gamma` (**cyan `#22d3ee`**) = the **gamma data class only** (gamma-magnet topography rail: magnet / call-wall / put-wall markers + the regime chip). Deliberately distinct from teal-`state-hold` (#20c997) and the indigo blues (AI #3b5bdb / MID #5ba7ff) so gamma never reads as an action or as AI. **Gamma terrain bands render NEUTRAL SLATE (intensity-only — opacity = |γ| magnitude), never a meaning-hue**; only the named markers carry the cyan. Gamma is reference topography, not a scored signal — it must never adopt `signal-*`, verdict, or cascade colors. Reserved; no overloading.
- **Verdict header** (`levelVerdict`/`VerdictHeader`): green=ACT buy (`signal-support`), red=ACT sell (`signal-resistance`), amber filled=SMALL (`state-exit`) vs amber outline=WAIT (`state-cascadeWatch`, differentiated by fill+icon not a new color), purple=CONFLICT (`accent-conflict`), neutral=NOT_IN_PLAY (`text-tertiary`). The verdict frames the headline + actionable gating only — it never hides level data; out-of-play levels stay full watch cards.
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

- **No local-machine integrations, and no external write paths.** Everything runs on Railway (backend) +
  Vercel (frontend). There is no draw-relay, MCP client, local agent, or inbound webhook. Levels are
  generated natively (Predictive Ranges); **nothing external can write into the app.** All endpoints
  (`/levels`, `/status`, the `/stream` SSE, `/labs/*`, `/catalyst/*`, etc.) exist to serve the app's own
  frontend only — never assume an external consumer. (Both TradingView bridges are gone: the *outbound*
  draw — replacement is TASK-PINE, a native TV indicator — and the *inbound* webhook ingestion — removed,
  levels are native. See [docs/TASKS.md](docs/TASKS.md).)
- **Log prefixes** bracketed by subsystem: `[server]`, `[labs]` (with `[labs] [5m]`/`[1m]`), `[ratio]`, `[levels]`,
  `[narrative]`, `[DataProvider]`, `[gamma]`. Keep them.
- **SSE emit pattern** is always: `sseEmitter.emit('event', { type: '<name>', ...payload, timestamp: new Date().toISOString() })`.
- **ESM** (`"type": "module"`). Railway runs `node server/index.js` from repo root.
- **Ship discipline:** commit + push on every change → Railway (backend) + Vercel (frontend) auto-deploy from `main`.
  Update `docs/` + the README Recent-Changes row whenever behavior changes; resolve `_next_` to the commit hash.
- **Verify against source, not memory** when documenting or reasoning about the engine/scoring.

---

## Data Sourcing — "the API doesn't have it" is never a conclusion

**It is wrong params until proven otherwise.** When data appears missing/absent or an endpoint returns the
wrong or empty result, do **NOT** conclude the data is unavailable. This has been wrong three times and cost
real time: Polygon date-range (wrong param — `window_start.gte`, not `from`/`to`), Polygon futures volume
(wrong endpoint family), UW near-spot gamma (undocumented 50-row truncation — `min_strike`/`max_strike` was
the fix; the data was there all along).

**Required process before EVER reporting data as unavailable:**

1. **Treat a known-good view as proof the data exists.** If the user can see it on the provider's own
   dashboard, TradingView, a broker, or any clearly API-driven UI, the data exists and the API can return it
   — the only question is *which endpoint + params*. Never tell the user "the API doesn't have it" when they
   can see it on the provider's screen.
2. **Read the FULL parameter set in the provider's docs** — not just the params already tried. Hunt
   specifically for: **range/window** filters (`min`/`max`, `from`/`to`, `near`, `atm`), **sort/order**,
   **expiry/date** filters, **pagination/limit** (responses are often *silently truncated* — the UW case was
   an undocumented 50-row cap with a real default of 500), and **granularity** toggles (intraday vs EOD,
   per-strike vs aggregate).
3. **Try parameter-name variants** — the same concept is named differently across APIs:
   `strike_from` vs `min_strike` vs `price_from`; `expiry` vs `expiration` vs `expirations[]` vs `dte`.
4. **Reverse-engineer from the known-good view** — if the user sees specific values on a dashboard, find the
   endpoint + params that reproduce *those specific numbers*, and **verify the returned values match what the
   user sees on screen**.
5. **Only after the above is exhausted** (docs + variants + reverse-engineering) may you report data as
   unreachable — and even then frame it as *"couldn't find the param/endpoint, here's what I tried,"* never
   *"the data doesn't exist."*

**Acceptance for any data-availability question:** either **"here's the endpoint + params that return it,
with values matching the known-good source"** or **"here's exhaustively what I tried (params, variants, docs
sections) and the specific reason it's unreachable"** — never a bare "not available."
