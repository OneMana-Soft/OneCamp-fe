import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The frame every tab of a task view draws in: a project's List, Board,
 * Timeline, Updates and Attachments, and My Tasks' List and Board. The model
 * is Activity's feed frame (components/activity/activityFeedFrame).
 *
 * WHY ONE FRAME. Each tab built its own, so switching tabs moved everything:
 *   - the toolbar was 36px on List (its filter field lost its h-8 to the
 *     Input's md:h-9), 32px on Board and 34px on Timeline (a segmented zoom),
 *     with 16, 16 and 12px under it, so the first row started at 302, 298 and
 *     296;
 *   - Updates had no toolbar, and centred its column 180px to the right at
 *     1440, with its "Write an update" card arriving after the updates and
 *     pushing them down 74px;
 *   - Attachments was the task panel's linked-items section dropped in a p-4
 *     box, 16px down and in from every other tab;
 *   - List and Board said nothing when their load failed (List said "No tasks
 *     yet"), and Board had no loading or empty state at all.
 * Here the toolbar row, the gap under it and the place an empty or failed tab
 * says so are drawn once. A tab hands over its controls, its rows and its
 * words.
 */

/**
 * The toolbar band (design v3, work.md W10): 44 px with a hairline under it,
 * 16 px in from the sheet's edges, flush under the tabs on every tab, with
 * 28 px controls. The List, Board, Timeline and Files tabs and My Tasks' two
 * all draw it, so a tab switch moves nothing: on 11 Oct the Board's controls
 * sat 6 px lower than the List's with no hairline, and the Files' 18 px lower
 * at 32 px, inset 24 px. It wraps only when a narrow window can't hold a tab's
 * controls, growing by its 8 px padding.
 */
export const workToolbar = "flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-2"

/**
 * Where an empty or failed tab says so, in place of its rows: under the
 * toolbar, centred across the body, at the top of it. Give it an EmptyState or
 * an ErrorState with their own padding, which is what places them, so every
 * tab's state lands at the same height.
 */
export function WorkState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-work-state="" className={cn("flex justify-center", className)}>
      {children}
    </div>
  )
}

/**
 * Each work view's rows, as its loading rows draw them: how many, the row's
 * height and inset at a desk and on a phone, the tile it leads with (round
 * for a goal's ring, as Skeleton's circle), the widths of its name and its
 * bar, the header row above them at a desk (its classes, or none), whether a
 * summary line ("3 cycles running") sits above everything, and whether a
 * phone row is two lines over a full-width bar. They are the real rows' (the projects table's, RunningCycles' and
 * GoalsView's), so the rows land where the placeholder stood.
 */
const ROWS = {
  projects: { label: "Loading projects", count: 5, desk: "h-[52px] px-6", phone: "h-[72px]", deskTile: "size-5 rounded-[6px]", phoneTile: "size-7 rounded-lg", name: "w-1/4", bar: "w-1/6", header: "h-8 border-b", summary: false, twoLine: false, round: false },
  cycles: { label: "Loading cycles", count: 4, desk: "h-[56px] px-6", phone: "min-h-[72px] py-2.5", deskTile: "size-5 rounded-[6px]", phoneTile: "size-7 rounded-lg", name: "w-1/4", bar: "w-1/6", header: "h-8 border-y", summary: true, twoLine: true, round: false },
  goals: { label: "Loading goals", count: 5, desk: "h-14 px-6", phone: "h-16", deskTile: "size-7", phoneTile: "size-8", name: "w-1/3", bar: "w-40", header: "h-8 border-b", summary: false, twoLine: false, round: true },
} as const

/**
 * Where a work view's rows will be while they're read, or while the view's
 * own chunk is on its way: its rows at their height, each a tile, a name and
 * a bar, under the table's header row at a desk when it has one. A screen
 * reader hears the label, not the grey boxes. (SkeletonRows is a panel's
 * short list: no row height, no hairlines.)
 */
export function WorkRowsLoading({ kind, compact }: { kind: keyof typeof ROWS; compact?: boolean }) {
  const rows = ROWS[kind]
  return (
    <div role="status" aria-label={rows.label}>
      {rows.summary && (
        <div aria-hidden="true" className={cn("py-3 text-xs", !compact && "px-6")}>
          <span className="flex h-[1lh] items-center">
            <Skeleton className="h-3 w-40" />
          </span>
        </div>
      )}
      {rows.header && !compact && <div aria-hidden="true" className={cn(rows.header, "border-line")} />}
      {Array.from({ length: rows.count }, (_, i) =>
        compact && rows.twoLine ? (
          <div key={i} aria-hidden="true" className={cn("flex items-center gap-3 border-b border-line", rows.phone)}>
            <Skeleton className={cn("shrink-0", rows.phoneTile)} />
            <span className="min-w-0 flex-1">
              <span className="flex h-[1lh] items-center text-sm">
                <Skeleton className={cn("h-3.5", rows.name)} />
              </span>
              <span className="flex h-[1lh] items-center text-xs">
                <Skeleton className="h-3 w-1/2" />
              </span>
              {/* Bar's own box (components/ui/progress): inline in its line, so the row is the real row's height. */}
              <Skeleton className="mt-1.5 inline-block h-1 w-full align-middle" />
            </span>
          </div>
        ) : (
          <div key={i} aria-hidden="true" className={cn("flex items-center gap-3 border-b border-line", compact ? rows.phone : rows.desk)}>
            <Skeleton variant={rows.round ? "circle" : undefined} className={cn("shrink-0", compact ? rows.phoneTile : rows.deskTile)} />
            <Skeleton className={cn("h-3.5", rows.name)} />
            <Skeleton className={cn("ml-auto h-1.5", rows.bar)} />
          </div>
        ),
      )}
    </div>
  )
}
