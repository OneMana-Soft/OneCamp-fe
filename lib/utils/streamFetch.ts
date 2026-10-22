/**
 * authedStreamFetch — a cookie-authenticated `fetch` for streaming (SSE)
 * endpoints, with the SAME 401 → refresh → retry-once behaviour the shared
 * axios instance provides.
 *
 * Why this exists: most requests go through `@/lib/axiosInstance`, whose
 * response interceptor transparently refreshes an expired access token and
 * retries. Streaming endpoints can't use axios (we need the readable body),
 * so they call native `fetch`. Without the refresh step, a streamed call made
 * after the short-lived `Authorization` cookie has expired (it lasts ~5 min)
 * fails with a hard 401 — even though the user is still logged in and a normal
 * axios call would have silently refreshed. That was the cause of the admin
 * "401 when installing an AI model" bug: the model picker is often open for
 * several minutes before Install is clicked, by which point the access cookie
 * has lapsed.
 *
 * Behaviour:
 *   - Goes through backendFetch: cookies, the CSRF token on a write, and one
 *     more try when the API refused it for a token that had run out.
 *   - On HTTP 401, refreshes the session once (the one refresh every path
 *     shares, lib/auth/sessionRefresh), then retries the original request once.
 *   - Never loops: at most one refresh+retry per call.
 *
 * It intentionally does NOT trigger a global logout on a failed refresh — the
 * caller surfaces the error in its own UI (toast/inline), and the next axios
 * request will drive the logout chain if the session is truly dead. This keeps
 * the helper focused and side-effect-free.
 */

import { backendFetch } from "@/lib/http/backendFetch"
import { refreshSession } from "@/lib/auth/sessionRefresh"

/**
 * The session's one refresh (lib/auth/sessionRefresh), shared with the API
 * client and every tab: a refresh of its own here could run beside theirs,
 * and a refresh token used twice signs the device out. True when it worked.
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    await refreshSession()
    return true
  } catch {
    return false
  }
}

interface AuthedStreamInit {
  method?: string
  /** JSON-serializable body; sent as application/json. Omit for GET. */
  jsonBody?: unknown
  /** Extra headers merged with Content-Type + CSRF. */
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Accept header; defaults to text/event-stream for SSE callers. */
  accept?: string
}

/**
 * Perform an authenticated streaming fetch with one transparent
 * refresh-and-retry on 401. `path` must be an absolute backend path
 * beginning with "/" (e.g. "/admin/ai/models/pull"). Returns the raw
 * Response so the caller can read `response.body` as a stream.
 */
export async function authedStreamFetch(
  path: string,
  init: AuthedStreamInit = {},
): Promise<Response> {
  const method = init.method ?? (init.jsonBody !== undefined ? "POST" : "GET")

  const buildRequest = (): RequestInit => ({
    method,
    headers: {
      ...(init.jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: init.accept ?? "text/event-stream",
      ...(init.headers ?? {}),
    },
    ...(init.jsonBody !== undefined ? { body: JSON.stringify(init.jsonBody) } : {}),
    signal: init.signal,
  })

  let resp = await backendFetch(path, buildRequest())

  // Access token likely expired — refresh once and retry, mirroring axios.
  if (resp.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      resp = await backendFetch(path, buildRequest())
    }
  }

  return resp
}
