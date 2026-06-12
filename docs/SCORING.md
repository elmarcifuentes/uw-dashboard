# UW Scoring — Definitive Reference

The deep reference for the Unusual Whales (UW) scoring pipeline: how the five price levels get a
**classification + confidence** from live options-flow / dark-pool / GEX data, where rescores come
from, how polling decides *when* to score, how narratives are generated, and how the separate
Catalyst-tab scoring works. Written to be **understood and verified before debugging** — every fact
below was checked against source. Line numbers drift; search by symbol name.

> **Frozen:** `server/scorer/scoreLevel.js` and `server/scorer/fetchData.js` are marked ⚠️ DO NOT
> MODIFY. `server/scorer/index.js` (orchestration/classification) is treated as frozen too. Changing
> weights, thresholds, or classification logic requires a deliberate decision — see [CLAUDE.md](../CLAUDE.md).
> Level math lives in [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md); this doc is everything *downstream* of the levels.

---

## 1. What scoring is

**What gets scored:** the five levels **R2 / R1 / MID / S1 / S2**, on the **QQQ side**. The scorer
receives QQQ prices (NQ is canonical for *display*, not for scoring — see §5). Each level is
independently classified as `buy_support` / `sell_resistance` / `continuation` / `no_edge` with a
confidence tier `none` / `medium` / `high`, plus a set of flags (cascade, structure-break, full-stack,
boundary, lower-high, passive-target).

**Input each level needs** (`scoreLevel(level, …)`): `{ level_id, price, type }` where `type` is
`'resistance' | 'support' | 'mid'`; optional `prior_attempt_high` for lower-high detection. Sample
in `server/scorer/levels.json`.

**UW inputs** — fetched by `server/scorer/fetchData.js` (base `UW_API_BASE || https://api.unusualwhales.com`,
headers `Authorization: Bearer ${UW_API_KEY}` + `UW-CLIENT-API-ID: 100001`):

| Function | Endpoint | Feeds |
|---|---|---|
| `getDarkPool(symbol)` | `/api/darkpool/{symbol}` | dark-pool strength (W2), `current_price`, cascade |
| `getOptionsFlow(symbol)` | `/api/option-trades/flow-alerts?ticker_symbol={symbol}` | flow bias (W3) |
| `getOptionsVolume(symbol)` | `/api/stock/{symbol}/options-volume` | options bias (W1) |
| `getGEXStrikes(symbol)` | `/api/stock/{symbol}/greek-exposure/strike` | GEX context (display) + R3/S3 extension |
| `getEtfTide(symbol)` | `/api/market/{symbol}/etf-tide` | session flow bias → confidence modifier |

**Output shape** — `runFullScore` returns one object:

```js
{
  session, run_type, fetched_at, current_price,          // current_price = first dark-pool print
  cascade:         { active, mid_dp },
  structure_break: { active, direction, distance_to_r2, distance_to_s2, r3 },
  levels: [ /* one per level, see below */ ],
  trigger, scored_at,
}
```

Each scored level (`server/scorer/index.js`):

```js
{
  id, price, type, classification, score, confidence,    // score = primary score for the classification
  dark_pool, etf_direction, gex,                         // gex = { net_gex, gex_bias }
  full_stack, conflict, boundary, lower_high,
  passive_target, passive_target_from,
  raw:    { options_bias, dark_pool, flow_bias, flow_bias_used, flow_match_count, flow_zeroed },
  scores: { buy_support_score, sell_resistance_score, continuation_score },
  nq_price,                                               // added later by runScoreWithNq (canonical NQ)
}
```

**Where it's stored:** in-memory `latest` (the current result) and `history` (ring buffer,
`MAX_HISTORY = 20`); served by `GET /latest` and `GET /history`. It is also **persisted to SQLite**
via `sessionLogger` into tables `sessions`, `events`, `level_outcomes`, `cascade_events`, and
`level_touches` (each rescore → `logger.logRescore(data)`).

---

## 2. The scoring algorithm (exactly)

### Signals and weights (`scoreLevel.js`)

