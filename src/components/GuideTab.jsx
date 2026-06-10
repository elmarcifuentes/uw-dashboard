import { useState } from 'react'

const SECTIONS = [
  'Overview', 'Levels', 'Signals',
  'Flags', 'Cascade', 'AI Narratives',
  'Interface', 'Rules'
]

export default function GuideTab() {
  const [active, setActive] = useState('Overview')

  return (
    <div className="py-3 space-y-3">

      {/* Header */}
      <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
        <h1 className="text-sm font-bold text-text-primary uppercase tracking-wide">
          How TradesAlgo Works
        </h1>
        <p className="text-xs text-text-tertiary mt-1">
          Real-time institutional flow analysis for QQQ options and NQ futures trading.
        </p>
      </div>

      {/* Section nav */}
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setActive(s)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              active === s
                ? 'bg-indigo-700 text-text-primary'
                : 'bg-bg-card border border-border-subtle text-text-secondary hover:text-gray-200'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="space-y-3">
        {active === 'Overview'     && <GuideOverview />}
        {active === 'Levels'       && <GuideLevels />}
        {active === 'Signals'      && <GuideSignals />}
        {active === 'Flags'        && <GuideFlags />}
        {active === 'Cascade'      && <GuideCascade />}
        {active === 'AI Narratives' && <GuideAI />}
        {active === 'Interface'    && <GuideInterface />}
        {active === 'Rules'        && <GuideRules />}
      </div>
    </div>
  )
}

