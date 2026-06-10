export default function AlertBadge({ type, label, detail }) {
  const styles = {
    critical: {
      wrapper: 'border border-state-stop/60 bg-state-stopSoft',
      dot:     'bg-state-stop animate-pulse',
      label:   'text-state-stop font-bold',
      detail:  'text-state-stop/80',
    },
    watch: {
      wrapper: 'border border-state-cascadeWatch/60 bg-state-cascadeWatchSoft',
      dot:     'bg-state-cascadeWatch',
      label:   'text-state-cascadeWatch font-medium',
      detail:  'text-state-cascadeWatch/80',
    },
    info: {
      wrapper: 'border border-border-default/50 bg-bg-card2/30',
      dot:     'bg-text-tertiary',
      label:   'text-text-secondary',
      detail:  'text-text-tertiary',
    },
  }
  const s = styles[type] || styles.info
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${s.wrapper}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${s.dot}`} />
      <div className="min-w-0">
        <span className={`text-xs ${s.label}`}>{label}</span>
        {detail && <p className={`text-xs mt-0.5 ${s.detail}`}>{detail}</p>}
      </div>
    </div>
  )
}
