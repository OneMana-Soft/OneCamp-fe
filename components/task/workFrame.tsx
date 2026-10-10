import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Input } from "@/components/ui/input"
import { Search } from "@/lib/icons"

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
 * The toolbar row: there from the first paint on every tab, with 32px (h-8)
 * controls, so the body under it starts at the same height on every tab.
 * It wraps only when a narrow window can't hold a tab's controls.
 */
export const workToolbar = "flex min-h-8 shrink-0 flex-wrap items-center gap-2"

/** The body: 16px under the toolbar on every tab. */
export const workBody = "mt-4"

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
 * A search in a toolbar row: a 32px field with its magnifier, the height of
 * the controls beside it. SearchField is a list's own row (52px with its
 * padding), which made a toolbar that held it taller than its neighbours'.
 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={cn("relative w-56", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="h-8 pl-8" />
    </div>
  )
}
