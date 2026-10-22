// fetch to this workspace's API as the API client (lib/axiosInstance) sends:
// with the session's cookies and WEB_CLIENT_HEADERS, the CSRF token on a write,
// keeping the token each answer names, and once more when a write was refused
// for want of it. Every credentialed fetch goes through here
// (lib/http/credentialedRequests.test.ts).
import { CSRF_HEADER, WEB_CLIENT_HEADERS, csrfToken, isWrite, noteCsrfToken, refusedForAnOldToken } from "@/lib/http/csrfToken"

/** path on the API, whatever slashes NEXT_PUBLIC_BACKEND_URL and path have. */
const backendURL = (path: string) => `${(process.env.NEXT_PUBLIC_BACKEND_URL || "/").replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const write = isWrite(init.method)
  const send = async () => {
    const headers = new Headers(init.headers)
    for (const [k, v] of Object.entries(WEB_CLIENT_HEADERS)) headers.set(k, v)
    const sent = write ? csrfToken() : ""
    if (sent) headers.set(CSRF_HEADER, sent)
    const res = await fetch(backendURL(path), { ...init, headers, credentials: "include" })
    noteCsrfToken(res.headers)
    return { res, sent }
  }
  const first = await send()
  // A stream can't be sent twice.
  const again = write && refusedForAnOldToken(first.res.status, first.sent) && !(init.body instanceof ReadableStream)
  return again ? (await send()).res : first.res
}
