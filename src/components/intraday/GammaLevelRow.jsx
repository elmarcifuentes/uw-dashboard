import { Magnet, ArrowUpToLine, ArrowDownToLine, Circle } from 'lucide-react'

// GammaLevelRow — a single gamma reference level woven INTO the price-ladder card stack at its
// price-sort position. Visually distinct from PR cards (thin, cyan accent-gamma, no card chrome) so
// it reads as a reference line among the cards, not a card itself. Magnet emphatic; walls labelled;
// QQQ strike + NQ value + a magnitude bar so relative pull strength is legible at a glance.

const fmtM = (n) => (n == null ? '—' : `${n / 1e6 >= 0 ? '+' : ''}${Math.round(n / 1e6)}M`)
const fmtNq = (nq) => (nq != null ? Math.round(nq).toLocaleString('en-US') : '—')

const ROLE = {
  magnet:   { icon: Magnet,          label: 'MAGNET' },
  callWall: { icon: ArrowUpToLine,   label: 'CALL WALL' },
  putWall:  { icon: ArrowDownToLine, label: 'PUT WALL' },
  strike:   { icon: Circle,          label: 'γ' },
}

export default function GammaLevelRow({ item, activeSymbol = 'NQ' }) {
  const meta = ROLE[item.role] || ROLE.strike
  const Icon = meta.icon
  const emphatic = item.role === 'magnet'
  // Primary price follows the active-symbol toggle (like the PR cards); hover keeps both for cross-ref.
  const priceStr = activeSymbol === 'NQ' ? `NQ ${fmtNq(item.nq)}` : `${item.strike}`

  return (
    <div
      title={`${meta.label} ${item.strike} · NQ ${fmtNq(item.nq)} · ${fmtM(item.value)}`}
      className={`flex items-center gap-2 pl-2 pr-3 py-1 rounded ${emphatic ? 'bg-accent-gamma/10 border border-accent-gamma/30' : ''}`}
    >
      {/* connector tick into the stack */}
      <div className="h-px w-3 bg-accent-gamma/50 shrink-0" />
      <Icon size={emphatic ? 14 : 12} className="text-accent-gamma shrink-0" />
      <span className={`font-price text-accent-gamma shrink-0 ${emphatic ? 'text-sm font-bold' : 'text-xs font-semibold'}`}>
        {meta.label}
      </span>
      <span className={`font-price text-text-secondary shrink-0 ${emphatic ? 'text-sm font-bold' : 'text-xs'}`}>{priceStr}</span>
      {/* magnitude bar — relative pull strength */}
      <div className="flex-1 h-1 bg-bg-elevated rounded overflow-hidden min-w-[16px]">
        <div className="h-full bg-accent-gamma" style={{ width: `${Math.max(4, Math.round(item.intensity * 100))}%`, opacity: emphatic ? 1 : 0.7 }} />
      </div>
      <span className="font-price text-xs text-text-tertiary shrink-0 w-12 text-right tabular-nums">{fmtM(item.value)}</span>
    </div>
  )
}