```
W1 options_bias       = 0.35
W2 dark_pool_strength = 0.35
W3 flow_bias          = 0.20
W4 distance_weighting = 0.10
WINDOW_PCT            = 0.0030   // ±0.30% price window for dark pool + flow
to100(raw)           = clamp(round((raw + 1) * 50), 0, 100)   // maps −1..+1 → 0..100 (50 = neutral)
```

**The four signals** (each raw in −1..+1, then `to100`):

1. **Options bias (W1):** `(callVol − putVol) / (callVol + putVol)` from options-volume. Session-wide
   (same for all five levels).
2. **Dark-pool strength (W2):** within ±0.30% of the level, `(belowNotional − aboveNotional) / total`.
   Positive = prints at/below the level = bullish.
3. **Flow bias (W3):** within ±0.30% of the level, `(bullishPremium − bearishPremium) / total`.
   **Requires `MIN_FLOW_MATCHES = 4`** alerts in-window; below 4 the flow signal is **zeroed**
   (`flow_zeroed = true`, `flow_bias_used = 0`) though the raw value is still reported.
4. **Distance (W4):** **inert by design.** `distance100 = 50` (flat neutral) — there is no live-price
   distance weighting. So W4 contributes a constant `0.10 × 50 = 5` to every composite. (This is a
   documented design fact, not removed code.)

**Composite:**

```
composite               = round(W1·optionsBias100 + W2·darkPool100 + W3·flowBias100 + W4·50)
buy_support_score       = composite
sell_resistance_score   = 100 − composite
continuation_score      = round(|(optionsBiasRaw + darkPoolRaw + flowBiasEffective) / 3| × 100)
```

### Classification (`classifyLevel`)

```
buy_support      if buy  ≥ 65 AND (buy  − sell) ≥ 15
sell_resistance  if sell ≥ 65 AND (sell − buy)  ≥ 15
continuation     if cont ≥ 60 AND min(buy, sell) < 45
no_edge          otherwise
```

- **structural_conflict** = `true` when a `support`-type level classifies `sell_resistance`, or a
  `resistance`-type classifies `buy_support` (advisory flag, does not change the classification).
- **continuation_direction** (MID only): `up` if `options_bias + dark_pool + flow_bias > 0` else `down`.

### Confidence (`getConfidenceTier`)

```
none    if classification == no_edge  OR  flow_match_count < 4  OR  primaryScore < 65
high    if primaryScore ≥ 70 AND flow_match_count ≥ 8
medium  otherwise (primaryScore ≥ 65)
```

`primaryScore` = the score for the chosen classification (buy / sell / continuation).

### ETF-tide confidence modifier (`applyEtfTierModifier`, index.js)

Ladder `['none','low','medium','high']`, shift by the session flow bias:

```
buy_support     + bullish ETF → +1     + bearish ETF → −1
sell_resistance + bearish ETF → +1     + bullish ETF → −1
```

`sessionFlowBias` (`'bullish' | 'bearish' | 'neutral' | 'no data'`) compares the latest etf-tide bar
to ~30 bars ago; non-neutral requires `|callAbs − putAbs| / max > 0.10` (10%).

### Flags and structural state (index.js)

- **current_price** = the **first dark-pool print** price.
- **cascade.active** = ALL of: MID `dark_pool ≤ −0.700`; S1 `dark_pool` is `0` or `−1`;
  S2 flow zeroed AND S2 `dark_pool == 0`.
- **structure_break:** `breakUp` if `current_price > R2`, `breakDown` if `current_price < S2`;
  **R3/S3** = the strike with the highest `|net GEX|` within ±2% beyond R2/S2 (`findExtensionLevel`).
- **full_stack** = `structural_conflict && tier == 'high' && etfConfirms` (ETF bias agrees with the call).
- **boundary** = primary score is **exactly 65** (sitting on the classification cutoff).
- **lower_high** = `prior_attempt_high` set, `> price`, and `current_price < prior_attempt_high`.
- **passive_target** = `buy_support`/`sell_resistance` with primary `≥ 65` AND `continuation ≥ 40` →
  nearest level above/below as `passive_target_from`.

### GEX context (`gexContext`) — DISPLAY ONLY

