import * as React from "react"
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
