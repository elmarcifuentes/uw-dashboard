import { Magnet, ArrowUpToLine, ArrowDownToLine, Waves, Anchor } from 'lucide-react'

// GammaRail — Stage 1 gamma-magnet topography strip (display-only, additive).
//
// The price ladder is a card-stack with no price→pixel axis, so the gamma topography renders as its
// OWN self-scaled vertical strip in a gutter beside the ladder: price increases upward (high strike at
// top), matching the ladder's descending order. Built as a standalone, reusable component so later
// stages can mount it on other surfaces.
//
// Terrain = neutral slate, intensity-only (faint → bright = |gamma|). 0DTE loud (front), all-expiry
// quiet (~40%, behind), aligned strikes brightened. Magnet / call wall / put wall + the regime chip
// carry the cyan accent-gamma. NO flip line (net gamma is one-signed near spot — a zero-cross is noise).
// Values shown as QQQ strike + NQ for cross-checking against the UW dashboard.

const fmtM = (n) => {
  if (n == null) return '—'
  const m = n / 1e6
  return `${m >= 0 ? '+' : ''}${Math.round(m)}M`
}
const fmtNq = (nq) => (nq != null ? Math.round(nq).toLocaleString('en-US') : '—')

export default function GammaRail({ gamma, currentPrice, height = 520 }) {
  if (!gamma || !gamma.strikes?.length || !gamma.window) {
    return (
      <div className="flex flex-col items-center justify-center text-text-disabled text-xs" style={{ width: 150, height }}>
        <Waves size={16} className="mb-1 opacity-50" />
        <span>gamma…</span>
      </div>
    )
  }

  const { lo, hi } = gamma.window
  const span = Math.max(1, hi - lo)
  const step = height / span                       // px per $1 strike
  const y = (strike) => ((hi - strike) / span) * height
  const spot = currentPrice != null ? Number(currentPrice) : gamma.spot

  const markerStrikes = new Set([gamma.magnet?.strike, gamma.callWall?.strike, gamma.putWall?.strike].filter(v => v != null))

  // A labelled cyan marker line (magnet / call wall / put wall).
  const Marker = ({ strike, nq, icon: Icon, label, detail, emphatic }) => {
    if (strike == null) return null
    return (
      <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: y(strike), transform: 'translateY(-50%)' }}>
        <div className={`h-px flex-1 ${emphatic ? 'bg-accent-gamma' : 'bg-accent-gamma/60'}`} />
        <div className={`flex items-center gap-1 pl-1 ${emphatic ? 'text-accent-gamma' : 'text-accent-gamma/80'}`}>
          <Icon size={emphatic ? 13 : 11} />
          <div className="leading-tight">
            <div className={`font-price ${emphatic ? 'text-xs font-bold' : 'text-micro'}`}>{label} {strike}</div>
            <div className="text-micro text-text-muted font-price">NQ {fmtNq(nq)} · {detail}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1" style={{ width: 150 }}>
      <div className="text-micro text-text-muted uppercase tracking-wider flex items-center gap-1">
        <Magnet size={11} className="text-accent-gamma" /> Gamma
      </div>

      <div className="relative rounded-md bg-bg-subtle border border-border-subtle overflow-hidden" style={{ height }}>
        {/* Terrain bands — neutral slate intensity. all-expiry (quiet) behind, 0DTE (loud) in front. */}
        {gamma.strikes.map((s) => {
          const top = y(s.strike) - step / 2
          const bandH = Math.max(1.5, step - 0.5)
          const isMarker = markerStrikes.has(s.strike)
          return (
            <div key={s.strike} title={`${s.strike}  ·  NQ ${fmtNq(s.nq)}  ·  0DTE ${fmtM(s.net0dte)}  ·  all-exp ${fmtM(s.netAll)}`}>
              {/* all-expiry — quiet, capped low opacity */}
              {s.intensityAll > 0.02 && (
                <div className="absolute left-0 bg-text-tertiary" style={{ top, height: bandH, width: '38%', opacity: 0.1 + 0.4 * s.intensityAll }} />
              )}
              {/* 0DTE — loud, full intensity; aligned strikes get a cyan tint + brighter floor */}
              <div
                className={`absolute right-0 ${s.aligned ? 'bg-accent-gamma' : 'bg-text-primary'}`}
                style={{ top, height: bandH, width: '62%', opacity: (s.aligned ? 0.35 : 0.12) + 0.85 * s.intensity0dte }}
              />
              {/* hover/exact-value hit target spanning the row */}
              <div className="absolute left-0 right-0 cursor-help" style={{ top, height: bandH }} />
            </div>
          )
        })}

        {/* Live price line — yellow accent-price (the "now"), distinct from gamma cyan */}
        {spot != null && spot >= lo && spot <= hi && (
          <div className="absolute left-0 right-0 flex items-center" style={{ top: y(spot), transform: 'translateY(-50%)' }}>
            <div className="h-px flex-1 bg-accent-price/70" />
            <span className="text-micro text-accent-price font-price pl-0.5">{Math.round(spot)}</span>
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
          <span className="text-micro text-text-muted font-price ml-auto">{fmtM(gamma.regime.netGamma)}</span>
        </div>
      )}
    </div>
  )
}
