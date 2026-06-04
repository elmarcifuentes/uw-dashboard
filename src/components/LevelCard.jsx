import SignalBadge from './SignalBadge'
import DpBar from './DpBar'
import GexBar from './GexBar'
import { dpConditionLabel, midDpWarning } from '../utils/dpLabels'

const LEVEL_DESCRIPTIONS = {
  buy_support:     'Institutional buying below this level — price expected to be drawn upward',
  sell_resistance: 'Institutional supply above this level — price expected to struggle or reject',
  no_edge:         'Insufficient signal — no directional read at this level',
  mid:             'Midpoint — watching for dark pool direction to develop',
}

const CONFIDENCE_TOOLTIPS = {
  high:   'High: Score ≥70, flow ≥8 matches — two signals agree — full conviction',
  medium: 'Medium: Score 65–69, flow ≥4 matches — one strong signal confirmed',
  low:    'Low: Score ≥65, flow <4 matches — sparse data, use caution',
  none:   'None: Score below threshold — no actionable read',
}

const FLAG_TOOLTIPS = {
  full_stack: 'FULL STACK ★: Resistance magnet + High confidence + ETF confirmed — maximum conviction. Never fade on first approach.',
  conflict:   'CONFLICT ⚠: Level type contradicts classification — this IS the resistance magnet pattern. 16/16 sessions confirmed.',
  boundary:   'BOUNDARY ⚡: Score exactly 65 — minimum threshold. Verify: dark pool ≥ +0.700 AND flow ≥ 4 matches before trading.',
  lower_high: 'LOWER HIGH ↙: Second approach below prior touch — momentum exhausting. Tighten stop, reduce size.',
}

const BORDER_COLOR = {
  buy_support:     '#1A7A4A',
  sell_resistance: '#C0392B',
  no_edge:         '#6B7280',
  mid:             '#1B8CA6',
}

const CLASS_LABEL = {
  buy_support:     'BUY SUP',
  sell_resistance: 'SELL RES',
  no_edge:         'NO EDGE',
  mid:             'MID',
}

const CLASS_COLOR = {
  buy_support:     'text-green-400',
  sell_resistance: 'text-red-400',
  no_edge:         'text-gray-400',
  mid:             'text-cyan-400',
}

const CONFIDENCE_STYLE = {
  high:   'bg-green-600 text-white',
  medium: 'bg-amber-500 text-black',
  low:    'border border-red-500 text-red-400',
  none:   'border border-gray-500 text-gray-400',
}

const ETF_ARROW = {
  bullish: '↑',
  bearish: '↓',
  neutral: '—',
  'no data': '?',
}

const formatTime = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/New_York',
  }) + ' ET'
}

