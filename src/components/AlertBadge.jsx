export default function AlertBadge({ type, label, detail }) {
  const styles = {
    critical: {
      wrapper: 'border border-red-700 bg-red-950/40',
      dot:     'bg-red-500 animate-pulse',
      label:   'text-red-400 font-bold',
      detail:  'text-red-300',
    },
    watch: {
      wrapper: 'border border-amber-700/60 bg-amber-950/20',
      dot:     'bg-amber-500',
      label:   'text-amber-400 font-medium',
      detail:  'text-amber-300/80',
    },
    info: {
      wrapper: 'border border-gray-700/50 bg-gray-900/30',
      dot:     'bg-gray-500',
      label:   'text-gray-400',
      detail:  'text-gray-500',
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
