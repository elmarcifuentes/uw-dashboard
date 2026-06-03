const GUIDE_SECTIONS = [
  {
    icon: '📊',
    title: 'What This Dashboard Does',
    content: `This tool scores five daily price levels for QQQ (the Nasdaq-100 ETF) using real institutional data from dark pool trades, options flow alerts, and options volume. It tells you where institutional money is positioned and classifies each level as a buying opportunity, selling opportunity, or no signal. The goal is to filter out noise and only act on levels where the data gives a clear directional read.`,
  },
  {
    icon: '🎯',
    title: 'The Five Levels',
    content: `Every morning, five price levels are calculated from a TradingView indicator: R2 (second resistance), R1 (first resistance), MID (midpoint), S1 (first support), and S2 (second support). These are the only levels that matter for the day. The scoring engine fetches live institutional data for each level and determines its signal quality.`,
  },
  {
    icon: '🔄',
    title: 'How Data Updates',
    content: `The dashboard updates automatically. A polling engine checks the current price every 2–60 seconds depending on how close price is to a key level. When price approaches a level, it checks every 2 seconds. When price is far from all levels, it checks every 60 seconds. When a meaningful condition changes (like a level classification flipping), the dashboard updates instantly and shows a CHART STALE badge indicating your TradingView chart labels should be refreshed.`,
  },
  {
    icon: '⚠',
    title: 'The Cascade Warning',
    content: `The cascade warning is one of the most important signals. It fires when three conditions are simultaneously true: the MID level has heavy institutional supply above it, S1 has no institutional prints, and S2 is a structural void. When all three are met, a break below MID produces an unimpeded move to S1 and potentially S2 with no institutional floor to stop it. This warning has been validated in every session it has fired.`,
  },
  {
    icon: '📈',
    title: 'The Resistance Magnet Pattern',
    content: `When a resistance level (R1 or R2) classifies as buy_support with a conflict flag (⚠), it means institutional money is absorbed below that level — not above it. This creates a magnet effect where price is drawn toward the level rather than rejected at it. This pattern has been confirmed in 16 consecutive sessions with zero failures. When you see a green R1 or R2 with a ⚠ flag, that is the highest-conviction setup in this model.`,
  },
  {
    icon: '⭐',
    title: 'FULL STACK — Maximum Conviction',
    content: `The FULL STACK signal (★) fires when three conditions align simultaneously: a resistance level is showing buy_support (magnet pattern), the confidence tier is HIGH (score ≥70, flow ≥8 matches), and the ETF tide confirms the direction. When you see ★ on a level, it represents the highest probability setup the model can identify. Never fade a FULL STACK signal on first approach.`,
  },
]

const COLOR_REFERENCE = [
  {
    color: '#1A7A4A',
    label: 'Green — BUY SUPPORT',
    meaning: 'Institutional absorption below this level. Dark pool prints concentrated in the support window. Price is expected to be drawn toward or bounce from this level.',
    action: 'Long bias. Buy the approach or bounce. Stop below the level.',
  },
  {
    color: '#C0392B',
    label: 'Red — SELL RESISTANCE',
    meaning: 'Institutional supply above this level. Dark pool prints concentrated in the resistance window. Price is expected to reject or struggle through this level.',
    action: 'Short bias or scale out of longs. Watch for rejection.',
  },
  {
    color: '#1B8CA6',
    label: 'Teal — MID NEUTRAL',
    meaning: 'The midpoint level with no directional classification yet. Watching for dark pool to develop direction as session progresses.',
    action: 'Wait for classification. MID dark pool direction defines session bias.',
  },
  {
    color: '#6B7280',
    label: 'Grey — NO EDGE',
    meaning: 'Insufficient signal to classify. Could be artifact, flow zeroed, or genuinely empty. No institutional read at this level.',
    action: 'Do not trade this level until signal develops. Wait for next rescore.',
  },
]

const FLAG_REFERENCE = [
  { flag: '★', color: 'text-yellow-400', label: 'FULL STACK', meaning: 'Maximum conviction. Resistance magnet + High confidence + ETF confirmed. Never fade on first approach. 16/16 sessions confirmed.' },
  { flag: '⚠', color: 'text-amber-400',  label: 'STRUCTURAL CONFLICT', meaning: 'Level type contradicts classification. Resistance showing buy_support = resistance magnet. This IS the pattern — not a warning.' },
  { flag: '⚡', color: 'text-orange-400', label: 'BOUNDARY SCORE', meaning: 'Score is exactly 65 — minimum threshold. Verify: dark pool ≥ +0.700 AND flow ≥ 4 matches. If either fails, treat as no_edge.' },
  { flag: '↙', color: 'text-purple-400', label: 'LOWER HIGH', meaning: 'Second approach below prior touch. Momentum exhausting at this level. Tighten stop, reduce size. Third attempt likely to fail.' },
]

