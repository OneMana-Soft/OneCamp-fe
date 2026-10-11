import { cn } from "@/lib/utils/helpers/cn"

/**
 * A sidebar's skeleton (design v3, shell mock M1, "Loading"): section labels
 * 64px wide and 30px rows, a tile or an avatar disc and a bar, at the widths
 * the real names run to. The press fill, breathing (.sk).
 */
export function SidebarSkeleton({ className }: { className?: string }) {
  const section = <div className="sk mx-2 mb-2.5 mt-3.5 h-2.5 w-16" />
  const row = (w: string, avatar = false) => (
    <div className="flex h-[30px] items-center gap-2.5 px-2">
      <div className={cn("sk shrink-0", avatar ? "size-5 rounded-full" : "size-4")} />
      <div className="sk h-2.5" style={{ width: w }} />
    </div>
  )
  return (
    <div aria-hidden="true" data-sidebar-skeleton="" className={cn("flex flex-col", className)}>
      {section}
      {row("62%")}
      {row("48%")}
      {row("70%")}
      {section}
      {row("54%", true)}
      {row("40%", true)}
    </div>
  )
}

/**
 * The page's skeleton inside the sheet (shell §L2): the 52px header with a
 * title bar 40% wide, then rows at the real height of what loads there.
 */
export function SheetSkeleton({
  rows = 8,
  rowHeight = 40,
  kind = "list",
  className,
}: {
  rows?: number
  /** The real row height: 40 for a list row, 30 for a sidebar row. */
  rowHeight?: number
  /** "list" rows with a 16px glyph; "message" rows with a 36px avatar disc; "grid" cards. */
  kind?: "list" | "message" | "grid"
  className?: string
}) {
  const widths = ["58%", "72%", "46%", "64%", "38%", "70%", "52%", "60%", "44%", "66%"]
  return (
    <div role="status" aria-label="Loading" data-sheet-skeleton="" className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex h-[52px] shrink-0 items-center border-b border-line px-5">
        <div className="sk h-[18px] w-[40%] max-w-[360px] rounded-md" />
      </div>
      {kind === "grid" ? (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
            <div key={i} className="sk h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col py-2">
          {Array.from({ length: rows }, (_, i) =>
            kind === "message" ? (
              <div key={i} className="flex gap-3 px-5 py-1.5">
                <div className="sk size-9 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                  <div className="sk h-2.5 w-28" />
                  <div className="sk h-2.5" style={{ width: widths[i % widths.length] }} />
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-center gap-2.5 border-b border-line px-5" style={{ height: rowHeight }}>
                <div className="sk size-4 shrink-0" />
                <div className="sk h-2.5" style={{ width: widths[i % widths.length] }} />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The whole shell, before anything in it has arrived: the frame with a
 * sidebar's skeleton, and an empty sheet on it (shell §L1, the step between the
 * splash and the real shell). On a phone, only the sheet.
 */
export function SkeletonShell() {
  return (
    <div data-skeleton-shell="" className="app-frame flex h-dvh overflow-hidden">
      <div className="hidden w-[248px] shrink-0 flex-col px-2 pb-2 pt-2.5 md:flex">
        <div className="flex h-10 items-center gap-2.5 px-1.5">
          <div className="sk size-[26px] rounded-md" />
          <div className="sk h-2.5 w-24" />
        </div>
        <div className="sk mt-2 h-8 rounded-md" />
        <SidebarSkeleton className="mt-1" />
      </div>
      <div className="app-sheet m-0 flex-1 md:my-2 md:mr-2">
        <SheetSkeleton rows={0} />
      </div>
    </div>
  )
}
