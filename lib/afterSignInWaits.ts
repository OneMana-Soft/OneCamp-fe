/**
 * What the app shell and the connect page need of lib/afterSignIn before
 * anything waits: its key, whether something waits, and the connect page's id
 * check. Small, so both first loads carry only this; lib/afterSignIn loads
 * when something is kept or taken.
 */

export const AFTER_SIGN_IN_KEY = "oc.afterSignIn"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isConnectRequestId(id: string | null | undefined): id is string {
  return !!id && UUID.test(id)
}

/** Whether something started while signed out waits for this sign-in. */
export function afterSignInWaits(): boolean {
  try {
    return sessionStorage.getItem(AFTER_SIGN_IN_KEY) !== null
  } catch {
    return false
  }
}
