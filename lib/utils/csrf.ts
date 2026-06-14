/**
 * CSRF helpers for raw `fetch()` calls.
 *
 * Most of the app talks to the BE through the shared axios instance in
 * `@/lib/axiosInstance`, which echoes the `X-CSRF-Token` cookie back as
 * a header automatically (double-submit-cookie pattern). A handful of
 * call sites use the native `fetch` API instead — typically for
 * streaming responses (SSE) that axios doesn't expose cleanly — and
 * those must attach the CSRF header themselves, otherwise the BE
 * rejects the state-changing request with a 403.
 *
 * The BE sets the cookie on the shared parent domain (FE_DOMAIN), so it
 * is readable here via document.cookie. GET/HEAD/OPTIONS are exempt on
 * the BE, so callers only need this for POST/PUT/PATCH/DELETE.
 */

const CSRF_COOKIE_NAME = "X-CSRF-Token"
const CSRF_HEADER_NAME = "X-CSRF-Token"

/** Read the CSRF token the BE wrote into document.cookie. */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + CSRF_COOKIE_NAME + "=([^;]*)"),
  )
  return match ? decodeURIComponent(match[1]) : ""
}

/**
 * Merge the CSRF header into an existing headers object/Headers/array.
 * Returns a plain object suitable for `fetch`'s `headers` option. No-op
 * (besides copying) when no token is present, so it's safe to call
 * unconditionally.
 */
export function withCsrfHeader(
  headers?: HeadersInit,
): Record<string, string> {
  const out: Record<string, string> = {}

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
  } else if (headers) {
    Object.assign(out, headers)
  }

  const token = getCsrfToken()
  if (token) out[CSRF_HEADER_NAME] = token
  return out
}
