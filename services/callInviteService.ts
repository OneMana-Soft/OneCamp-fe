import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { CallRef } from "@/services/callService"

// A call's invite, and members at a link as themselves (calls HU13). Apart
// from callService, so only what makes an invite or comes in by a door loads it.

/** An invite as its maker gets it: the raw token, which makes a meeting's link (guestMeetingLink), and its latest end. */
export type CallInviteLink = { guest_token: string; grant_id: string; expires_at: string }

/** An invite into the conversation's call going on, for someone in it who may let people in. */
export async function inviteToCall(ref: CallRef): Promise<CallInviteLink> {
  const res = await axiosInstance.post("/calls/invite", { kind: ref.kind, id: ref.id }, OWN_ERRORS)
  return (res.data as { data: CallInviteLink }).data
}

/** A door a member opens: a link's token, or a room's address with its passcode's unlock. */
export type MemberDoor = { token: string } | { slug: string; unlock?: string }

/** What a door gives a member: their own call token, or the conversation's call they're already in. */
export type DoorEntry = { token?: string; room: string; title: string; conversation?: CallRef }

/** A member at a door, as themselves. 401 "locked" is a room's passcode; a refusal says why in its own words. */
export async function enterByDoor(door: MemberDoor, language?: string): Promise<DoorEntry> {
  const res = await axiosInstance.post("/calls/door", { ...door, ...(language ? { language } : {}) }, OWN_ERRORS)
  return (res.data as { data: DoorEntry }).data
}

/** The call a call's room is, as Call State names it (business/CallState RefOfRoom), or null. Pure. */
export function callRefOfRoom(room: string): CallRef | null {
  if (room.startsWith("meet-")) return room.length > 5 ? { kind: "meeting", id: room.slice(5) } : null
  if (/^[0-9a-f-]{36} [0-9a-f-]{36}$/i.test(room)) return { kind: "dm", id: room }
  if (/^[0-9a-f]{32}$/.test(room)) return { kind: "group", id: room }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room)) return { kind: "channel", id: room }
  return null
}

/** A conversation's own call page, for someone in it; "" for a meeting. A DM's is the other person's. Pure. */
export function conversationCallPath(ref: CallRef, selfUUID?: string): string {
  if (ref.kind === "channel") return `/app/meet/ch/${ref.id}`
  if (ref.kind === "group") return `/app/meet/grp/${ref.id}`
  if (ref.kind === "dm") {
    const other = ref.id.split(" ").find((id) => id && id !== selfUUID)
    return other ? `/app/meet/chat/${other}` : ""
  }
  return ""
}
