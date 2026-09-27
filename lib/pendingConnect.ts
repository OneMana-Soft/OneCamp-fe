/**
 * A sign-in an outside agent started while the person was signed out.
 *
 * Saved at the moment they choose to sign in, and picked up by the app shell
 * after any kind of login (password, SSO, a magic link), which all land on the
 * app rather than back on the approval page. Kept in sessionStorage so it
 * belongs to this tab and dies with it.
 *
 * Only an id is kept, and only a well-formed one is ever used, so the value
 * cannot be made into a redirect somewhere else.
 */

const KEY = "oc.pendingConnect"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isConnectRequestId(id: string | null | undefined): id is string {
  return !!id && UUID.test(id)
}

export function connectPath(id: string): string {
  return `/connect/authorize?request=${encodeURIComponent(id)}`
}

export function rememberPendingConnect(id: string): void {
  if (!isConnectRequestId(id)) return
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* private mode: the person starts the sign-in again from their agent */
  }
}

/** Returns the page to resume, once, or null. */
export function takePendingConnect(): string | null {
  try {
    const id = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return isConnectRequestId(id) ? connectPath(id) : null
  } catch {
    return null
  }
}
