"use client"

import { offViewRoom } from "@/hooks/useTimelineView"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import { shortDate } from "@/lib/utils/date/dateWords"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where a bar lies once it is wholly out of view (V-256): a chip at that edge
 * of its row, the bar's nearest day beside an arrow, in danger ink when late,
 * that scrolls the timeline to the bar, as Linear's and Asana's do. Each chip
 * shows only while its bar is past its edge, by the scroller's variables
 * (offViewRoom), so a scroll draws nothing. The bar's own link is the way in
 * for a keyboard or a screen reader, so the chips are a pointer's.
 *
 * `left` and `right` are the bar's edges in px into the grid; `nameWidth` is
 * the sticky names column; `onGo` scrolls a day to a point across the view.
 */
export function OffViewChips({
  start,
  end,
  left,
  right,
  nameWidth,
  today,
  late,
  onGo,
}: {
  start: Date
  end: Date
  left: number
  right: number
  nameWidth: number
  today: Date
  late?: boolean
  onGo: (day: Date, at: number) => void
}) {
  const chip = (side: "before" | "after") => {
    const before = side === "before"
    const day = before ? end : start
    const Arrow = before ? ChevronLeft : ChevronRight
    return (
      <span className="sticky flex items-center overflow-hidden" style={before ? { left: nameWidth + 4, maxWidth: offViewRoom(side, right) } : { right: 8, maxWidth: offViewRoom(side, left) }}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          data-off-view={side}
          data-touch-target=""
          onClick={() => onGo(day, before ? 2 / 3 : 1 / 3)}
          className={cn(
            "pointer-events-auto flex h-6 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-sm border border-line bg-raised px-2 text-2xs font-[510] tabular-nums shadow-e1 transition-colors hover:bg-hover",
            !before && "flex-row-reverse",
            late ? "text-danger-ink" : "text-ink-2",
          )}
        >
          <Arrow aria-hidden className="size-3 shrink-0" />
          {shortDate(day, today)}
        </button>
      </span>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[6] flex justify-between">
      {chip("before")}
      {chip("after")}
    </div>
  )
}
