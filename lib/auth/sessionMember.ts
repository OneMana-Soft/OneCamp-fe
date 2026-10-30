import { backendFetch } from "@/lib/http/backendFetch"
import { refreshSession } from "@/lib/auth/sessionRefresh"
import { within } from "@/lib/auth/probe"
import { displayNameOf } from "@/lib/personName"

/** Someone signed in here, as their profile names them. */
export type SessionMember = { uuid: string; name: string }

/** What the session check found: whether somebody is signed in here, and who, when the answer says. */
export type SessionCheck = { signedIn: boolean; member: SessionMember | null }

const NOBODY: SessionCheck = { signedIn: false, member: null }

/**
 * The session check: is somebody signed in here, and who.
 *
 * The session's cookies are the API host's own and HttpOnly, so no page can
 * read them: only a credentialed read of the API can tell. This reads the
 * profile, and on a 401 (an access token gone stale) takes the session's one
 * refresh, shared with the app and every tab (lib/auth/sessionRefresh: a
 * refresh token used twice signs the device out), then reads it again. The
 * whole check stops within PROBE_TIMEOUT_MS: no answer is nobody.
 *
 * Plain fetch (backendFetch), never the app's axiosInstance: its 401
 * interceptor would run a refresh and sign-out cascade (a logout request,
 * storage cleared, a redirect) for every visitor without a session. Any
 * success is signed in, as AuthService.hasActiveSession always answered; the
 * member is named when the answer names them. Never throws.
 */
export async function checkSession(): Promise<SessionCheck> {
  const check = async (signal: AbortSignal): Promise<SessionCheck> => {
    const read = async (): Promise<Response | null> => {
      try {
        return await backendFetch(`user/profile`, { method: "GET", cache: "no-store", signal })
      } catch {
        return null // the server is away: nobody
      }
    }
    let res = await read()
    if (res?.status === 401) {
      try {
        await refreshSession()
        res = await read()
      } catch {
        /* the refresh was refused or couldn't be asked: nobody */
      }
    }
    if (!res || res.status < 200 || res.status >= 300) return NOBODY
    const body = (await res.json().catch(() => null)) as { data?: { user_uuid?: string } & Parameters<typeof displayNameOf>[0] } | null
    const uuid = body?.data?.user_uuid
    return { signedIn: true, member: uuid ? { uuid, name: displayNameOf(body.data) } : null }
  }
  try {
    return await within(check)
  } catch {
    return NOBODY
  }
}

/** Who is signed in here, or null: nobody, or an answer that names nobody. */
export async function activeMember(): Promise<SessionMember | null> {
  return (await checkSession()).member
}
