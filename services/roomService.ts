import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall } from "@/services/publicApi"

// A member's personal meeting room (calls CALLS-2): one per person, at their
// own address, theirs alone to open, change and close (/calls/room); and the
// passcode's unlock a guest asks for at its address (/public/r/<slug>).

/** A member's room as they see it (business/CallRoom's Room). */
export type MyRoom = {
  meeting_id: string
  /** The call's room ("meet-<meeting id>"). */
  room: string
  title: string
  slug: string
  /** Where guests come in, "/r/<slug>"; "" while an admin has its link off. */
  address: string
  /** Whether a guest needs a passcode to come in. */
  passcode: boolean
  /** Whether guests wait in the lobby until someone lets them in. */
  guests_wait: boolean
  /** Whether its address answers now: guest access and personal rooms are on. */
  on: boolean
}

/** What a member changes, each only when sent; passcode "" takes it off. */
export type RoomChanges = { slug?: string; passcode?: string; guests_wait?: boolean }

/** The member's room's route, also its read's cache key. */
export const MY_ROOM = "/calls/room"

const roomOf = (res: { data: unknown }) => (res.data as { data: MyRoom }).data

/** Opens the member's room: the one they have, or a new one at their name. */
export const openMyRoom = async (): Promise<MyRoom> => roomOf(await axiosInstance.post(MY_ROOM, {}, OWN_ERRORS))

/** Changes the member's room, all of it or none. */
export const changeMyRoom = async (changes: RoomChanges): Promise<MyRoom> => roomOf(await axiosInstance.patch(MY_ROOM, changes, OWN_ERRORS))

/** Closes the member's room: its address stops answering at once. */
export const closeMyRoom = async (): Promise<void> => {
  await axiosInstance.delete(MY_ROOM, OWN_ERRORS)
}

/** A room's passcode, tried for its unlock: the token its page carries, and how long it lasts. */
export const unlockRoom = (slug: string, passcode: string) =>
  publicCall<{ token: string; expires_in: number }>(`/public/r/${encodeURIComponent(slug)}/unlock`, { method: "POST", body: JSON.stringify({ passcode }) })
