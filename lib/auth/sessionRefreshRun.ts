/**
 * The refresh itself, loaded the first time one is needed (lib/auth/
 * sessionRefresh holds the clock and the single flight). It stays off every
 * route's first load: app/firstLoad.test keeps the project route under its
 * ceiling, which only goes down.
 *
 *   - Across tabs: a refresh holds a lock every tab shares (Web Locks). A tab
 *     that waited for the lock while another tab refreshed takes that refresh
 *     as its own instead of sending another: refresh tokens rotate, and one
 *     used twice signs the device out.
 *   - Where there is no lock to take (an older Safari, some embedded
 *     webviews, the desktop app's webview, a sandboxed page whose request is
 *     refused), it runs in this tab alone, and never fails for the lock's
 *     sake: only the refresh's own failure fails it.
 */
import axios from "axios"
import { WEB_CLIENT_HEADERS } from "@/lib/http/csrfToken"

/** A refresh that hangs gives up, so the lock and everyone waiting on it are let go. */
const REFRESH_TIMEOUT_MS = 15_000
const LOCK_NAME = "onecamp:session-refresh"

/** The asking tab's clock (lib/auth/sessionRefresh), passed in so a refresh always moves the clock that asked. */
interface RefreshClock {
  /** The issue time the tab knew when it asked. */
  knew: number
  /** The issue time some tab last kept, or null. */
  kept(): number | null
  /** Whether a cookie issued then is still fresh. */
  fresh(at: number): boolean
  /** Takes another tab's refresh as this tab's own. */
  adopt(at: number): void
  /** Keeps a refresh this tab made, for every tab. */
  keep(at: number): void
}

async function acrossTabs(run: () => Promise<void>): Promise<void> {
  let locks: LockManager | undefined
  try {
    locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  } catch {
    locks = undefined
  }
  if (!locks || typeof locks.request !== "function") return run()
  let ran = false
  try {
    await locks.request(LOCK_NAME, () => {
      ran = true
      return run()
    })
  } catch (e) {
    // The refresh failed under the lock: that is the answer.
    if (ran) throw e
    // The lock itself was refused: refresh in this tab alone.
    return run()
  }
}

/**
 * Refreshes the access cookie under the lock, unless another tab already
 * has since this one asked. Over fetch, as the sign-in page's own check sent
 * it: an answer that is never cached, and an AxiosError (a refused one
 * carries its 401) for the callers that tell refused from unreachable.
 */
export function runRefresh(clock: RefreshClock): Promise<void> {
  return acrossTabs(async () => {
    const kept = clock.kept()
    if (kept !== null && kept > clock.knew && clock.fresh(kept)) {
      clock.adopt(kept)
      return
    }
    await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}refreshToken`, {
      withCredentials: true,
      headers: { ...WEB_CLIENT_HEADERS },
      timeout: REFRESH_TIMEOUT_MS,
      adapter: "fetch",
      fetchOptions: { cache: "no-store" },
    })
    clock.keep(Date.now())
  })
}
