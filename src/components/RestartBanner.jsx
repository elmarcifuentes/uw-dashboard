export default function RestartBanner({ restarted, hasData, onDismiss }) {
  if (!restarted && hasData) return null

  return (
    <div className={`border rounded p-3 mb-3 ${
      restarted
        ? 'bg-amber-950 border-amber-500'
        : 'bg-gray-800 border-gray-600'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`font-bold text-sm ${restarted ? 'text-amber-400' : 'text-gray-400'}`}>
          {restarted ? '⚠ Server restarted — data cleared' : 'No session data loaded'}
        </span>
        {restarted && (
          <button onClick={onDismiss} className="text-amber-600 hover:text-amber-400 text-xs">
            ✕ Dismiss
          </button>
        )}
      </div>
      <p className={`text-xs mt-1 ${restarted ? 'text-amber-300' : 'text-gray-500'}`}>
        {restarted
          ? 'Railway redeployed and cleared session memory.'
          : 'Dashboard has no scoring data yet.'}{' '}
        Run <span className="font-mono text-white">/levels-nq R2 R1 MID S1 S2</span> to restore.
      </p>
      <div className="text-xs mt-1.5 text-gray-600">
        or <span className="font-mono">npm start</span> if levels haven't changed
      </div>
    </div>
  )
}
