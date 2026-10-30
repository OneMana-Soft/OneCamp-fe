import { answerGuestKnock, leaveGuestKnock } from "@/services/guestKnock"
import type { GuestDoor } from "@/services/guestDoor"
import { publicTrouble } from "@/services/publicApi"

/** What a guest reads when someone running the meeting didn't let them in from its lobby. */
export const GUEST_DENIED = "Someone running the meeting didn't let you in. Ask the host if you think that's a mistake."

/** A wait for a busy server that ends at once when the guest leaves. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const t = window.setTimeout(done, ms)
    signal.addEventListener("abort", () => (window.clearTimeout(t), done()), { once: true })
  })
}

/**
 * A guest waits in a meeting's lobby (CALLS-2) until someone running the call
 * answers their knock at the door they came in by: the call's token once let
 * in, "gone" when the link stopped working, "locked" when a room's passcode
 * changed meanwhile, "left" when the guest gave up (signal). Turned away, it
 * throws GUEST_DENIED for the green room to say. A busy server is asked again
 * in a moment. Loaded with the first knock, so none of the page's first load.
 */
export async function waitToBeLetIn(door: GuestDoor, ticket: string, language: string | undefined, signal: AbortSignal): Promise<{ token: string } | "gone" | "locked" | "left"> {
  for (;;) {
    const a = await answerGuestKnock(door, ticket, language, signal)
    if (signal.aborted) return "left"
    if (a.ok && a.data?.token) return { token: a.data.token }
    if (a.ok) continue
    if (a.status === 403 && a.code === "denied") throw new Error(GUEST_DENIED)
    if (a.status === 401 && a.code === "locked") return "locked"
    if (publicTrouble(a.status) === "gone") return "gone"
    await pause(2000, signal)
    if (signal.aborted) return "left"
  }
}

/** Gives up waiting: the server forgets the knock, and nobody is asked about it. */
export const leaveLobby = (door: GuestDoor, ticket: string) => void leaveGuestKnock(door, ticket)
