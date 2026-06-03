const TRIGGER_COLORS = {
  'price near':    'text-amber-400',
  'price moved':   'text-blue-400',
  'time-based':    'text-gray-400',
  'cascade':       'text-red-400',
  'manual':        'text-teal-400',
  'initial':       'text-gray-600',
  'update':        'text-gray-500',
  'overnight-prep':'text-gray-500',
  'auto-rescore':  'text-gray-500',
}

const TRIGGER_DESCRIPTIONS = {
  'price near':    'Price tested a key level',
  'price moved':   'Price moved significantly from last read',
  'time-based':    'Scheduled refresh (15-min interval)',
  'cascade':       'Cascade conditions changed',
  'manual':        'Manually triggered from dashboard',
  'initial':       'Dashboard connected — loaded last known data',
  'update':        'Scoring engine posted new data',
  'overnight-prep':'Overnight preparation run',
  'auto-rescore':  'Auto-rescore from polling engine',
}

function triggerColor(trigger) {
  const t = (trigger || '').toLowerCase()
  for (const [key, color] of Object.entries(TRIGGER_COLORS)) {
    if (t.includes(key)) return color
  }
  return 'text-gray-400'
}

function friendlyTrigger(trigger) {
  const t = (trigger || '').toLowerCase()
  for (const [key, desc] of Object.entries(TRIGGER_DESCRIPTIONS)) {
    if (t.includes(key)) return desc
  }
  return trigger || '—'
}

export default function RescoreLog({ history, compact }) {
  const rescores = history.filter(e => e.type === 'rescore')

  return (
    <div className={`overflow-y-auto ${compact ? 'h-64' : 'h-96'}`}>
      {rescores.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
          No rescores yet this session
        </div>
      ) : (
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0 bg-[#0D1B2A]">
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1.5 pr-3 font-normal">Time</th>
              <th className="text-left py-1.5 pr-3 font-normal">Trigger</th>
              <th className="text-left py-1.5 pr-3 font-normal">Price</th>
              <th className="text-left py-1.5 font-normal">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {rescores.map((event, i) => {
              const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
              })
              const cascade  = event.result?.cascade?.active
              const brk      = event.result?.structure_break?.active
              const nqRatio  = event.result?.nq_ratio ? Number(event.result.nq_ratio) : null
              const nqPrice  = nqRatio && event.price != null ? Math.round(Number(event.price) * nqRatio).toLocaleString() : null
              return (
                <tr key={i} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                  <td className="py-1 pr-3 text-gray-500">{time}</td>
                  <td title={event.trigger || ''} className={`py-1 pr-3 cursor-help ${triggerColor(event.trigger)}`}>
                    {friendlyTrigger(event.trigger)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    <div className="text-white">{event.price != null ? `$${Number(event.price).toFixed(2)}` : '—'}</div>
                    {nqPrice && <div className="text-gray-400 text-xs">NQ {nqPrice}</div>}
                  </td>
                  <td className="py-1 space-x-1">
                    {cascade && <span className="text-red-400">⚠ CASCADE</span>}
                    {brk     && <span className="text-amber-400">⚠ BREAK</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
