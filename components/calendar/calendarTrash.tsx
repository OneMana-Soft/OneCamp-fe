"use client"

import { useRouter } from "next/navigation"
import { lazyView } from "@/lib/lazy/lazyView"
import { usePost } from "@/hooks/usePost"
import { toast } from "@/hooks/use-toast"
import { ErrorState } from "@/components/ui/error-state"
import { LoadFailedRow } from "@/components/ui/load-failed-row"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { calendarRoute } from "@/lib/calendar/route"
import { restoreEventRequest, trashReadRequest, trashedWindow, type TrashedEvent } from "@/lib/calendar/trash"

// The calendar's Trash, for the Calendars panel and the phone's calendar options. This side sends the reads and
// restores, so the sheet's chunk reaches no shared code (main's rule, 30 Oct).
const Part = lazyView(() => import("@/components/calendar/trash/calendarTrashDialog"))

export const warmCalendarTrash = () => Part.warm()

// lib/calendar/liveEvent's CALENDAR_LIVE_EVENT (calendarTrash.test.tsx holds the two equal).
const CALENDAR_LIVE = "onecamp:calendar-live"

export interface RestoreDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- usePost's makeRequest, typed per request
  send: (req: any) => Promise<unknown>
  show: (day: Date) => void
}

/**
 * Puts one back, on an open grid at once (its live re-read), with a toast whose Show jumps to its day; else why not.
 * A date that is no day (trashedWindow) has no window and nothing to show: every open list reads again, no Show.
 */
export async function restoreFromTrash({ send, show }: RestoreDeps, e: TrashedEvent): Promise<string | null> {
  try {
    await send(restoreEventRequest(e.id))
  } catch (err) {
    return apiErrorMessage(err, "Couldn't restore it. Try again.")
  }
  const { from, to } = trashedWindow(e)
  // trashedWindow's `to` is a day whenever its `from` is.
  const day = isNaN(from.getTime()) ? null : from
  window.dispatchEvent(new CustomEvent(CALENDAR_LIVE, { detail: day ? { event_id: e.id, from: day.toISOString(), to: to.toISOString() } : { event_id: e.id } }))
  const name = e.title.trim() || "Untitled event"
  const action = day
    ? await import("@/components/calendar/undoToast").then((m) => m.toastAction("Show", `Show ${name} on the calendar`, () => show(day)), () => undefined)
    : undefined
  toast({ tone: "success", title: `Restored “${name}”`, action })
  return null
}

/** A failed read of the trash, said through the shared error states: the dialog's chunk reaches no path in, so it is handed them. */
export const trashFailed = {
  first: (retry: () => void) => <ErrorState compact subject="your trash" onRetry={retry} />,
  older: (shown: boolean, retry: () => void) => (
    <LoadFailedRow shown={shown} onRetry={retry}>
      Couldn&apos;t load older events, so they aren&apos;t shown here.
    </LoadFailedRow>
  ),
}

export function CalendarTrash({ onClose }: { onClose: () => void }) {
  const post = usePost()
  const router = useRouter()
  return (
    <Part.View
      fallback={null}
      render={(m) => (
        <m.default
          read={(after) => post.makeRequest(trashReadRequest(after)) as Promise<TrashedEvent[] | undefined>}
          onRestore={(e) =>
            restoreFromTrash(
              {
                send: post.makeRequest,
                show: (day) => {
                  onClose()
                  router.push(calendarRoute({ date: day }))
                },
              },
              e,
            )
          }
          onClose={onClose}
          failed={trashFailed}
        />
      )}
    />
  )
}
