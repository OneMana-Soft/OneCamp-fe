"use client"

import * as React from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { TrashRow } from "@/components/trash/TrashRow"
import { isCampHue } from "@/lib/campHue"
import { ownHueVars } from "@/lib/color/ownHue"
import { CalendarDays } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { clockTime } from "@/lib/utils/date/clock"
import { cn } from "@/lib/utils/helpers/cn"
import { busyWith } from "@/lib/ui/busyWith"
import { allDayLastDay } from "@/lib/calendar/allDay"
import { TRASH_DAYS, nextBefore, trashedWindow, type TrashAfter, type TrashedEvent } from "@/lib/calendar/trash"

/** One look at the trash, the first or the one after a row: the calendar sends it (calendarTrash.tsx). */
export type TrashRead = (after?: TrashAfter) => Promise<TrashedEvent[] | undefined>

/** A failed first read, in place of the list, and older ones that failed, under it while `shown`. */
export interface TrashFailed {
  first: (retry: () => void) => React.ReactNode
  older: (shown: boolean, retry: () => void) => React.ReactNode
}

/** Reads the trash a page at a time through `read`: the first as the sheet opens, the next on asking. */
export function useTrashPages(read: TrashRead) {
  const [items, setItems] = React.useState<TrashedEvent[]>([])
  const [next, setNext] = React.useState<TrashAfter | undefined>()
  const [state, setState] = React.useState<"loading" | "idle" | "failed">("loading")
  const look = React.useCallback(
    async (after?: TrashAfter) => {
      setState("loading")
      try {
        const page = (await read(after)) ?? []
        setItems((had) => [...had, ...page.filter((e) => !had.some((h) => h.id === e.id))])
        setNext(nextBefore(page))
        setState("idle")
      } catch {
        setState("failed")
      }
    },
    [read],
  )
  const opened = React.useRef(false)
  React.useEffect(() => {
    if (opened.current) return
    opened.current = true
    void look()
  }, [look])
  return { items, next, state, look }
}

/**
 * When it was: "Fri 16 Oct, 14:00", or an all-day event's days ("Thu 22 Oct", "Thu 22 Oct to Sat 24 Oct"), read
 * as every calendar surface reads them (lib/calendar trashedWindow and allDayLastDay); "" for a date that is no day.
 */
function whenWords(e: TrashedEvent): string {
  const { from, to } = trashedWindow(e)
  if (isNaN(from.getTime())) return ""
  if (!e.all_day) return `${format(from, "EEE d MMM")}, ${clockTime(from)}`
  const last = allDayLastDay(from, to)
  return last > from ? `${format(from, "EEE d MMM")} to ${format(last, "EEE d MMM")}` : format(from, "EEE d MMM")
}

/** Its colour's mark: its own colour, a camp hue, or the calendar's (sun). */
function Mark({ hue }: { hue?: string }) {
  const own = ownHueVars(hue)
  return (
    <span
      aria-hidden="true"
      data-own-hue={own ? hue : undefined}
      style={own ?? undefined}
      className={cn(own ? "hue-own" : HUE_CLASS[isCampHue(hue) ? hue : "sun"], "size-3 shrink-0 rounded-[3px] bg-hue")}
    />
  )
}

/**
 * The calendar's Trash (calendar head B, gcal-1a; Google's Trash): the
 * reader's own events deleted in the last 30 days, newest first, each with
 * when it was, who deleted it and when, and Restore, which puts it back where
 * it was. Nothing here is deleted for good. A dialog on a computer and the
 * shared sheet on a phone, its Done pinned at the foot. Its chunk takes no
 * data (main's chunking rule, 30 Oct): the calendar reads the trash, restores
 * (onRestore says why it couldn't, or null) and sends its reads (`read`).
 */
export default function CalendarTrashDialog({
  read,
  onRestore,
  onClose,
  failed,
}: {
  read: TrashRead
  onRestore: (e: TrashedEvent) => Promise<string | null>
  onClose: () => void
  /** A failed read as the opener says it (the shared error states reach the toast, which this chunk doesn't). */
  failed: TrashFailed
}) {
  const list = useTrashPages(read)
  const [restored, setRestored] = React.useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [refused, setRefused] = React.useState<Record<string, string>>({})
  const items = list.items.filter((e) => !restored.has(e.id))

  const restore = async (e: TrashedEvent) => {
    setBusy(e.id)
    setRefused((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== e.id)))
    const why = await onRestore(e)
    setBusy(null)
    if (why) setRefused((r) => ({ ...r, [e.id]: why }))
    else setRestored((s) => new Set(s).add(e.id))
  }

  let body: React.ReactNode
  if (list.state === "failed" && items.length === 0) {
    body = failed.first(() => void list.look())
  } else if (list.state === "loading" && items.length === 0) {
    body = (
      <div className="grid gap-0.5" aria-busy="true" data-trash-loading="">
        {[48, 36, 56].map((w) => (
          <div key={w} className="flex min-h-14 items-center gap-2.5 px-2 sm:min-h-12" aria-hidden="true">
            <Skeleton className="size-3 rounded-[3px]" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-[76px] rounded-md" />
          </div>
        ))}
      </div>
    )
  } else if (items.length === 0) {
    body = <EmptyState icon={CalendarDays} hue="sun" title="Nothing in the trash" description={`Events you delete stay here for ${TRASH_DAYS} days.`} className="py-8" />
  } else {
    body = (
      <ul className="-mx-2 grid gap-0.5" aria-label="Deleted events">
        {items.map((e) => {
          const title = e.title.trim() || "Untitled event"
          const by = e.deleted_by ? displayNameOf(e.deleted_by) : ""
          const when = whenWords(e)
          return (
            <li key={e.id} data-trash-event={e.id} className="rounded-lg transition-colors duration-[140ms] hover:bg-hover/60">
              <TrashRow
                lead={<Mark hue={e.hue} />}
                title={title}
                untitled={!e.title.trim()}
                note={
                  when ? (
                    <p data-trash-when="" className="truncate text-meta text-ink-2">
                      {when}
                    </p>
                  ) : null
                }
                meta={{ verb: "Deleted", at: e.deleted_at, who: by }}
              >
                <Button size="sm" variant="secondary" onClick={() => void restore(e)} {...busyWith(busy, e.id)} aria-label={`Restore ${title}`} className="shrink-0">
                  Restore
                </Button>
              </TrashRow>
              {refused[e.id] ? (
                <p role="alert" className="px-2 pb-2 pl-[30px] text-meta text-danger-ink">
                  {refused[e.id]}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ResponsiveDialog
      title="Trash"
      description={`Events you deleted in the last ${TRASH_DAYS} days. Restore puts one back on your calendar.`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div data-calendar-trash="" className="grid">
        {body}
        {items.length > 0 ? failed.older(list.state === "failed", () => void list.look(list.next)) : null}
        {items.length > 0 && list.state !== "failed" && list.next ? (
          <div className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={() => void list.look(list.next)} busy={list.state === "loading"}>
              Show older
            </Button>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
