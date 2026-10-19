/**
 * Runs `run` once the browser has a quiet moment (requestIdleCallback, at most
 * `timeoutMs` later), or after a short wait where there is no such call:
 * work that should never slow the first screen, such as fetching a library
 * the page needs only later. Returns a cancel that drops it if it hasn't run.
 */
export function whenIdle(run: () => void, timeoutMs = 2500): () => void {
  if (typeof window === "undefined") return () => {}
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: timeoutMs })
    return () => window.cancelIdleCallback(id)
  }
  const t = window.setTimeout(run, Math.min(timeoutMs, 1200))
  return () => window.clearTimeout(t)
}