export default function LevelCard({ level, sessionMaxGex, nqRatio, dpHistory = [], scoredAt }) {
  const classKey    = level.classification === 'mid' ? 'mid' : level.classification
  const borderColor = BORDER_COLOR[classKey] || '#6B7280'
  const nqPrice  = nqRatio ? Math.round(level.price * nqRatio).toLocaleString() : '—'
  const etfArrow = ETF_ARROW[level.etf_direction] || '—'
  const confStyle = CONFIDENCE_STYLE[level.confidence] || CONFIDENCE_STYLE.none

  const targetLevel  = level.passive_target_from
  const targetPrice  = targetLevel ? null : null
  const dpCondition  = dpConditionLabel(level.dark_pool, level.type, level.classification)
  const midWarning   = level.id === 'MID' ? midDpWarning(level.dark_pool) : { show: false }

  return (
    <div style={{ borderColor }} className="rounded border bg-gray-900/60 p-3 space-y-2">
      {/* Row 1: Level ID + prices */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-white w-10">{level.id}</span>
          <span className="text-sm font-medium text-white">${level.price?.toFixed(2) ?? '—'}</span>
          <span className="text-sm font-medium text-gray-400">/ NQ {nqPrice}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {level.full_stack  && <span title={FLAG_TOOLTIPS.full_stack}  className="cursor-help"><SignalBadge type="full_stack" /></span>}
          {level.conflict    && !level.full_stack && <span title={FLAG_TOOLTIPS.conflict} className="cursor-help"><SignalBadge type="conflict" /></span>}
          {level.boundary    && <span title={FLAG_TOOLTIPS.boundary}    className="cursor-help"><SignalBadge type="boundary" /></span>}
          {level.lower_high  && <span title={FLAG_TOOLTIPS.lower_high}  className="cursor-help"><SignalBadge type="lower_high" /></span>}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 italic leading-snug">
        {LEVEL_DESCRIPTIONS[classKey]}
      </p>

      {/* Row 2: Classification + score + confidence */}
      <div className="flex items-center gap-2 text-xs">
        <span className={`font-bold ${CLASS_COLOR[classKey] || 'text-gray-400'}`}>
          {CLASS_LABEL[classKey] || level.classification}
        </span>
        <span className="text-gray-300 font-medium">{level.score}</span>
        <span
          title={CONFIDENCE_TOOLTIPS[level.confidence] || ''}
          className={`px-1.5 py-0.5 rounded text-xs font-bold cursor-help ${confStyle}`}
        >
          {(level.confidence || 'none').toUpperCase()}
        </span>
      </div>

      {/* Row 3: DP bar + ETF + GEX */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-6">DP</span>
          <div className="flex-1">
            <DpBar value={level.dark_pool} />
          </div>
          <span className="text-xs text-gray-300 w-14 text-right">
            {typeof level.dark_pool === 'number' ? level.dark_pool.toFixed(3) : '—'}
          </span>
          <span className={`text-sm w-4 ${level.etf_direction === 'bullish' ? 'text-green-400' : level.etf_direction === 'bearish' ? 'text-red-400' : 'text-gray-500'}`}>
            {etfArrow}
          </span>
        </div>
        {level.last_dp_print && (() => {
          const ts      = new Date(level.last_dp_print)
          const timeStr = ts.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'America/New_York',
          }) + ' ET'
          const isRecent = (Date.now() - ts.getTime()) < 2 * 60 * 60 * 1000
          return (
            <div className="flex items-center gap-1 pl-8">
              <span className="text-gray-600 text-xs">Last print:</span>
              <span className={`text-xs font-mono ${isRecent ? 'text-gray-400' : 'text-gray-600'}`}>
                {timeStr}
              </span>
            </div>
          )
        })()}
        {dpHistory.length >= 2 && (() => {
          const last  = dpHistory[dpHistory.length - 1].value
          const prev  = dpHistory[dpHistory.length - 2].value
          const diff  = last - prev
          const trend = Math.abs(diff) < 0.050 ? 'stable' : diff < 0 ? 'declining' : 'improving'
          return (
            <div className="flex items-center gap-1 pl-8 flex-wrap">
              <div className="flex items-center gap-0.5 text-xs font-mono">
                {dpHistory.map((h, i) => (
                  <span key={i}>
                    <span className={
                      h.value <= -0.700 ? 'text-red-400' :
                      h.value <= -0.300 ? 'text-amber-400' :
                      h.value >= 0.300  ? 'text-green-400' :
                      'text-gray-500'
                    }>{h.value.toFixed(2)}</span>
                    {i < dpHistory.length - 1 && <span className="text-gray-700"> → </span>}
                  </span>
                ))}
              </div>
              <span className={`text-xs font-bold ${
                trend === 'declining' ? 'text-red-400' : trend === 'improving' ? 'text-green-400' : 'text-gray-500'
              }`}>{trend === 'declining' ? '↓' : trend === 'improving' ? '↑' : '→'}</span>
            </div>
          )
        })()}
        {/* DP condition label */}
        <div className={`rounded px-2 py-1 ${dpCondition.bg}`}>
          <div className={`text-xs font-bold ${dpCondition.color}`}>{dpCondition.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{dpCondition.sublabel}</div>
          {midWarning.show && (
            <div className={`text-xs font-bold mt-0.5 ${midWarning.color}`}>⚠ {midWarning.text}</div>
          )}
        </div>
        {(() => {
          const netGex = level.net_gex ?? level.gex?.net_gex
          if (netGex == null) return null
          const isExp = netGex < 0
          return (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-6">GEX</span>
              <GexBar value={netGex} sessionMax={sessionMaxGex} />
              <span className={`text-xs font-mono ${isExp ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                {isExp ? '⚠ EXPANSION' : 'pinning'} {(netGex / 1000).toFixed(0)}K
              </span>
            </div>
          )
        })()}
      </div>

      {/* Row 4: Passive target */}
      {level.passive_target && level.passive_target_from && (
        <div className={`text-xs font-medium flex items-center gap-1 ${level.classification === 'buy_support' ? 'text-green-400' : 'text-red-400'}`}>
          <span>→ TARGET {level.passive_target_from}</span>
          {level._target_delta !== undefined && level._target_delta !== null && (
            <>
              <span className="text-white font-mono">
                {level._target_delta >= 0 ? '+' : ''}{level._target_delta?.toFixed(2) ?? '—'}
              </span>
              {nqRatio && (
                <span className="text-gray-400 font-mono">
                  / {level._target_delta >= 0 ? '+' : '-'}{Math.round(Math.abs(level._target_delta) * nqRatio)} NQ
                </span>
              )}
            </>
          )}
        </div>
      )}
      {scoredAt && (
        <div className="flex justify-end mt-1">
          <span className="text-gray-600 text-xs font-mono">{formatTime(scoredAt)}</span>
        </div>
      )}
    </div>
  )
}
