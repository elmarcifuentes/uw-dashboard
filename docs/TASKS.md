# Open Tasks

Tracked work items. Everything runs on Railway (backend) + Vercel (frontend) — **no
local-machine integrations** exist or are planned.

| ID | Title | Priority | Notes |
|---|---|---|---|
| **TASK-PINE** | Native TradingView indicator | — | **Designated replacement for the removed draw feature.** A Pine indicator that draws the R2/R1/MID/S1/S2 levels (and optionally classifications) directly on the chart, replacing the old Claude-Code-+-MCP `/draw` relay (removed). Self-contained in TradingView; no server push/pull. |
| Trade History tab | Per-session trade log / review | — | Carried over. |
| WHERE·WHY·WHAT rollout | Apply the layout philosophy app-wide | — | Catalyst tab is the reference implementation; a designer brief exists. See [CLAUDE.md](../CLAUDE.md) design section. |
| POLYGON_API_KEY rotation | Rotate the Polygon key | — | Operational hygiene. |
| Audit `POST /levels` | Enumerate callers, remove if dead | — | `POST /levels` (server/index.js) is a possibly-legacy manual-save path (Manual Apply NQ uses `/levels/manual-nq`). Enumerate callers; remove if nothing live hits it. Its `levels_updated` SSE emit is now a deliberate no-op (no frontend listener). |
| **TASK-HISTORY** | Self-improving narrative loop | — | Use accumulated session outcomes to tune narratives; needs ~30 logged sessions before it's actionable. |
| **TASK-GAMMA** | SpotGamma overlay | — | Optional GEX/gamma overlay from SpotGamma data. |
| **TASK-CASCADE-WATCH** | Trade-aware cascade pre-warning | — | The cascade pre-warning state is **intended** per the design system's `state-cascadeWatch` token; the prior implementation was **removed as dead** (FLAG-5: it gated on `cascade.conditions[0]`, which `runFullScore` never emitted — `{active, mid_dp}` only — so the CAUTION sentiment + ARMED narrative branches were permanently unreachable). Needs deliberate redesign. **Trading brief (from the user):** *levels are locations, not directions — any level can be support or resistance per its scored classification; adjacent levels serve as trade targets. Cascade-watch's job is the **hold-or-exit decision AT THE TARGET**: as price approaches the active trade's target level, read that level's defense (DP positioning, flow at the strike, evidence thinning) and signal **"level likely folds — next target live, hold through"** vs **"defense holding — take profit here."** Should be **trade-aware** (keyed to `activeTrades[symbol].target`), not MID-generic.* `evaluateHoldExit()` / `CascadeHealth` are the natural consumers once designed. |
| **TASK-EXPANSION-SIGNAL** | Expansion-GEX signalling (if ever wanted) | — | Removed as dead (FLAG-4): level payloads never carried `net_gex` (it's computed in `gexContext` but dropped from `levelPayloads`), so the `expansion_gex` SSE shipped empty forever and the badge never fired. If expansion signalling is wanted, **design it deliberately** — decide whether GEX belongs in the scored payload, and what "expansion" should drive. GEX *context* display (`level.gex`) is a separate, retained role. |
| Mobile responsive testing | Verify all tabs on mobile | — | Carried over. |

## Recently closed (removed, not built)

- **TradingView draw** (`/draw`, `/draw-qqq`, draw-relay forwarding, UI draw buttons) — removed; to be replaced by **TASK-PINE**. Git history is the archive.
- **MCP prompt fetching** — never existed as code in this repo; narratives use the Anthropic API directly. The only remnant (a Guide doc line) was removed.
- **WebSocket data provider + REST/WS mode toggle** (`/mode`, `SmartDataProvider.switchMode`, `WebSocketDataProvider`) — removed; REST polling is the only path.
- **Expansion-GEX badge path** (`detectExpansionGex`/`checkExpansionGex`, `expansion_gex` SSE, `ExpansionGexAlert`, all `l.net_gex` reads, `expansion_gex_fired` session note) — removed as dead (FLAG-4). Redesign tracked as **TASK-EXPANSION-SIGNAL**.
- **Cascade ARMED/CAUTION readers** (`cascade.conditions[0]` across server + UI, `computeSentiment` CAUTION state, ARMED narrative branch) — removed as unreachable (FLAG-5). Cascade **ACTIVE** path unchanged. Redesign tracked as **TASK-CASCADE-WATCH**.
- **Faked ETF-tide meter row** (EvidenceMeter 62/38/50) — removed (FLAG-9/10); only categorical `etf_direction` is exposed (no magnitude), and it duplicates the adjacent ETF Tide stat.
- **TradingView webhook ingestion** (`/webhook/levels` + `accept`/`dismiss`/`pending`/`last`, `parseTradingViewPayload`, `levels_pending`/`levels_dismissed` SSE, the `WEBHOOK_SECRET` auth + rate-limiter from the short-lived **TASK-WEBHOOK-AUTH**, both pending banners, useSSE pending plumbing, the `pending_levels` table) — **removed entirely.** The app generates levels natively via Predictive Ranges; inbound TradingView injection is obsolete. Symmetry: draw was the *outbound* TV bridge (removed), this was the *inbound* one — **TradingView coupling is now zero and the app has no external write paths.** TASK-WEBHOOK-AUTH (added then removed in the same window) is therefore moot. Git history is the archive.
