export default function ThreeColLayout({
  where,
  why,
  what,
  secondary,
  whereWidth = 'lg:w-[32%]',
  whyWidth   = 'lg:w-[32%]',
  whatWidth  = 'lg:w-[36%]',
}) {
  return (
    <div className="py-3 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3 items-start">
        <div className={`w-full ${whereWidth} space-y-3 shrink-0`}>
          {where}
        </div>
        <div className={`w-full ${whyWidth} space-y-3 shrink-0`}>
          {why}
        </div>
        <div className={`w-full ${whatWidth} space-y-3`}>
          {what}
        </div>
      </div>
      {secondary && (
        <div className="space-y-3">
          {secondary}
        </div>
      )}
    </div>
  )
}
