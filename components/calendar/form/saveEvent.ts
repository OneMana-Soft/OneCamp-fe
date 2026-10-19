/**
 * Saving the Event Form (calendar FORM): one way for the full dialog, the
 * right panel and the phone's page. Where the calendar keeps its own events
 * (the one store), through its own API: a new event with everything the form
 * says, a change with only what differs, asking the scope for an instance of
 * a series (D-CAL-6) and "Tell guests?" for a change guests would hear of
 * (D-CAL-5); the reader's reminders through their own route. On a server
 * with the old stores, through the /event routes, with the fields they keep.
 */

import { PostEndpointUrl } from "@/services/endPoints"
import type { CreateEventPayload } from "@/types/calendar"
import type { RepeatScope } from "@/lib/calendar/repeat"
import type { ScopeAction } from "@/components/calendar/scopePrompt"
import type { TellAction, TellChoice } from "@/components/calendar/tellGuests"
import { isInstanceId } from "@/lib/calendar/instanceId"
import { tellOf, type EventShape } from "@/lib/calendar/tellGuests"
import { createApiEventRequest, patchApiEventRequest, setRemindersRequest, type ApiEvent, type ApiNotify } from "@/lib/calendar/eventsApi"
import { eventInput, eventPatch, patchChanges, remindersChanged, savedNotes, whenOf, type EventFormValues } from "@/lib/calendar/eventForm"

/** What a save needs from its host: a way to send, and the two questions. */
export interface SaveDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- usePost's makeRequest, typed per request
  makeRequest: (req: any) => Promise<any>
  askScope: (action: ScopeAction) => Promise<RepeatScope | null>
  askTell: (action: TellAction) => Promise<TellChoice | null>
}

/** How a save went: saved (and whether the panel shows another event now), asked and left, or refused. */
export type SaveResult = { saved: true; moved: boolean; id?: string } | { saved: false; why: "cancelled" | "stale" | "gone" | "failed" }

const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status

/** What "Tell guests?" compares: the meeting as guests know it. */
function shapeOf(v: EventFormValues): EventShape {
  const { start, end } = whenOf(v)
  return {
    title: v.title.trim(),
    notes: v.notes,
    start: new Date(start.at ?? `${start.date}T00:00:00`),
    end: new Date(end.at ?? `${end.date}T00:00:00`),
    rule: v.rule,
    guests: { members: v.guests.filter((g) => g.uuid).map((g) => g.uuid), emails: v.guests.filter((g) => !g.uuid).map((g) => g.email) },
  }
}

/** The reader's reminders, when they set their own (null goes back to the default's). Quiet: the event is saved either way. */
async function saveReminders(deps: SaveDeps, id: string, reminders: number[] | null) {
  try {
    await deps.makeRequest(setRemindersRequest(id, reminders))
  } catch {
    // The event is saved; the reminders' row says what they are.
  }
}

/** A new event from the form. */
export async function createEvent(deps: SaveDeps, v: EventFormValues, full: boolean): Promise<SaveResult> {
  try {
    if (!full) {
      const { start, end } = whenOf({ ...v, allDay: false })
      await deps.makeRequest({
        apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
        payload: {
          title: v.title.trim(),
          description: savedNotes(v),
          startTime: start.at ?? v.start.toISOString(),
          endTime: end.at ?? v.end.toISOString(),
          syncToGoogleCalendar: v.syncToGoogle,
          participants: v.kind === "event" ? v.guests.filter((g) => g.uuid).map((g) => g.uuid) : [],
          isFocus: v.kind === "focus",
          isAway: v.kind === "out_of_office",
        } satisfies CreateEventPayload,
      })
      return { saved: true, moved: false }
    }
    // Someone invited by email would be emailed: the organiser says whether.
    let notify: ApiNotify
    if (v.kind === "event" && v.guests.some((g) => !g.uuid)) {
      const choice = await deps.askTell("invite")
      if (!choice) return { saved: false, why: "cancelled" }
      if (choice === "none") notify = "none"
    }
    const made = (await deps.makeRequest(createApiEventRequest({ ...eventInput(v), ...(notify ? { notify } : {}) }))) as ApiEvent | undefined
    if (made?.id && v.reminders !== null) await saveReminders(deps, made.id, v.reminders)
    return { saved: true, moved: false, id: made?.id }
  } catch {
    return { saved: false, why: "failed" }
  }
}

/**
 * A change from the form, to the event as the calendar's API sent it (its
 * version and id): what differs from was, in the scope picked for an
 * instance, told to guests as the organiser says.
 */
export async function saveEventChange(
  deps: SaveDeps,
  { v, was, api, organiser }: { v: EventFormValues; was: EventFormValues; api: ApiEvent; organiser: boolean },
): Promise<SaveResult> {
  const instance = isInstanceId(api.id)
  let scope: RepeatScope | undefined
  const patch = { ...eventPatch(v, was, api.sequence, organiser) }
  if (patchChanges(patch)) {
    if (instance) {
      const picked = await deps.askScope("change")
      if (!picked) return { saved: false, why: "cancelled" }
      scope = picked
      patch.scope = picked
    }
    const tell = v.kind === "event" ? tellOf(shapeOf(was), shapeOf(v)) : null
    if (tell) {
      const choice = await deps.askTell(tell)
      if (!choice) return { saved: false, why: "cancelled" }
      if (choice === "none") patch.notify = "none"
    }
    try {
      await deps.makeRequest(patchApiEventRequest(api.id, patch))
    } catch (e) {
      const status = statusOf(e)
      return { saved: false, why: status === 409 ? "stale" : status === 404 ? "gone" : "failed" }
    }
  }
  if (remindersChanged(v, was)) await saveReminders(deps, api.id, v.reminders)
  return { saved: true, moved: !!scope && scope !== "this" }
}

/** A change through the /event routes (the old stores, or an event they keep): the fields they have. */
export async function saveLegacyChange(deps: SaveDeps, id: string, v: EventFormValues): Promise<SaveResult> {
  const { start, end } = whenOf({ ...v, allDay: false })
  try {
    await deps.makeRequest({
      apiEndpoint: `${PostEndpointUrl.UpdateCalendarEvent}/${id}` as PostEndpointUrl,
      payload: {
        title: v.title.trim(),
        description: savedNotes(v),
        startTime: start.at ?? v.start.toISOString(),
        endTime: end.at ?? v.end.toISOString(),
        participants: v.kind === "event" ? v.guests.filter((g) => g.uuid).map((g) => g.uuid) : [],
        isFocus: v.kind === "focus",
        isAway: v.kind === "out_of_office",
      },
      // The server's reason when it refuses ("Only the person who made this
      // event can change it."), never a bare failure (CAL-BUG-16).
      showErrorToast: true,
      failureTitle: "Couldn't save the event",
    })
    return { saved: true, moved: false }
  } catch (e) {
    return { saved: false, why: statusOf(e) === 404 ? "gone" : "failed" }
  }
}