Within ±1.0% (`GEX_WINDOW_PCT = 0.010`): `net_gex` summed; `gex_bias` = `pinning` (net > 0), `expansion`
(net < 0), or `neutral` when `|net|/absSum ≤ 0.05`. **Not used in the score** — advisory only.

### Magic-number index (file:symbol)

| Value | Meaning | Location |
|---|---|---|
| `0.35 / 0.35 / 0.20 / 0.10` | W1 / W2 / W3 / W4 | scoreLevel.js `W1..W4` |
| `0.0030` | dark-pool & flow window ±0.30% | scoreLevel.js `WINDOW_PCT` |
| `4` | min flow alerts to use flow | scoreLevel.js `MIN_FLOW_MATCHES` |
| `65 / 15` | classification score / spread | scoreLevel.js `classifyLevel` |
| `60 / 45` | continuation score / suppression | scoreLevel.js `classifyLevel` |
| `70 / 8` | confidence `high` score / flow | scoreLevel.js `getConfidenceTier` |
| `0.010 / 0.05` | GEX window / neutral band | scoreLevel.js `gexContext` |
| `−0.700` | cascade MID dark-pool | index.js cascade |
| `0.10` | ETF-tide bias threshold | index.js sessionFlowBias |
| `±2%` (`1.02 / 0.98`) | R3/S3 extension zone | index.js structure-break |

---

## 3. Triggers — every rescore path

There are six. Four go through the canonical **`scoreNow(trigger)`** (full narratives); two use
`runScoreWithNq` directly (scores only, no narratives).

| Trigger | Path | Narratives? | Gates |
|---|---|---|---|
| UW polling price event | `provider.onRescore({price, reason})` → `runScoreWithNq('auto')` | **yes** | `systemPaused`, `runFullScore`, levels in DB |
| Score Now button | `POST /rescore` → `scoreNow('manual — dashboard button')` | **yes** | `runFullScore` |
| Apply NQ (Labs) | `POST /labs/apply-to-main` → `scoreNow('labs_apply')` (awaited, atomic) | **yes** | `runFullScore` |
| Ratio lock (scheduled/catch-up/manual) | `onRatioLocked()` → `scoreNow('ratio_lock:…')` | **yes** | `runFullScore` |
| Auto-apply of Labs levels | `applyAutoLevelsIfEnabled()` inline (`setTimeout 1s`) → `runScoreWithNq('auto_level_update')` | **no** | `autoScoreEnabled`, `runFullScore`, levels |
| Startup / manual-NQ save | `runAutoRescore(trigger)` → `runScoreWithNq` | **no** | `runFullScore`, `!systemPaused`, levels |

**`scoreNow(trigger)`** (the canonical sequence), in order:
1. `runScoreWithNq({ trigger, levelsOverride: getLevelsForScoring(db) })` (§5)
2. `latest = result`; `history.unshift` (cap `MAX_HISTORY = 20`)
3. `provider.setLevels(result.levels)`
4. `checkExpansionGex` → `updateDpHistory` → `trackLevelTouches` → `computeSentiment`
5. emit **`rescore`** SSE (immediate — UI updates now)
6. background (fire-and-forget): `generateNarrativeForMode`, `generateLevelNarratives`,
   `generateSessionBrief`, `generateAssistantRead` — each emits its own SSE when ready
7. returns `{ result, scoredAt }`

**What each refreshes:** the scores/levels/`rescore` SSE refresh on *every* trigger. **Narratives only
regenerate on the `scoreNow` paths and `provider.onRescore`** — the two `runScoreWithNq`-direct paths
(auto-apply, `runAutoRescore`) deliberately skip narrative regeneration (lighter weight).

Helper one-liners: `computeSentiment` → bull/bear/mixed state object from ETF dir + MID DP + classifications +
full-stack; `checkExpansionGex` → emits `expansion_gex` SSE + tracks pinning-session count when no negative-GEX
levels; `detectExpansionGex` → levels with `net_gex < 0`; `updateDpHistory` → last 8 dark-pool readings per level;
`trackLevelTouches` → records touches within 0.15 (throttled 60s/level) to `level_touches`.

---

## 4. Polling — when scoring fires

Price polling is the **REST** provider (`RestDataProvider`); `SmartDataProvider` is a thin wrapper that
delegates to it. (WebSocket support was removed — REST is the only path.)