function GuideCard({ title, children, accent }) {
  const border = accent === 'red'    ? 'border-red-900/50'
    : accent === 'green'  ? 'border-green-900/50'
    : accent === 'amber'  ? 'border-amber-900/50'
    : accent === 'purple' ? 'border-purple-900/50'
    : accent === 'blue'   ? 'border-blue-900/50'
    : 'border-border-subtle'
  return (
    <div className={`bg-bg-card border rounded-lg p-4 ${border}`}>
      {title && (
        <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function Pill({ color, label }) {
  const colors = {
    red:    'bg-red-950 text-red-400 border border-red-800',
    green:  'bg-green-950 text-green-400 border border-green-800',
    gray:   'bg-bg-elevated text-text-secondary border border-border-default',
    blue:   'bg-blue-950 text-blue-400 border border-blue-800',
    amber:  'bg-amber-950 text-amber-400 border border-amber-800',
    yellow: 'bg-yellow-950 text-yellow-400 border border-yellow-800',
    purple: 'bg-purple-950 text-purple-400 border border-purple-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[color]}`}>
      {label}
    </span>
  )
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border-subtle/50 last:border-0">
      <span className="text-xs text-text-tertiary shrink-0 w-32">{label}</span>
      <div className="text-right">
        <span className="text-xs text-text-secondary">{value}</span>
        {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── SECTION: OVERVIEW ──────────────────────────────
function GuideOverview() {
  return (
    <div className="space-y-3">
      <GuideCard title="What TradesAlgo Does">
        <p className="text-xs text-text-secondary leading-relaxed">
          TradesAlgo scores five daily price levels — R2, R1, MID, S1, S2 — using live Unusual Whales
          institutional flow data. Each level receives a classification, confidence tier, and AI-generated
          analysis. The tool auto-rescores throughout the session and alerts you when conditions change.
        </p>
      </GuideCard>

      <GuideCard title="Tab Structure">
        <div className="space-y-2">
          {[
            { tab: 'Overview',
              q: 'What matters most right now?',
              desc: 'Hero layout — market state, live price, immediate risk, strongest levels, evidence bars' },
            { tab: 'Pre-Session',
              q: "What is today's structure and risk?",
              desc: 'Session brief, market state, alerts, all 5 level cards, GEX, sector flow, Greek flow' },
            { tab: 'Intraday',
              q: 'What is price doing now?',
              desc: 'Live price ladder, cascade gauge, session read, right evidence rail, sub-tabs' },
            { tab: 'Post-Session',
              q: 'What happened today?',
              desc: 'Session events, level outcomes, cascade detail, timeline, export JSON' },
            { tab: 'News',
              q: 'What is moving markets?',
              desc: 'Full news feed, filtered by relevance and sentiment' },
            { tab: 'Settings 🔒',
              q: 'System config and labs',
              desc: 'System: level source mode, daily levels, scoring controls, system pause, sound alerts, API budget. Labs: Predictive Ranges auto-detection tools' },
            { tab: 'Guide',
              q: 'How does this work?',
              desc: 'This reference documentation' },
          ].map(t => (
            <div key={t.tab} className="border border-border-subtle rounded p-3">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-bold text-text-primary">{t.tab}</span>
                <span className="text-xs text-indigo-400">{t.q}</span>
              </div>
              <p className="text-xs text-text-muted">{t.desc}</p>
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title="Daily Workflow">
        <div className="space-y-2">
          {[
            { time: 'Pre-Market',
              steps: [
                'Settings tab → PIN → ⚙ System → review TradingView webhook banner → Accept',
                'OR: choose Level Source mode → enter 5 NQ + 5 QQQ prices manually → Save Levels',
                'Optional: /draw in Claude Code to update TradingView chart lines',
              ]},
            { time: 'During Session',
              steps: [
                'Everything automatic — auto-rescores on level touches, $1 moves, 15-min intervals',
                'Watch Assistant Strip: NOW / NEXT / RISK / IF WRONG updates on signal changes',
                'Intraday tab → price ladder with proximity glow shows nearest level in real time',
                'Cascade gauge turns amber when MID dark pool approaches -0.700',
              ]},
            { time: 'End of Day',
              steps: [
                'Post-Session tab → review level outcomes and cascade events',
                'Export Session JSON for records',
              ]},
          ].map(phase => (
            <div key={phase.time}>
              <div className="text-xs text-text-tertiary font-bold mb-1">{phase.time}</div>
              <ul className="space-y-1">
                {phase.steps.map((s, i) => (
                  <li key={i} className="text-xs text-text-secondary flex gap-2">
                    <span className="text-text-disabled shrink-0">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </GuideCard>
    </div>
  )
}

// ── SECTION: LEVELS ────────────────────────────────
function GuideLevels() {
  return (
    <div className="space-y-3">
      <GuideCard title="The Five Levels">
        <div className="space-y-2">
          {[
            { id: 'R2',  color: 'red',   desc: 'Upper resistance 2 — extreme supply zone' },
            { id: 'R1',  color: 'red',   desc: 'Upper resistance 1 — primary institutional resistance' },
            { id: 'MID', color: 'amber', desc: 'Session midpoint — cascade trigger level, critical pivot' },
            { id: 'S1',  color: 'green', desc: 'Lower support 1 — first institutional floor' },
            { id: 'S2',  color: 'green', desc: 'Lower support 2 — extreme support zone' },
          ].map(l => (
            <div key={l.id} className="flex items-start gap-3 py-2 border-b border-border-subtle/50 last:border-0">
              <Pill color={l.color} label={l.id} />
              <span className="text-xs text-text-secondary">{l.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">
          Levels are derived from NQ futures pivots and entered each morning. Both NQ and QQQ prices
          are stored — all analysis shows both in the format $703.54 (NQ 28,945).
        </p>
      </GuideCard>

      <GuideCard title="Classifications">
        <div className="space-y-3">
          {[
            { label: 'BUY SUPPORT', color: 'green',
              desc: 'Institutional accumulation detected. Dark pool prints below level, flow bullish. Price expected to find buyers at or near this level.',
              action: 'Watch for bounce confirmation. Target is next level up.' },
            { label: 'SELL RESISTANCE', color: 'red',
              desc: 'Institutional distribution detected. Dark pool prints above level, flow bearish. Price expected to struggle or reject at this level.',
              action: 'Watch for rejection confirmation. Target is next level down.' },
            { label: 'CONTINUATION', color: 'blue',
              desc: 'Directional momentum confirmed. Signals align with prevailing trend.',
              action: 'Trade in the direction of continuation, not against it.' },
            { label: 'NO EDGE', color: 'gray',
              desc: 'Insufficient signal. Dark pool neutral, flow mixed. No institutional positioning detected at this level.',
              action: 'Treat as a reference point only. Do not trade the level alone.' },
          ].map(c => (
            <div key={c.label} className="border border-border-subtle rounded p-3 space-y-1">
              <Pill color={c.color} label={c.label} />
              <p className="text-xs text-text-secondary mt-2">{c.desc}</p>
              <p className="text-xs text-indigo-400">→ {c.action}</p>
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title="Confidence Tiers">
        <Row label="HIGH"   value="Score ≥ 70, flow ≥ 8 alerts" sub="Strongest signal — highest conviction" />
        <Row label="MEDIUM" value="Score ≥ 65, flow ≥ 4 alerts" sub="Good signal — act with confirmation" />
        <Row label="LOW"    value="Score ≥ 65, flow < 4 alerts"  sub="Weak signal — use caution" />
        <Row label="NONE"   value="Score < 65"                   sub="No actionable signal" />
        <p className="text-xs text-text-muted mt-2">
          ETF Tide modifier: confirms → upgrades tier, opposes → downgrades tier.
        </p>
      </GuideCard>
    </div>
  )
}

// ── SECTION: SIGNALS ───────────────────────────────
function GuideSignals() {
  return (
    <div className="space-y-3">
      <GuideCard title="Signal Weights">
        {[
          { signal: 'Dark Pool', weight: '35%',
            desc: 'Institutional print location and absorption value (-1.0 to +1.0). Most reliable signal — always wins conflicts with flow.' },
          { signal: 'Options Flow', weight: '35%',
            desc: 'Call vs put premium bias. Measures directional positioning.' },
          { signal: 'Flow Alerts', weight: '20%',
            desc: 'Number of directional flow alert triggers. Conviction indicator.' },
          { signal: 'Distance', weight: '10%',
            desc: 'Price proximity to level. Closer = higher weight.' },
          { signal: 'ETF Tide', weight: 'modifier',
            desc: 'QQQ ETF directional bias. Confirms or downgrades confidence tier — does not affect score.' },
        ].map(s => (
          <div key={s.signal} className="border-b border-border-subtle/50 last:border-0 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-text-primary">{s.signal}</span>
              <span className="text-xs font-mono text-indigo-400">{s.weight}</span>
            </div>
            <p className="text-xs text-text-tertiary">{s.desc}</p>
          </div>
        ))}
      </GuideCard>

      <GuideCard title="Dark Pool Reading">
        <div className="space-y-1.5">
          <Row label="+1.000"              value="Maximum absorption"       sub="All institutional prints below level" />
          <Row label="+0.500 to +1.000"   value="Strong buy"               sub="Heavy institutional accumulation" />
          <Row label="0.000"               value="Neutral"                  sub="No institutional positioning" />
          <Row label="-0.500 to -0.700"   value="Supply building"          sub="Approaching cascade threshold" />
          <Row label="≤ -0.700"           value="⚠ Cascade threshold"     sub="MID only — triggers cascade check" />
          <Row label="-1.000"              value="Maximum distribution"     sub="All institutional prints above level" />
        </div>
      </GuideCard>

      <GuideCard title="Dark Pool Sparklines">
        <p className="text-xs text-text-secondary leading-relaxed">
          Each level card shows a mini trend line of the last 8 dark pool readings with a red dashed
          threshold line at -0.700. The sparkline color shows trend direction: red = deteriorating,
          green = recovering, gray = flat.
        </p>
        <p className="text-xs text-text-muted mt-2">
          Direction of movement matters as much as the current value. A DP moving from -0.500 toward
          -0.700 is more concerning than one sitting steady at -0.650.
        </p>
      </GuideCard>

      <GuideCard title="0DTE Flow Interpretation">
        <p className="text-xs text-text-secondary leading-relaxed">
          0DTE flow data is session-wide accumulated premium. Morning call buying remains in the totals
          even after an afternoon selloff.
        </p>
        <div className="space-y-1.5 mt-3">
          <Row label="All 3 BEARISH pre-open" value="Strong conviction"    sub="Institutions positioned short before open" />
          <Row label="All 3 BULLISH pre-open" value="Strong conviction"    sub="Most reliable read of the day" />
          <Row label="Mixed during session"   value="Morning/afternoon offsetting" sub="Rely on dark pool and cascade instead" />
        </div>
      </GuideCard>
    </div>
  )
}

// ── SECTION: FLAGS ─────────────────────────────────
function GuideFlags() {
  return (
    <div className="space-y-3">
      <GuideCard title="Level Flags">
        {[
          { flag: '★ FULL STACK', color: 'yellow',
            desc: 'All three signals aligned at this level — dark pool, options flow, and flow alerts all pointing the same direction.',
            rule: 'Resistance Magnet rule: FULL STACK + SELL RESISTANCE has held 16/16 sessions.' },
          { flag: '⚡ EXPANSION GEX', color: 'red',
            desc: 'Net GEX is negative at this level. No mechanical friction — gamma exposure removes the natural pinning force.',
            rule: 'When cascade fires with expansion GEX, moves accelerate without normal resistance.' },
          { flag: '↘ LOWER HIGH', color: 'amber',
            desc: 'Price made a lower high relative to the previous swing. Bearish momentum confirmation.',
            rule: 'Confirms directional bias in trending sessions.' },
          { flag: 'BOUNDARY SCORE', color: 'gray',
            desc: 'Score is within 5 points of the classification threshold (65). Signal is weak and subject to reclassification.',
            rule: 'Treat as tentative — wait for score to move away from boundary.' },
          { flag: 'SUPPLY CONFIRMED', color: 'red',
            desc: 'Heavy institutional selling confirmed above level. DP reading strongly negative with high score.',
            rule: 'One of the strongest sell signals in the system.' },
          { flag: 'STRUCTURAL VOID', color: 'gray',
            desc: 'No dark pool prints in either the recent or historical window. No institutional interest at this level.',
            rule: 'Critical for cascade — S1 and S2 voids with MID cascade trigger = unimpeded downside.' },
          { flag: 'SUPPLY BUILDING', color: 'amber',
            desc: 'Selling pressure growing above level. DP reading trending more negative.',
            rule: 'Watch for MID supply building — approaching cascade threshold.' },
          { flag: 'MAXIMUM ABSORPTION', color: 'green',
            desc: 'All institutional prints below this level. DP at or near +1.000.',
            rule: 'Strongest buy signal. Price may be drawn up to this level.' },
        ].map(f => (
          <div key={f.flag} className="border border-border-subtle rounded p-3 space-y-1.5 mb-2">
            <Pill color={f.color} label={f.flag} />
            <p className="text-xs text-text-secondary">{f.desc}</p>
            <p className="text-xs text-indigo-400">→ {f.rule}</p>
          </div>
        ))}
      </GuideCard>
    </div>
  )
}

// ── SECTION: CASCADE ───────────────────────────────
function GuideCascade() {
  return (
    <div className="space-y-3">
      <GuideCard title="Cascade Condition" accent="red">
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          Cascade is an unimpeded downside move condition. When all three conditions are met simultaneously,
          there is no institutional floor below MID — price can fall through S1 and S2 without support.
        </p>
        <div className="space-y-2">
          {[
            { cond: 'MID dark pool ≤ -0.700',
              desc: 'Institutional sellers confirmed at MID. Not just approaching — past the threshold.' },
            { cond: 'S1 zero/artifact',
              desc: 'S1 shows no real institutional positioning. Score near zero or artifact print.' },
            { cond: 'S2 structural void',
              desc: 'S2 has no dark pool prints in either window. No floor below S1.' },
          ].map((c, i) => (
            <div key={i} className="flex gap-3 p-2.5 rounded bg-red-950/30 border border-red-900/40">
              <span className="text-red-500 font-bold text-xs shrink-0 mt-0.5">{i + 1}</span>
              <div>
                <div className="text-xs font-bold text-red-300 mb-0.5">{c.cond}</div>
                <div className="text-xs text-text-tertiary">{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-red-950/20 border border-red-900/30 rounded p-3 mt-3">
          <div className="text-xs font-bold text-red-400 mb-1">Validated: 4/4 sessions</div>
          <p className="text-xs text-text-tertiary">
            Every session where all three conditions triggered resulted in an unimpeded move. No exceptions recorded.
          </p>
        </div>
      </GuideCard>

      <GuideCard title="Cascade Visual Indicators">
        <div className="space-y-1.5">
          <Row label="Horizontal gauge" value="+1.0 to -1.0 scale"    sub="Tracks MID dark pool in real time" />
          <Row label="Threshold marker" value="Red line at -0.700"    sub="Visual trigger point" />
          <Row label="Thermometer"      value="Vertical fill bar"     sub="Green → amber → red as MID dp deteriorates" />
          <Row label="Condition dots"   value="○ unmet / ✓ MET"       sub="Each of three conditions tracked separately" />
          <Row label="Proximity label"  value="X.XXX from -0.700"     sub="Shows on MID level card when approaching" />
        </div>
      </GuideCard>

      <GuideCard title="GEX Pinning vs Expansion">
        <p className="text-xs text-text-secondary leading-relaxed">
          GEX (Gamma Exposure) creates mechanical friction that pins price within a range. When GEX is
          positive (pinning), price tends to mean-revert. When GEX goes negative (expansion), that friction
          disappears — moves can accelerate.
        </p>
        <div className="mt-3 space-y-1.5">
          <Row label="PINNING regime"           value="GEX > 0"        sub="Price anchored — mean reversion favored" />
          <Row label="EXPANSION regime"         value="GEX < 0"        sub="No mechanical friction — directional moves" />
          <Row label="Expansion during cascade" value="Accelerator"    sub="Removes the last natural resistance to downside" />
        </div>
        <div className="bg-amber-950/20 border border-amber-900/30 rounded p-3 mt-3">
          <div className="text-xs font-bold text-amber-400 mb-1">GEX Pinning rule: 17/17</div>
          <p className="text-xs text-text-tertiary">
            GEX cage held price until expansion GEX fired in every session recorded.
          </p>
        </div>
      </GuideCard>
    </div>
  )
}

// ── SECTION: AI NARRATIVES ─────────────────────────
function GuideAI() {
  return (
    <div className="space-y-3">
      <GuideCard title="Assistant Strip" accent="purple">
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          Persistent across Overview, Pre-Session, and Intraday tabs. Always shows four structured
          outputs from Claude Haiku:
        </p>
        <div className="space-y-2">
          {[
            { label: 'NOW',      color: 'text-text-primary',     desc: 'Current market state in one sentence.' },
            { label: 'NEXT',     color: 'text-blue-300',  desc: 'Most likely next price test or move.' },
            { label: 'RISK',     color: 'text-amber-300', desc: 'Primary risk to the current thesis.' },
            { label: 'IF WRONG', color: 'text-text-secondary',  desc: 'What would change the read entirely.' },
          ].map(f => (
            <div key={f.label} className="flex gap-3 items-start">
              <span className={`text-xs font-bold shrink-0 w-16 ${f.color}`}>{f.label}</span>
              <span className="text-xs text-text-tertiary">{f.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">
          Updates only when scoring conditions change. Cached by hash — no API call if signals unchanged.
        </p>
      </GuideCard>

      <GuideCard title="Narrative Types" accent="purple">
        {[
          { type: 'Session Brief',
            tab: 'Pre-Session',
            length: '3 sentences',
            trigger: 'Structure or major signal change',
            desc: 'Full-width section above hero cards. Covers dominant level, primary institutional signal, cascade risk, and key thresholds with NQ prices throughout.' },
          { type: 'Level Analysis',
            tab: 'Both tabs',
            length: '3-4 sentences per level',
            trigger: 'Per-level signal change',
            desc: 'Expandable ▶ 🤖 Claude Analysis below each level card. Includes retest scenarios, targets in QQQ and NQ, cross-level context awareness.' },
          { type: 'Tactical Brief',
            tab: 'Intraday Session Read',
            length: '2 sentences',
            trigger: 'Any meaningful signal change',
            desc: 'Where price is relative to the most important level, and what to watch next. Updates on every qualifying rescore.' },
        ].map(n => (
          <div key={n.type} className="border border-purple-900/30 bg-purple-950/10 rounded p-3 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-purple-300">🤖 {n.type}</span>
              <span className="text-xs text-text-muted">{n.tab}</span>
            </div>
            <p className="text-xs text-text-secondary mb-1">{n.desc}</p>
            <div className="flex gap-3 text-xs text-text-muted">
              <span>{n.length}</span>
              <span>·</span>
              <span>{n.trigger}</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-text-muted mt-2">
          All narratives use Claude Haiku via Anthropic API (~$0.25/day). Toggle between Template (free),
          Claude (AI), or Off in Settings → System → Controls. Mode persists across Railway restarts.
        </p>
      </GuideCard>
    </div>
  )
}

// ── SECTION: INTERFACE ─────────────────────────────
function GuideInterface() {
  return (
    <div className="space-y-3">

      <GuideCard title="Color System">
        <div className="space-y-1.5">
          {[
            { color: 'bg-green-500',  label: 'Green',  meaning: 'Buy support / bullish / positive' },
            { color: 'bg-red-500',    label: 'Red',    meaning: 'Sell resistance / bearish / danger' },
            { color: 'bg-amber-500',  label: 'Amber',  meaning: 'Watch state / approaching threshold / caution' },
            { color: 'bg-blue-500',   label: 'Blue',   meaning: 'Continuation / neutral structure' },
            { color: 'bg-purple-500', label: 'Purple', meaning: 'Claude AI-generated content only' },
            { color: 'bg-yellow-400', label: 'Yellow', meaning: 'Current price crosshair / live price locator' },
            { color: 'bg-gray-500',   label: 'Gray',   meaning: 'No edge / neutral / diagnostic' },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full shrink-0 ${c.color}`} />
              <span className="text-xs text-text-secondary w-16 shrink-0">{c.label}</span>
              <span className="text-xs text-text-muted">{c.meaning}</span>
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title="Level Proximity Glow">
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          Level cards glow when price approaches. Color reflects the level's classification —
          not just direction of approach.
        </p>
        <div className="space-y-1.5">
          <Row label="Critical ≤ $0.15" value="Bright pulse + thick border + label" sub="Action zone — price at level" />
          <Row label="Near ≤ $0.50"     value="Medium glow + border + label"        sub="Approaching — prepare for action" />
          <Row label="Watching ≤ $1.00" value="Subtle glow + label"                sub="On radar — monitor" />
          <Row label="Away > $1.00"     value="Clean card — no glow"               sub="Not relevant right now" />
        </div>
        <p className="text-xs text-text-muted mt-3">
          The yellow price crosshair (▶ $700.20 / NQ 28,807) floats between the two levels bracketing
          current price on the Intraday price ladder. A ⚡ CROSSED flash appears for 3 seconds when
          price crosses through any level.
        </p>
      </GuideCard>

      <GuideCard title="Intraday Right Rail">
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          The right side panel on the Intraday tab shows supporting evidence without cluttering
          the price ladder.
        </p>
        <div className="space-y-1.5">
          <Row label="Cascade Monitor" value="MID dp + gap from trigger"  sub="Safe / Approaching / Active status" />
          <Row label="Level Evidence"  value="Click R2/R1/MID/S1/S2"     sub="DP bar, score, sparkline, Claude analysis" />
          <Row label="Active Signals"  value="Classified levels only"     sub="Quick scan of what has institutional edge" />
        </div>
        <p className="text-xs text-text-muted mt-2">
          Auto-selects the nearest level on load. Hidden on mobile — full screen price ladder only.
        </p>
      </GuideCard>

      <GuideCard title="Sound Alerts">
        <div className="space-y-1.5">
          <Row label="Level touch (≤ $0.15)" value="C5 tone (buy) / Eb4 tone (sell)" sub="Different pitch for buy vs sell levels" />
          <Row label="Cascade fires"          value="Three descending tones"          sub="440 → 370 → 311 Hz" />
        </div>
        <p className="text-xs text-text-muted mt-2">Toggle in Settings → System. Off by default.</p>
      </GuideCard>

      <GuideCard title="TradingView Integration">
        <div className="space-y-1.5">
          <Row label="Webhook (recommended)" value="TradingView alert → Railway"      sub="Auto-populates Levels tab with pending banner" />
          <Row label="Manual entry"          value="Levels tab → NQ + QQQ prices"    sub="Ratio auto-calculated from entries" />
          <Row label="/draw command"         value="Claude Code + MCP"               sub="Local only — draws lines on TradingView chart" />
          <Row label="Draw buttons"          value="Settings → System → Controls"     sub="Requires draw-relay + ngrok running locally" />
        </div>
      </GuideCard>
    </div>
  )
}

// ── SECTION: RULES ─────────────────────────────────
function GuideRules() {
  return (
    <div className="space-y-3">
      <GuideCard title="Validated Trading Rules">
        <p className="text-xs text-text-tertiary mb-3">
          Rules validated across all recorded sessions. Zero exceptions where noted.
        </p>
        <div className="space-y-3">
          {[
            { name: 'Resistance Magnet', record: '16/16', color: 'green',
              rule: 'FULL STACK ★ + SELL RESISTANCE = price drawn back to that level.',
              detail: 'When a level shows FULL STACK with sell resistance classification, it acts as a magnet. Price has returned to test it in every session recorded. Never failed.' },
            { name: 'Cascade Warning', record: '4/4', color: 'red',
              rule: 'MID dp ≤ -0.700 + S1 artifact + S2 void = unimpeded downside.',
              detail: 'When all three cascade conditions are met, there is no institutional floor below MID. Every instance resulted in an unimpeded move through S1 toward S2.' },
            { name: 'Dark Pool Wins', record: '16/16', color: 'green',
              rule: 'Dark pool signal overrides options flow in every conflict.',
              detail: 'When dark pool and options flow point in opposite directions, the dark pool reading has been correct every time. Trust DP over flow.' },
            { name: 'GEX Pinning', record: '17/17', color: 'green',
              rule: 'GEX cage holds price until expansion GEX fires.',
              detail: 'In every session with active GEX pinning, price stayed within the cage until the expansion GEX signal fired. Once expansion GEX fires, directional moves accelerate.' },
            { name: 'Expansion GEX Accelerator', record: '1/1', color: 'amber',
              rule: 'Negative net GEX removes mechanical friction during cascade.',
              detail: 'First confirmed during a cascade session. Expansion GEX fired at S2 and the move accelerated without normal resistance. Expected to remain consistent.' },
          ].map(r => (
            <div key={r.name} className="border border-border-subtle rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">{r.name}</span>
                <span className={`text-xs font-bold font-mono ${
                  r.color === 'green' ? 'text-green-400'
                  : r.color === 'red' ? 'text-red-400'
                  : 'text-amber-400'
                }`}>{r.record}</span>
              </div>
              <p className="text-xs text-indigo-400 mb-1.5">{r.rule}</p>
              <p className="text-xs text-text-tertiary">{r.detail}</p>
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title="Do / Don't">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-bold text-green-400 mb-2">✓ Do</div>
            <ul className="space-y-1.5">
              {[
                'Trust dark pool over flow when they conflict',
                'Wait for FULL STACK before fading resistance',
                'Monitor MID dark pool every rescore during session',
                'Check S1 and S2 classification when MID dp < -0.500',
                'Use NQ distance for precise entries and targets',
                'Switch to Claude mode for richer analysis during key setups',
              ].map((d, i) => (
                <li key={i} className="text-xs text-text-secondary flex gap-2">
                  <span className="text-green-600 shrink-0">·</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold text-red-400 mb-2">✗ Don't</div>
            <ul className="space-y-1.5">
              {[
                'Trade NO EDGE levels without additional confirmation',
                'Ignore cascade proximity when MID dp is below -0.500',
                'Treat 0DTE flow as real-time signal mid-session',
                'Override dark pool signal with personal bias',
                'Assume support holds when S1/S2 show structural void',
                'Ignore expansion GEX flag when cascade is approaching',
              ].map((d, i) => (
                <li key={i} className="text-xs text-text-secondary flex gap-2">
                  <span className="text-red-600 shrink-0">·</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </GuideCard>
    </div>
  )
}
