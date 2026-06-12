# Open Tasks

Tracked work items. Everything runs on Railway (backend) + Vercel (frontend) — **no
local-machine integrations** exist or are planned.

| ID | Title | Priority | Notes |
|---|---|---|---|
| **TASK-PINE** | Native TradingView indicator | — | **Designated replacement for the removed draw feature.** A Pine indicator that draws the R2/R1/MID/S1/S2 levels (and optionally classifications) directly on the chart, replacing the old Claude-Code-+-MCP `/draw` relay (removed). Self-contained in TradingView; no server push/pull. |
| **TASK-WEBHOOK-AUTH** | Authenticate `/webhook/levels` | Medium | `POST /webhook/levels` currently has **no auth check** — it's an unauthenticated level-injection point on a public Railway URL. (The old README claimed an HMAC `ACTION_SECRET`; that secret was actually the draw-relay's and is now removed.) Add a shared-secret/HMAC check on the inbound TradingView alert. Today's protection is the **human accept-gate**: webhook levels land as *pending* and require an explicit Accept in the Levels tab before they reach scoring — which lowers urgency but does not close the hole. |
| Trade History tab | Per-session trade log / review | — | Carried over. |
| WHERE·WHY·WHAT rollout | Apply the layout philosophy app-wide | — | Catalyst tab is the reference implementation; a designer brief exists. See [CLAUDE.md](../CLAUDE.md) design section. |
| POLYGON_API_KEY rotation | Rotate the Polygon key | — | Operational hygiene. |
| **TASK-HISTORY** | Self-improving narrative loop | — | Use accumulated session outcomes to tune narratives; needs ~30 logged sessions before it's actionable. |
| **TASK-GAMMA** | SpotGamma overlay | — | Optional GEX/gamma overlay from SpotGamma data. |
| Mobile responsive testing | Verify all tabs on mobile | — | Carried over. |

## Recently closed (removed, not built)

- **TradingView draw** (`/draw`, `/draw-qqq`, draw-relay forwarding, UI draw buttons) — removed; to be replaced by **TASK-PINE**. Git history is the archive.
- **MCP prompt fetching** — never existed as code in this repo; narratives use the Anthropic API directly. The only remnant (a Guide doc line) was removed.
- **WebSocket data provider + REST/WS mode toggle** (`/mode`, `SmartDataProvider.switchMode`, `WebSocketDataProvider`) — removed; REST polling is the only path.