> The provider polls **price only** and decides *when* to rescore. The UW dark-pool/flow/options/GEX/etf
> data that *feeds* scoring is fetched inside the scorer (`fetchData.js`) when `runFullScore` runs — not by
> the provider.

**Adaptive intervals** (`pollingConfig.js`, ms) by distance to the nearest *classified* level
(`_getInterval`):

```
> $2.00 → quiet      10000      > $0.25 → close       3000
> $1.00 → approaching 5000      > $0.10 → veryClose   2000
> $0.50 → near        5000      ≤ $0.10 → atLevel     2000
outside market hours → overnightInterval 300000 (5 min)
```

**Rescore decision** (`_shouldRescore`): trigger if price is within `levelCrossThreshold = 0.15` of a
level, OR moved `≥ priceMoveTrigger = 1.00` since the last rescore, OR `≥ timeBasedInterval = 15 min`
elapsed. Outside market hours with `overnightRescores = false` → **never** rescores.

**Market hours:** weekdays **08:30–16:30 ET** (`_isMarketHours`).

**Budget** (`pollingConfig.budget`): `dailyLimit 15000`, `workingBudget 14000`, `reserve 1000`,
`amberAlert 0.80`, `pauseAt 14000`. `_incrementBudget` warns "amber" at 80% of working budget and
**auto-pauses** the provider at `pauseAt`. Counter resets at UTC midnight.

**Pause system — two independent switches:**
- **Provider pause** (`RestDataProvider.paused`): set by budget exhaustion or `provider.pause()`;
  `_poll` early-exits and `pollingTimer` is cleared; `resume()` reschedules.
- **Server `systemPaused`** (separate global, `/system/pause` ↔ `/system/resume`): gates
  `provider.onRescore` and the labs scheduler regardless of the provider.

---

## 5. How scoring consumes levels

`getLevelsForScoring(db)` reads today's `daily_levels` row and returns the **QQQ** columns as the scorer
input:

```js
[ { level_id:'R2', price: row.r2_qqq, type:'resistance' }, … { level_id:'S2', price: row.s2_qqq, type:'support' } ]
```

So **`level.price` is the QQQ value** — that is what the algorithm scores against (UW data is QQQ-side).
After scoring, **`runScoreWithNq(opts)`** wraps `runFullScore` and attaches the **canonical NQ** to each
scored level by id, from the same `daily_levels` row:

```js
for (const lv of result.levels) {
  const id = String(lv.id || lv.level_id || '').toLowerCase()
  if (row[`${id}_nq`] != null) lv.nq_price = row[`${id}_nq`]
}
```

Net: each scored level carries **both** `price` (QQQ, scored) and `nq_price` (canonical NQ, display).
The frontend reads `nq_price` via `levelNq()` — never reconstructs NQ from QQQ × ratio. `current_price`
is QQQ (first dark-pool print). See [PREDICTIVE_RANGES.md §6](PREDICTIVE_RANGES.md) for the rounding/canonical rules.

---

## 6. Narratives (Claude Haiku)

