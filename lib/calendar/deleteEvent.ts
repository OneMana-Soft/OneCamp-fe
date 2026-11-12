import type { TellAction, TellChoice } from "@/components/calendar/tellGuestsDialog"
import type { ToastActionElement } from "@/components/ui/toast"
import type { useToast } from "@/hooks/use-toast"
import { bookedMeetingConfirm, type BookedConfirm } from "@/lib/calendar/bookedMeeting"
import { deleteEventRequest } from "@/lib/calendar/confirmDelete"
import { deleteApiEventRequest, type ApiNotify } from "@/lib/calendar/eventsApi"
import { isInstanceId } from "@/lib/calendar/instanceId"
import type { RepeatScope } from "@/lib/calendar/repeat"
import { NOT_EMAILED, guestsOf } from "@/lib/calendar/tellGuests"
import { restoreEventRequest } from "@/lib/calendar/trash"
import { deletedTitle, offerUndo, restoreBy } from "@/services/restoreService"
import type { CalendarEventInterface } from "@/types/calendar"

/**
 * Deleting an event, one way wherever it is deleted from (CAL-40): the grid's
 * key and menu, and the event's panel and page. A chunk of its own, which only
 * a delete loads; lib/calendar/confirmDelete keeps the old stores' request.
 */

/** What a delete needs from where it is deleted. */
export interface DeleteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- usePost's makeRequest, typed per request
  makeRequest: (req: any) => Promise<any>
  askScope: (action: "delete") => Promise<RepeatScope | null>
  askTell: (action: TellAction) => Promise<TellChoice | null>
  confirm: (c: BookedConfirm & { destructive: boolean; onConfirm: () => unknown }) => void
  toast: ReturnType<typeof useToast>["toast"]
  /** A toast's button, from the calendar's toast chunk (components/calendar/undoToast): this file draws nothing. */
  action: (label: string, altText: string, onClick: () => void) => ToastActionElement
  /** It's gone: off the calendar, its card and panel closed, and the calendar reads again. */
  gone: (id: string) => void
  /** It's back: the calendar reads again. */
  back: () => unknown
  /** The calendar's Trash. */
  openTrash: () => void
  /** The calendar keeps its events in its one store (FEATURE_CALENDAR_REPEATS): a delete goes to its Trash. */
  full: boolean
}

/**
 * Where a delete's Open Trash goes from the event's panel or page: the
 * calendar, at the place it shows when it is the page `here`, its Trash open
 * (lib/calendar/route calendarPlace reads `trash`). Pure.
 */
export function trashRoute(here: { pathname: string; search: string }): string {
  const q = new URLSearchParams(here.pathname === "/app/calendar" ? here.search : "")
  // The event deleted is no longer one to open beside it.
  q.delete("event")
  q.set("trash", "1")
  return `/app/calendar?${q}`
}

const SERIES_GONE: Record<RepeatScope, string | undefined> = { this: undefined, following: "This and the following events.", all: "Every event in the series." }

/**
 * Nothing is deleted for good: on the one store an event goes to the
 * calendar's Trash. With nobody else on it, it goes at once, with Undo (D-2).
 * With guests, "Tell your guests it's cancelled?" is the one question, and
 * closing it keeps the event. A booked meeting keeps its own question, which
 * names its guest: its booking is cancelled and its guest told, so it offers
 * the Trash rather than Undo, as an instance of a series does once its scope
 * is picked. On a server with the old stores, it asks first, through their
 * own route. A `sequence` (the version read, where the panel has it) is sent
 * with it, so a delete never meets a newer version unasked.
 */
export async function deleteEvent(deps: DeleteDeps, ev: CalendarEventInterface, sequence?: number): Promise<void> {
  const id = ev.event_uuid
  const name = ev.event_title
  const trash = () => deps.action("Open Trash", "Open your calendar's Trash", deps.openTrash)
  /** Whether it went; a refusal's toast is the request's own. */
  const send = async (req: unknown) => {
    try {
      await deps.makeRequest(req)
    } catch {
      return false
    }
    deps.gone(id)
    return true
  }
  if (!deps.full || ev.event_booking) {
    deps.confirm({
      ...(ev.event_booking ? bookedMeetingConfirm(ev.event_booking, "delete") : { title: `Delete “${name}”?`, description: "It's removed from everyone's calendar.", confirmText: "Delete event" }),
      destructive: true,
      onConfirm: async () => {
        if (!(await send(deps.full ? deleteApiEventRequest(id, "all", sequence) : deleteEventRequest(id)))) return
        deps.toast(deps.full ? { title: deletedTitle(name), description: "It's in your calendar's Trash.", action: trash() } : { title: deletedTitle(name) })
      },
    })
    return
  }
  const instance = isInstanceId(id)
  const scope = instance ? await deps.askScope("delete") : "all"
  if (!scope) return
  let notify: ApiNotify
  const { members, emails } = guestsOf(ev)
  if (members.length + emails.length > 0) {
    const choice = await deps.askTell("delete")
    if (!choice) return
    if (choice === "none") notify = "none"
  }
  if (!(await send(deleteApiEventRequest(id, scope, sequence, notify)))) return
  const unsent = notify ? NOT_EMAILED : undefined
  if (instance) {
    deps.toast({ title: `Moved “${name}” to the Trash`, description: [SERIES_GONE[scope], unsent].filter(Boolean).join(" ") || undefined, action: trash() })
    return
  }
  offerUndo(deletedTitle(name), () => restoreBy(() => deps.makeRequest(restoreEventRequest(id)), async () => void (await deps.back())), unsent)
}
