import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import type { PublicResult } from "@/services/publicApi"
import type { CallRef } from "@/lib/calls/callRef"

// A call's invite, and members at a link as themselves (calls HU13). Apart
// from callService, so only what makes an invite or comes in by a door loads it.

/** An invite as its maker gets it: the raw token, which makes a meeting's link (guestMeetingLink), and its latest end. */
export type CallInviteLink = { guest_token: string; grant_id: string; expires_at: string }

/** An invite into the conversation's call going on, for someone in it who may let people in. */
export async function inviteToCall(ref: CallRef): Promise<CallInviteLink> {
  const res = await axiosInstance.post("/calls/invite", { kind: ref.kind, id: ref.id }, OWN_ERRORS)
  return (res.data as { data: CallInviteLink }).data
}

/** A door a member opens: a link's token, a room's address with its passcode's unlock, or an event's room (gcal-15). */
export type MemberDoor = { token: string } | { slug: string; unlock?: string } | { event: string }

// Not lib/calendar/eventsApi's: a door's first load carries none of it.
const eventRoomUrl = (id: string) => `/calendar/events/${encodeURIComponent(id)}/room`

/** What a door gives a member: their own call token, or the conversation's call they're already in. */
export type DoorEntry = { token?: string; room: string; title: string; conversation?: CallRef }

/** A member at a door, as themselves. 401 "locked" is a room's passcode; a refusal says why in its own words. */
export async function enterByDoor(door: MemberDoor, language?: string): Promise<DoorEntry> {
  const lang = language ? { language } : {}
  const res = "event" in door ? await axiosInstance.post(`${eventRoomUrl(door.event)}/join`, lang, OWN_ERRORS) : await axiosInstance.post("/calls/door", { ...door, ...lang }, OWN_ERRORS)
  return (res.data as { data: DoorEntry }).data
}

export type EventRoomRead = { title: string; join: string }

/** An event's room before Join (nothing made), told as a guest door's read is: 4xx can't join, the rest waited out. */
export async function getEventRoom(id: string): Promise<PublicResult<EventRoomRead>> {
  try {
    const res = await axiosInstance.get(eventRoomUrl(id), OWN_ERRORS)
    return { ok: true, data: (res.data as { data: EventRoomRead }).data }
  } catch (e) {
    return { ok: false, status: apiErrorStatus(e), msg: apiErrorMessage(e, "Try again in a moment.") }
  }
}

