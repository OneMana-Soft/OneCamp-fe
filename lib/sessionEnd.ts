// Everything the browser holds for the signed-in member, let go of in one place
// when their session ends.
//
// WHY. Signing out cleared localStorage and then left the page, and leaving the
// page is exactly when the response cache writes itself down, so the member's
// profile, sidebar and activity were written straight back after the clear.
// Whoever signed in next on that browser was shown them before their own
// arrived. Each module that keeps something per member knows how to drop it;
// it registers that here, and every way a session ends (the member's own
// sign-out, or an expired session) calls endSession before storage is cleared
// and before the page is left.
//
// In every tab. The session is the browser's: signing out in one tab signs
// every tab out at the server, but the others kept the member's screens and
// realtime connection, and wrote the member's responses down again when they
// were hidden or closed. endSession tells the other tabs (a storage event,
// which reaches every other tab of the app and not the one that wrote it);
// each lets go of the same things, then leaves (onSessionEndedElsewhere).

type Forget = () => void | Promise<void>

const forgetters = new Set<Forget>()
const leavers = new Set<() => void>()

/** The key a tab writes to tell the others that the session has ended. */
export const SESSION_ENDED_KEY = "onecamp-session-ended"

/** Register how to drop something kept for the signed-in member. Returns the unregister. */
export function onSessionEnd(forget: Forget): () => void {
  forgetters.add(forget)
  return () => {
    forgetters.delete(forget)
  }
}

/**
 * Register what a tab does once the session has ended in another tab and
 * this one has let go of the member's things: leave the app. Returns the
 * unregister.
 */
export function onSessionEndedElsewhere(leave: () => void): () => void {
  leavers.add(leave)
  return () => {
    leavers.delete(leave)
  }
}

async function forgetAll(): Promise<void> {
  await Promise.allSettled([...forgetters].map(async (forget) => forget()))
}

/** Drop everything kept for the member. Every forgetter runs, even when another fails. */
export async function endSession(): Promise<void> {
  await forgetAll()
  try {
    // A new value each time: writing the one already there tells no one.
    localStorage.setItem(SESSION_ENDED_KEY, `${Date.now()}:${Math.random()}`)
  } catch {
    /* storage unavailable: there's no other tab's cache to protect either */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== SESSION_ENDED_KEY || !event.newValue) return
    void forgetAll().then(() => {
      for (const leave of leavers) {
        try {
          leave()
        } catch {
          /* the others still leave */
        }
      }
    })
  })
}
