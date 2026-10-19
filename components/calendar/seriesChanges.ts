import { format } from "date-fns"
import type { useToast } from "@/hooks/use-toast"
import type { usePost } from "@/hooks/usePost"
import { deleteApiEventRequest, patchApiEventRequest, readApiEventRequest, readerZone, type ApiEvent } from "@/lib/calendar/eventsApi"
import type { RepeatScope } from "@/lib/calendar/repeat"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { CalendarEventInterface } from "@/types/calendar"

/**
 * The grid's changes to an instance of a repeating event (calendar A7,
 * D-CAL-6): its new times or the trash, for the scope picked, through the
 * calendar's own API (lib/calendar/eventsApi). A chunk of its own, which the
 * calendar fetches when the page is idle (calendarApp.tsx): the first screen
 * never draws it, and a change never waits for it.
 */

type Post = Pick<ReturnType<typeof usePost>, "makeRequest">
type Toast = ReturnType<typeof useToast>["toast"]

/**
 * An instance's new times, for the scope picked: at the version it is now
 * (CAL2), all-day ones as dates. Quiet: the move says what went wrong itself.
 */
export async function sendInstanceTimes(post: Post, e: CalendarEventInterface, start: Date, end: Date, scope: RepeatScope) {
  const id = e.event_uuid
  const api = await post.makeRequest<undefined, ApiEvent>(readApiEventRequest(id))
  if (!api) return undefined
  const allDay = !!api.all_day
  const patch = {
    sequence: api.sequence,
    scope,
    start: allDay ? { date: format(start, "yyyy-MM-dd") } : { at: start.toISOString(), zone: readerZone() },
    end: allDay ? { date: format(end, "yyyy-MM-dd") } : { at: end.toISOString() },
  }
  return post.makeRequest({ ...patchApiEventRequest(id, patch), showErrorToast: false, quiet: true })
}

/**
 * This and the following instances, or the whole series, moved, and how it
 * went said. The calendar then reads again for where they went.
 */
export async function moveInstances(post: Post, toast: Toast, e: CalendarEventInterface, start: Date, end: Date, scope: RepeatScope) {
  let why: unknown
  const saved = await sendInstanceTimes(post, e, start, end, scope).then((r) => r !== undefined, (err) => ((why = err), false))
  toast(
    saved
      ? { title: `Moved “${e.event_title}”`, description: scope === "all" ? "Every event in the series moved with it." : "This and the following events moved." }
      : { title: `Couldn't move “${e.event_title}”`, description: apiErrorMessage(why, "Nothing moved."), variant: "destructive" },
  )
}

/** The instances the scope names, to the trash; false when they stay (the request's toast says why). */
export async function trashInstances(post: Post, id: string, scope: RepeatScope): Promise<boolean> {
  try {
    await post.makeRequest(deleteApiEventRequest(id, scope))
    return true
  } catch {
    return false
  }
}
