import { Magnet, ArrowUpToLine, ArrowDownToLine, Waves, Anchor } from 'lucide-react'

// GammaRail — full near-spot gamma topography strip. Used by the EXPAND panel (analysis view): all
// ~55 strikes rendered as a self-scaled price→Y terrain (intensity = |γ|). The collapsed trading view
// no longer uses this — gamma's key levels are woven into the ladder card stack (GammaLevelRow). Kept
// as the reusable terrain renderer for the expand panel and later surfaces.
//
// Terrain = neutral slate, intensity-only. 0DTE loud (front), all-expiry quiet ~40% (behind), aligned
// strikes brightened. Magnet / call wall / put wall markers + regime chip in cyan accent-gamma; marker
// labels sit on a dark chip so they stay readable over any terrain. No flip line (net γ one-signed).

const fmtM = (n) => {
  if (n == null) return '—'
  const m = n / 1e6
  return `${m >= 0 ? '+' : ''}${Math.round(m)}M`
}
const fmtNq = (nq) => (nq != null ? Math.round(nq).toLocaleString('en-US') : '—')

export default function GammaRail({ gamma, currentPrice, nqRatio, activeSymbol = 'NQ', height = 520, width = 320 }) {
  const isNQ = activeSymbol === 'NQ'
  if (!gamma || !gamma.strikes?.length || !gamma.window) {
    return (
      <div className="flex flex-col items-center justify-center text-text-tertiary text-xs" style={{ width, height }}>
        <Waves size={16} className="mb-1 opacity-60" />
        <span>gamma…</span>
      </div>
    )
  }

  const { lo, hi } = gamma.window
  const span = Math.max(1, hi - lo)
  const step = height / span
  const y = (strike) => ((hi - strike) / span) * height
  const spot = currentPrice != null ? Number(currentPrice) : gamma.spot

  const markerStrikes = new Set([gamma.magnet?.strike, gamma.callWall?.strike, gamma.putWall?.strike].filter(v => v != null))

  // A labelled cyan marker line. Label rides a dark chip for guaranteed contrast over the terrain.
  // Primary price follows the active-symbol toggle; the detail line keeps the OTHER price for cross-ref.
  const Marker = ({ strike, nq, icon: Icon, label, detail, emphatic }) => {
    if (strike == null) return null
    const primary = isNQ ? `NQ ${fmtNq(nq)}` : `${strike}`
    const other   = isNQ ? `${strike}` : `NQ ${fmtNq(nq)}`
    return (
      <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: y(strike), transform: 'translateY(-50%)' }}>
        <div className="h-px flex-1 bg-accent-gamma" />
        <div className="flex items-center gap-1 pl-1 pr-1 py-0.5 rounded bg-bg-base/85 text-accent-gamma">
          <Icon size={emphatic ? 14 : 12} />
          <div className="leading-tight">
            <div className={`font-price ${emphatic ? 'text-xs font-bold' : 'text-micro font-semibold'}`}>{label} {primary}</div>
            <div className="text-micro text-text-secondary font-price">{other} · {detail}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <div className="text-micro text-text-tertiary uppercase tracking-wider flex items-center gap-1">
        <Magnet size={11} className="text-accent-gamma" /> Gamma terrain
      </div>

      <div className="relative rounded-md bg-bg-subtle border border-border-default overflow-hidden" style={{ height }}>
        {/* Terrain bands — neutral slate intensity. all-expiry (quiet) behind, 0DTE (loud) in front. */}
        {gamma.strikes.map((s) => {
          const top = y(s.strike) - step / 2
          const bandH = Math.max(1.5, step - 0.5)
          return (
            <div key={s.strike} title={`${s.strike}  ·  NQ ${fmtNq(s.nq)}  ·  0DTE ${fmtM(s.net0dte)}  ·  all-exp ${fmtM(s.netAll)}`} className="cursor-help">
              {s.intensityAll > 0.02 && (
                <div className="absolute left-0 bg-text-tertiary" style={{ top, height: bandH, width: '32%', opacity: 0.12 + 0.4 * s.intensityAll }} />
              )}
              <div
                className={`absolute right-0 ${s.aligned ? 'bg-accent-gamma' : 'bg-text-primary'}`}
                style={{ top, height: bandH, width: '68%', opacity: (s.aligned ? 0.35 : 0.14) + 0.85 * s.intensity0dte }}
              />
              <div className="absolute left-0 right-0" style={{ top, height: bandH }} />
            </div>
          )
        })}

        {/* Live price line — yellow accent-price (the "now"), distinct from gamma cyan */}
        {spot != null && spot >= lo && spot <= hi && (
          <div className="absolute left-0 right-0 flex items-center" style={{ top: y(spot), transform: 'translateY(-50%)' }}>
            <div className="h-px flex-1 bg-accent-price" />
            <span className="text-micro text-accent-price font-price pl-0.5 pr-1 rounded bg-bg-base/85">
              {isNQ && nqRatio ? (Math.round(spot * nqRatio * 4) / 4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : spot.toFixed(2)}
            </span>
          </div>
        )}

        {/* Markers */}
        <Marker strike={gamma.putWall?.strike}  nq={gamma.putWall?.nq}  icon={ArrowDownToLine} label="PW" detail={fmtM(gamma.putWall?.putGamma)} />
        <Marker strike={gamma.callWall?.strike} nq={gamma.callWall?.nq} icon={ArrowUpToLine}   label="CW" detail={fmtM(gamma.callWall?.callGamma)} />
        <Marker strike={gamma.magnet?.strike}   nq={gamma.magnet?.nq}   icon={Magnet} label="MAGNET" detail={fmtM(gamma.magnet?.netGamma)} emphatic />
      </div>

      {/* Regime chip — aggregate net-gamma sign (the honest regime read; no flip line in Stage 1) */}
      {gamma.regime && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-accent-gamma/30 bg-accent-gamma/5 text-accent-gamma">
          {gamma.regime.sign === 'expansion' ? <Waves size={12} /> : <Anchor size={12} />}
          <span className="text-micro font-bold uppercase tracking-wide">{gamma.regime.label}</span>
          <span className="text-micro text-text-tertiary font-price ml-auto">{fmtM(gamma.regime.netGamma)}</span>
        </div>
      )}
    </div>
  )
}
