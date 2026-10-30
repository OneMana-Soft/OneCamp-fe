import { publicCall } from "@/services/publicApi"
import { doorPath, type GuestDoor } from "@/services/guestDoor"

// A guest's knock on a meeting's lobby (CALLS-2), once joining answered
// { waiting, ticket }, at the door they joined by: a link's token, or a
// personal room's address. Only components/guest/waitToBeLetIn loads these,
// with the first knock, so they aren't in a call page's first load.

/**
 * What came of a knock: waits up to 25 s on the server, then answers still
 * waiting, the call token once let in, a 403 with code "denied", or for a
 * room whose passcode changed meanwhile a 401 with code "locked". signal
 * stops the wait at once, when the guest leaves.
 */
export const answerGuestKnock = (door: GuestDoor, ticket: string, language?: string, signal?: AbortSignal) =>
  publicCall<{ token?: string; room?: string; waiting?: boolean }>(doorPath(door, `/knock/${encodeURIComponent(ticket)}`, { language }), signal ? { signal } : undefined)

/** A guest gives up waiting in the lobby. */
export const leaveGuestKnock = (door: GuestDoor, ticket: string) =>
  publicCall<{ left: boolean }>(doorPath(door, `/knock/${encodeURIComponent(ticket)}`), { method: "DELETE" })