Model **`claude-haiku-4-5-20251001`**, via `POST https://api.anthropic.com/v1/messages`
(`x-api-key: ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, 10–15s timeout). Mode is
`narrativeMode` = **`template` (default) | `claude` | `off`** (env `NARRATIVE_MODE`, persisted to settings).

| Generator | When | API | Output / SSE | Cache |
|---|---|---|---|---|
| `generateNarrativeForMode` | every rescore | `claude` mode → Anthropic (max 300 tok); else `generateNarrative` template; `off` → `[]` | lines → `narrative_update` | `lastNarrative`, `lastNarrativeHash`, `lastNarrativeMode` |
| `generateLevelNarratives` | rescore, **claude only** | per-level (max 200 tok) | `{id: text}` → `level_narratives_update` | `lastLevelNarratives`, `lastLevelNarrativeHashes` |
| `generateSessionBrief` | rescore, **claude only** | two parallel calls (session 200 + tactical 150) | `{session, tactical}` → `session_brief_update` | `lastSessionBrief`, `lastTacticalBrief`, `lastSessionBriefHash` |
| `generateAssistantRead` | every rescore | template fallback always; `claude` → JSON `{now,next,risk,invalidation}` (max 200) | → `assistant_read_update` | `lastAssistantRead`, `lastAssistantReadHash` |

**Inputs:** the full scoring `result` (levels, classifications, dark pool, cascade, current price, nq_ratio),
formatted to the active symbol (QQQ/NQ). All prompts are instructed to use the active symbol's prices only.

**Hash caching:** each generator hashes the relevant slice of the result and **skips the API call** when
unchanged (`[narrative] cache hit`). **Caches clear on symbol change** — the `symbol_changed` handler nulls
every `last*` cache + hash and emits `symbol_changed` so reconnecting clients don't see stale-symbol text.

---

## 7. The Catalyst tab — separate 5-factor bias

`src/components/catalyst/CatalystTab.jsx` calls `POST /catalyst/fetch` → server `fetchCatalystData()` →
`scoreCatalystBias()`. **Independent of the level scorer — no shared code with `scoreLevel.js`.** It is a
directional *market-bias* read, not a level read.

**Its own UW endpoints** (hardcoded `QQQ`, `Authorization: Bearer` only — note: no `UW-CLIENT-API-ID`
header, unlike `fetchData.js`; `safeFetch` swallows errors → null):
`/api/alerts/options-flow?ticker=QQQ&limit=50`, `/api/stock/QQQ/put-call-ratio`,
`/api/stock/QQQ/greek-exposure/expiry`, `/api/market/tide`.

**Five factors → weighted up/down votes:**

| Factor | Condition → vote | Weight (votes) |
|---|---|---|
| Put/Call Ratio | `>1.2` → DOWN; `<0.8` → UP; else NEUTRAL | ±2 |
| 0DTE GEX | `< −50k` → EXPANSION; `> 100k` → PINNING; else NEUTRAL | **0 votes** (sets `gexNote` only) |
| ETF Tide | `bullish` → UP; `bearish` → DOWN | ±1 |
| MID Dark Pool | `≤ −0.500` → DOWN; `≥ 0.500` → UP; else NEUTRAL | ±2 |
| Options Flow (top 20) | `put > call×1.5` → DOWN; `call > put×1.5` → UP; else NEUTRAL | ±2 |

```
direction  = upVotes > downVotes ? 'UP' : downVotes > upVotes ? 'DOWN' : 'NEUTRAL'
confidence = total == 0 ? 5 : round(max(up,down)/total × 10)      // agreement %, 0–10
gexNote    = netGex < −50000 ? 'expansion' : 'pinning'
```

Result `{ direction, confidence, upVotes, downVotes, factors[], gexNote, summary }` is cached in
`catalystCache` (single in-memory cache; `GET /catalyst/data` returns it, `POST /catalyst/fetch`
refreshes). It reuses the level scorer's `latest` only to read MID `dark_pool` and current price/levels.

---

## 8. Expected behaviors & invariants

**Correct by design (don't "fix"):**
- W4/distance is a constant +5 (no live-price distance weighting). Intentional placeholder.
- GEX never moves a level's score (display/advisory only). Cascade/structure-break/full-stack are flags
  layered *on top of* the score, not inputs to it.
- Flow below 4 in-window alerts is zeroed → those levels lean on options + dark pool only, and can't
  reach `high` confidence (needs `flow_match_count ≥ 8`).
- Auto-apply and `runAutoRescore` refresh scores but **not** narratives.
- Options bias is session-wide (identical across all five levels); only dark-pool and flow are
  per-level windowed.

**Must not change without a deliberate decision** (treat as frozen — see [CLAUDE.md](../CLAUDE.md)):
- Weights `W1..W4`, `WINDOW_PCT`, `MIN_FLOW_MATCHES`.
- Classification cutoffs (`65/15`, `60/45`) and confidence tiers (`70/8`, `65`).
- Cascade trigger (`−0.700` + S1/S2 conditions) and structure-break/extension logic.
- `getLevelsForScoring` (QQQ in) and `runScoreWithNq` (NQ enrichment) — they define the
  canonical-NQ contract every tab depends on.
- The fact that all rescores funnel through `scoreNow` / `provider.onRescore`.

---

## 9. Troubleshooting

| Symptom | Where to look | Confirming signal |
|---|---|---|
| No scores updating during market hours | provider paused? `systemPaused`? budget exhausted? | `[DataProvider] Polling paused`, `Budget exhausted (…)`; `/status` `pollingActive:false`, `callsToday` near 14000 |
| Scores update but **narratives don't** | trigger was a non-narrative path, or `narrativeMode` | auto-apply/`runAutoRescore` skip narratives by design; `[narrative] mode: template/off`; switch to `claude` |
| Narrative stale / not regenerating | hash cache hit, or symbol just changed | `[narrative] cache hit — conditions unchanged`; after symbol change caches clear (`all caches cleared`) |
| Every level shows `no_edge` / `none` | sparse flow (`flow_match_count < 4`) or weak signals | level `raw.flow_zeroed:true`; primary scores < 65 |
| Hosted server returns 503 on `/rescore` | scorer not loaded on Railway (no UW key / import failed) | `[server] Scoring engine failed to load`; run locally which POSTs fresh data |
| Rescores never fire after hours | overnight rescores disabled | `_shouldRescore` returns `outside market hours`; `pollingConfig.marketHours.overnightRescores=false` |
| Cascade never/always fires | the three-condition AND (MID ≤ −0.700, S1 dp 0/−1, S2 flow-zeroed+dp 0) | inspect level `dark_pool` and `raw.flow_zeroed` in `/latest` |
| Catalyst bias looks wrong | different endpoints (hardcoded QQQ) + `safeFetch` swallows errors | `[catalyst] fetched: bias=… confidence=…/10`; a null UW response → factor falls to NEUTRAL silently |
| QQQ levels right but NQ wrong on a tab | `nq_price` enrichment / `levelNq` (not a scoring issue) | see [PREDICTIVE_RANGES.md §6](PREDICTIVE_RANGES.md) |

Log prefixes to grep: `[server]` (scoring orchestration), `[narrative]` / `[level-narrative]` /
`[session-brief]` / `[assistant]` (narratives), `[DataProvider]` (polling/budget/pause), `[catalyst]`.

---

## Design facts (intentional — not bugs)

- **W4 / distance is a constant +5** — `distance100 = 50`, no live-price distance weighting. The 0.10
  "distance" weight is effectively a fixed offset on every composite.
- **GEX is computed but never scored** — `gexContext` output is display-only (easy to assume otherwise).

## Flagged oddities (documented, NOT fixed — raise before touching)

1. **`scoreNow` does not call `emitStaleIfChanged`** while `provider.onRescore` and `runAutoRescore` do —
   minor inconsistency in the otherwise-canonical path.
2. **Catalyst Factor 3 (ETF Tide)** reads `latestResult?.etf_tide`, which the scoring result doesn't set
   (levels carry `etf_direction`); it falls back to `tideData?.data?.direction` from `/api/market/tide`.
3. **Catalyst uses different UW endpoints and headers** than the level scorer (hardcoded QQQ, no
   `UW-CLIENT-API-ID`), and `safeFetch` turns any failure into a silent NEUTRAL factor.

> Several dead-code items previously flagged here (`TOUCH_PCT`, `distanceWeight()`, the WebSocket provider
> stub + unused provider data methods, `darkPoolShiftTrigger`/`structureBreakWarning`) were **removed** in
> the cleanup pass — see [TASKS.md](TASKS.md) "Recently closed".

---

## See also

- [PREDICTIVE_RANGES.md](PREDICTIVE_RANGES.md) — the level engine that produces the QQQ/NQ levels scored here.
- [../README.md](../README.md) — architecture, endpoints, env vars, Recent Changes.
- [../CLAUDE.md](../CLAUDE.md) — frozen constraints.
- Source: `server/scorer/{scoreLevel,index,fetchData}.js`, `server/index.js`
  (`scoreNow`/`runScoreWithNq`/`provider.onRescore`/narratives/`scoreCatalystBias`),
  `server/dataProvider/{RestDataProvider,SmartDataProvider,pollingConfig}.js`, `server/sessionLogger.js`.
