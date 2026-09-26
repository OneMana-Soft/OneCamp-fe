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

type Forget = () => void | Promise<void>

const forgetters = new Set<Forget>()

/** Register how to drop something kept for the signed-in member. Returns the unregister. */
export function onSessionEnd(forget: Forget): () => void {
  forgetters.add(forget)
  return () => {
    forgetters.delete(forget)
  }
}

/** Drop everything kept for the member. Every forgetter runs, even when another fails. */
export async function endSession(): Promise<void> {
  await Promise.allSettled([...forgetters].map(async (forget) => forget()))
}
