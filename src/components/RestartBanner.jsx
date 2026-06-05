export default function RestartBanner({ restarted, hasData, onDismiss }) {
  if (hasData) return null
  if (!restarted) return null

  return (
    <div className="border rounded p-3 mb-3 bg-amber-950 border-amber-500">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-amber-400">
          ⚠ Server restarted — data cleared
        </span>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-400 text-xs">
          ✕ Dismiss
        </button>
      </div>
      <p className="text-xs mt-1 text-amber-300">
        Railway redeployed and cleared session memory.
      </p>
      <div className="text-xs mt-1.5 text-gray-400">
        Open <span className="font-mono text-white">Tab 4 📐 Levels</span> → enter levels → Save → Score Now
      </div>
    </div>
  )
}
