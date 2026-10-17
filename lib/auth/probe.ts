/**
 * How long a signed-out page waits for the server to answer a question it asks
 * before it can draw (is somebody signed in, which ways in are on, does this
 * server need an admin) before it goes on as if the answer were "no".
 *
 * Those questions had no limit, so an API that accepted the connection and then
 * hung left the sign-in page blank for good. Eight seconds is far past a slow
 * answer and short enough that the person is still there when the page shows.
 */
export const PROBE_TIMEOUT_MS = 8_000

/**
 * Runs `work` with a signal, and stops waiting for it after `ms`.
 *
 * The request is aborted, so a browser lets go of the connection, AND raced, so
 * work that ignores its signal (a body that never finishes, a stub in a test)
 * still stops being waited for. Rejects when the time is up; callers catch that
 * as they catch a failed request.
 */
export async function within<T>(work: (signal: AbortSignal) => Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`no answer within ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([work(controller.signal), timeUp])
  } finally {
    clearTimeout(timer)
  }
}
