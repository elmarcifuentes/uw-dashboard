import { classMeta, conflictTag } from '../utils/classification'

// Shared scored-bias chip — the dominant action signal on every level rendering.
// Color = scored classification (signal-* = action), icon = Lucide. Optional confidence
// suffix. Optional inline conflict tag (structure-vs-bias + DP opposition) in NEUTRAL text,
// so the structural caveat is unmissable without competing with the action color.
export default function ClassificationChip({ classification, confidence, level = null, showConflict = true, size = 'sm' }) {
  const m    = classMeta(classification)
  const Icon = m.icon
  const px     = size === 'xs' ? 'px-1 py-0.5 text-[10px] gap-0.5' : 'px-1.5 py-0.5 text-xs gap-1'
  const iconSz = size === 'xs' ? 10 : 13
  const showConf = confidence && String(confidence).toLowerCase() !== 'none'
  const tag = showConflict && level ? conflictTag(level) : null

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center rounded font-bold ${px} ${m.bg} ${m.text}`}>
        <Icon size={iconSz} strokeWidth={2.5} />
        {m.label}
        {showConf && <span className="font-normal opacity-70 ml-0.5">{String(confidence).toUpperCase()}</span>}
      </span>
      {tag && (
        <span className="text-text-tertiary text-[10px] font-medium italic">{tag}</span>
      )}
    </span>
  )
}
