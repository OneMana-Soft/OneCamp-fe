import { format } from "date-fns"
import type { TellAction, TellChoice } from "@/components/calendar/tellGuestsDialog"
import type { useConfirm } from "@/hooks/useConfirm"
import type { useToast } from "@/hooks/use-toast"
import type { usePost } from "@/hooks/usePost"
import { bookedMeetingConfirm } from "@/lib/calendar/bookedMeeting"
import { patchApiEventRequest, readApiEventRequest, readerZone, type ApiEvent, type ApiNotify } from "@/lib/calendar/eventsApi"
import { isInstanceId } from "@/lib/calendar/instanceId"
import type { RepeatScope } from "@/lib/calendar/repeat"
import { NOT_EMAILED, tellOfMove } from "@/lib/calendar/tellGuests"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { dayAndTime } from "@/lib/utils/date/clock"
import { CalendarPost } from "@/services/endpoints/calendar"
import type { CalendarEventInterface, CreateEventPayload } from "@/types/calendar"

/**
 * The grid's moves (a drag, a resize, Alt and the arrows: calendar A7,
 * D-CAL-6, CAL-BUG-4, CAL-11): the questions a move asks, its new times sent,
 * and how it went said. A chunk of its own, which the calendar fetches when
 * the page is idle (calendarApp.tsx): the first screen never draws it.
 */

type Post = Pick<ReturnType<typeof usePost>, "makeRequest">
type Toast = ReturnType<typeof useToast>["toast"]

/** How a move is sent: an instance's scope, and "none" when its guests aren't emailed (D-CAL-5). */
export interface Sent {
  scope?: RepeatScope
  notify?: ApiNotify
}

/** A move as it was before, sent as it was: what its Undo puts back. */
export interface Moved extends Sent {
  start: string
  end: string
}

/**
 * How a move goes: an Undo's (asked already), a booked meeting's once
 * confirmed, a burst of keys' (drawn moved already, from where it was), and
 * one sent as the calendar is left, which asks nothing, so goes no further
 * where it would ask.
 */
export interface MoveHow extends Sent {
  undoing?: boolean
  confirmed?: boolean
  from?: { start: string; end: string }
  leaving?: boolean
}

/** What a move needs from the calendar. */
export interface MoveDeps {
  post: Post
  toast: Toast
  confirm: ReturnType<typeof useConfirm>
  askScope: (action: "change") => Promise<RepeatScope | null>
  askTell: (action: TellAction) => Promise<TellChoice | null>
  /** The calendar's copy with the event at these times, at once; read again too when said. */
  draw: (start: string, end: string, readAgain?: boolean) => void
  reread: () => void
  /** The same move again, a booked meeting's once its organiser confirms it. */
  again: (how: MoveHow) => unknown
  /** The calendar keeps its events in its one store (FEATURE_CALENDAR_REPEATS): a move goes through its own API. */
  full: boolean
}

/**
 * A move: drawn at once, put back if it fails, or if a question it asks is
 * closed: a booked meeting's, which names its guest; an instance's scope;
 * and, by the Event Form's own rule, whether to tell its guests (CAL-11).
 * What its Undo puts back, or null when there is none to offer.
 */
export async function moveEvent(deps: MoveDeps, e: CalendarEventInterface, start: Date, end: Date, how: MoveHow): Promise<Moved | null> {
  const before = how.from ?? { start: e.event_start_time, end: e.event_end_time }
  const putBack = (readAgain = false) => (deps.draw(before.start, before.end, readAgain), null)
  if (e.event_booking && !how.confirmed) {
    // Its confirm can't say it was closed, so the block waits where it was.
    if (how.from) putBack()
    if (!how.leaving) deps.confirm({ ...bookedMeetingConfirm(e.event_booking, "move", start, end), onConfirm: () => deps.again({ ...how, from: before, confirmed: true }) })
    return null
  }
  deps.draw(start.toISOString(), end.toISOString())
  let scope = how.scope
  if (!scope && isInstanceId(e.event_uuid)) {
    const picked = how.leaving ? null : await deps.askScope("change")
    if (!picked) return putBack()
    scope = picked
  }
  // Asked once; an Undo sends with the move's answer. A booked meeting's own
  // question said what its guest is told; the old stores always tell.
  let notify = how.notify
  const tell = deps.full && !how.undoing && !how.confirmed ? tellOfMove({ ...e, event_start_time: before.start, event_end_time: before.end }, start, end) : null
  if (tell) {
    const choice = how.leaving ? null : await deps.askTell(tell)
    if (!choice) return putBack()
    if (choice === "none") notify = "none"
  }
  if (scope && scope !== "this") {
    await moveInstances(deps.post, deps.toast, e, start, end, { scope, notify })
    deps.reread()
    return null
  }
  let saved = false
  let why: unknown
  try {
    saved = (await (deps.full ? sendTimes(deps.post, e, start, end, { scope, notify }) : sendLegacyTimes(deps.post, e, start, end))) !== undefined
  } catch (err) {
    why = err
  }
  if (!saved) {
    // The old stores' route says why in its own toast.
    deps.toast(deps.full ? notMoved(e, why) : { title: `Couldn't move “${e.event_title}”`, description: "It's back where it was.", variant: "destructive" })
    return putBack(true)
  }
  deps.reread()
  if (!how.undoing) return { ...before, scope, notify }
  deps.toast(moved(e, start, end, { notify, back: true }))
  return null
}

