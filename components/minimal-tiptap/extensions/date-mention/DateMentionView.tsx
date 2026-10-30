"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { CHIP_TONE } from "@/lib/ui/chipTone"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { Bell } from "@/lib/icons"
import { isoDate } from "@/lib/codec/connectedValues"
import { useToday } from "@/lib/liveEntity/today"
import { dateLabel, dayTone } from "@/lib/liveEntity/dates"
import { fullDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"

// The picker's code can't come (no network): it says so, as every lazy overlay does, and closes; the next open asks again.
function PickerUnavailable({ onClose }: { onClose: () => void }) {
  return <OverlayUnavailable title="Couldn't open the date picker" onClose={onClose} />
}
const DatePopover = lazyPiece(() => import("./DatePopover"), { failed: PickerUnavailable })

/**
 * A date in a line, as it reads today (D5): "Today", "Tomorrow", "Yesterday",
 * else "12 Oct". A reminder wears a bell, and turns sun on its day and danger
 * once it has gone by, as Later's pill does (D6). Clicking it, or Enter on
 * it, opens the day: its reminder, and for whoever may edit, another day.
 */
export function DateMentionView({ node, selected, editor, getPos, updateAttributes }: NodeViewProps) {
  const today = useToday()
  // A guest has no Later and can't change the doc: the day is all there is.
  const guest = useGuestReader()
  const [open, setOpen] = React.useState<HTMLElement | null>(null)
  // A day on the calendar, or none: one that isn't (written by an old client) reads "Date".
  const date = isoDate(node.attrs.date)
  const reminder: string = node.attrs.reminder || ""
  const tone = date && reminder ? dayTone(date, today) : undefined
  const full = date ? fullDate(parseISO(date)) : ""
  const opens = !!date && !guest
  const show = (e: React.SyntheticEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (opens) setOpen(e.currentTarget)
  }
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        role={opens ? "button" : undefined}
        tabIndex={opens ? 0 : undefined}
        contentEditable={false}
        data-date-chip=""
        title={full}
        aria-label={date ? `${full}${reminder ? ", with a reminder" : ""}` : "A date"}
        aria-haspopup={opens ? "dialog" : undefined}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") show(e)
        }}
        className={cn(
          "mx-px inline-flex items-baseline gap-1 rounded-[5px] bg-hover px-1 align-baseline font-[510] text-ink [&_svg]:self-center",
          opens && "cursor-pointer transition-colors duration-[140ms] ease-[var(--ease-out)] motion-reduce:transition-none",
          opens && !tone && "hover:bg-press",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          tone && CHIP_TONE[tone === "today" ? "sun" : "danger"],
          selected && "ring-2 ring-brand ring-offset-1 ring-offset-sheet",
        )}
      >
        {reminder ? <Bell className="size-3.5" aria-hidden="true" /> : null}
        {date ? dateLabel(date, today) : "Date"}
      </span>
      {open ? (
        <React.Suspense fallback={null}>
          <DatePopover anchor={open} editor={editor} getPos={getPos} node={node} updateAttributes={updateAttributes} onClose={() => setOpen(null)} />
        </React.Suspense>
      ) : null}
    </NodeViewWrapper>
  )
}
