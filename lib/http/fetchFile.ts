import { backendFetch } from "@/lib/http/backendFetch"

/** The API's address, without its trailing slashes ("" when unset). */
const backendBase = () => (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")

/**
 * A file's bytes from its address, for whatever makes a file out of the
 * pictures on a page (a board's export, a doc's Word file); null when they
 * can't be read: no answer, or an answer that isn't the file, such as a 404
 * page. A file on the API carries the session, so it goes through backendFetch
 * like every credentialed request (lib/http/credentialedRequests.test.ts);
 * anyone else's address gets none of our cookies.
 */
export async function fetchFile(url: string): Promise<Blob | null> {
  const base = backendBase()
  try {
    const res = base && url.startsWith(`${base}/`) ? await backendFetch(url.slice(base.length)) : await fetch(url)
    return res.ok ? await res.blob() : null
  } catch {
    return null
  }
}