/**
 * An event's new times through the calendar's own API, at the version it is
 * now (CAL2): its start and end alone, so its title, notes and guests stay as
 * the server has them; all-day ones as dates. Quiet: the move says what went
 * wrong itself.
 */
export async function sendTimes(post: Post, e: CalendarEventInterface, start: Date, end: Date, { scope, notify }: Sent = {}) {
  const id = e.event_uuid
  const api = await post.makeRequest<undefined, ApiEvent>(readApiEventRequest(id))
  if (!api) return undefined
  const allDay = !!api.all_day
  const patch = {
    sequence: api.sequence,
    ...(scope ? { scope } : {}),
    start: allDay ? { date: format(start, "yyyy-MM-dd") } : { at: start.toISOString(), zone: readerZone() },
    end: allDay ? { date: format(end, "yyyy-MM-dd") } : { at: end.toISOString() },
    ...(notify ? { notify } : {}),
  }
  return post.makeRequest({ ...patchApiEventRequest(id, patch), showErrorToast: false, quiet: true })
}

/** An event's new times on a server with the old stores, through the /event route, which takes the event whole. */
export function sendLegacyTimes(post: Post, e: CalendarEventInterface, start: Date, end: Date) {
  return post.makeRequest<CreateEventPayload>({
    apiEndpoint: (CalendarPost.UpdateCalendarEvent + `/${e.event_uuid}`) as string,
    payload: {
      title: e.event_title,
      description: e.event_description,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      participants: (e.event_participants || []).map((p) => p.user_uuid),
      isFocus: !!e.event_is_focus,
      isAway: !!e.event_is_away,
    },
  })
}

/** A move's toast: where it went (an Undo's, back where it was), and that guests weren't emailed when the organiser said not. */
export function moved(e: Pick<CalendarEventInterface, "event_title">, start: Date, end: Date, { notify, back }: { notify?: ApiNotify; back?: boolean }) {
  const when = dayAndTime(start, end)
  return { title: `Moved “${e.event_title}”${back ? " back" : ""}`, description: notify ? `${when}. ${NOT_EMAILED}` : when }
}

/** A move that didn't go, said: someone's change came first (409), or why not, in the server's words. */
export function notMoved(e: Pick<CalendarEventInterface, "event_title">, why: unknown) {
  return apiErrorStatus(why) === 409
    ? { title: `Someone changed “${e.event_title}” meanwhile`, description: "It's back where it was. Try again.", variant: "destructive" as const }
    : { title: `Couldn't move “${e.event_title}”`, description: apiErrorMessage(why, "It's back where it was."), variant: "destructive" as const }
}

/**
 * This and the following instances, or the whole series, moved, and how it
 * went said. The calendar then reads again for where they went.
 */
export async function moveInstances(post: Post, toast: Toast, e: CalendarEventInterface, start: Date, end: Date, how: Sent) {
  let why: unknown
  const saved = await sendTimes(post, e, start, end, how).then((r) => r !== undefined, (err) => ((why = err), false))
  const which = how.scope === "all" ? "Every event in the series moved with it." : "This and the following events moved."
  toast(
    saved
      ? { title: `Moved “${e.event_title}”`, description: how.notify ? `${which} ${NOT_EMAILED}` : which }
      : { title: `Couldn't move “${e.event_title}”`, description: apiErrorMessage(why, "Nothing moved."), variant: "destructive" },
  )
}