const ARROW_REFERENCE = [
  { arrow: 'DP↑',  meaning: 'Dark pool ≥ +0.300 — institutional buying dominant below this level' },
  { arrow: 'DP↓',  meaning: 'Dark pool ≤ -0.300 — institutional supply dominant above this level' },
  { arrow: 'DP—',  meaning: 'Dark pool between -0.300 and +0.300 — mixed or neutral' },
  { arrow: 'ETF↑', meaning: 'ETF tide bullish — call buying dominant in last 30 minutes' },
  { arrow: 'ETF↓', meaning: 'ETF tide bearish — put buying or call selling dominant' },
  { arrow: 'ETF—', meaning: 'ETF tide neutral — no strong directional bias' },
]

const VALIDATED_RULES = [
  { rule: 'Resistance Magnet', sessions: '16/16', description: 'When R1 or R2 shows buy_support with ⚠ flag, price is drawn toward the level — not rejected. Zero failures across 16 sessions.' },
  { rule: 'Cascade Warning',   sessions: '3/3',   description: 'When all three cascade conditions fire simultaneously, a MID break produces an unimpeded move through S1 and S2.' },
  { rule: 'Dark Pool vs Flow', sessions: '16/16', description: 'When dark pool and flow signals conflict, dark pool wins. Zero exceptions. This is why dark pool carries 35% weight.' },
  { rule: 'GEX Pinning',       sessions: '16/16', description: 'All sessions have shown exclusively pinning GEX. No expansion observed yet. First expansion GEX will be a significant signal.' },
]

export default function Guide() {
  return (
    <div className="space-y-8 pb-8">

      {/* Section 1 — How to Read */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
          How to Read This Dashboard
        </h2>
        <div className="space-y-3">
          {GUIDE_SECTIONS.map((s, i) => (
            <div key={i} className="bg-gray-800/60 rounded border border-gray-700 p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{s.icon}</span>
                <h3 className="text-white font-bold text-sm">{s.title}</h3>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 — Signal Reference */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
          Signal Reference
        </h2>

        {/* Color reference */}
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Level Colors</h3>
        <div className="space-y-2 mb-6">
          {COLOR_REFERENCE.map((item, i) => (
            <div key={i} className="flex gap-3 p-3 bg-gray-800/60 rounded border border-gray-700">
              <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <div>
                <div className="font-bold text-sm mb-1" style={{ color: item.color }}>{item.label}</div>
                <p className="text-gray-300 text-xs mb-1">{item.meaning}</p>
                <p className="text-teal-400 text-xs">→ {item.action}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Flag reference */}
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Flags</h3>
        <div className="space-y-2 mb-6">
          {FLAG_REFERENCE.map((item, i) => (
            <div key={i} className="flex gap-3 p-3 bg-gray-800/60 rounded border border-gray-700">
              <span className={`text-lg w-6 shrink-0 text-center ${item.color}`}>{item.flag}</span>
              <div>
                <div className={`font-bold text-sm mb-1 ${item.color}`}>{item.label}</div>
                <p className="text-gray-300 text-xs">{item.meaning}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Arrow reference */}
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Arrows</h3>
        <div className="bg-gray-800/60 rounded border border-gray-700 divide-y divide-gray-700 mb-6">
          {ARROW_REFERENCE.map((item, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2">
              <span className="font-mono text-sm text-white w-12 shrink-0">{item.arrow}</span>
              <span className="text-gray-300 text-xs">{item.meaning}</span>
            </div>
          ))}
        </div>

        {/* Validated rules */}
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Validated Rules</h3>
        <div className="bg-gray-800/60 rounded border border-gray-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left px-3 py-2">Rule</th>
                <th className="text-left px-3 py-2 w-20">Accuracy</th>
                <th className="text-left px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {VALIDATED_RULES.map((rule, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0">
                  <td className="px-3 py-2 text-green-400 font-bold whitespace-nowrap">{rule.rule}</td>
                  <td className="px-3 py-2 text-yellow-400 font-mono">{rule.sessions}</td>
                  <td className="px-3 py-2 text-gray-300">{rule.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
