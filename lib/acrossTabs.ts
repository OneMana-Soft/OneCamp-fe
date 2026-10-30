/**
 * Work one tab at a time, across every tab of this browser (Web Locks): the
 * session refresh (lib/auth/sessionRefreshRun) and the offline outbox's
 * replay (lib/offline/engine) each hold a lock by name while they run, so a
 * second tab waits, then sees what the first one did.
 *
 * Where there is no lock to take (an older Safari, some embedded webviews,
 * the desktop app's webview, a sandboxed page whose request is refused), the
 * work runs in this tab alone, and never fails for the lock's sake: only the
 * work's own failure fails it.
 */
export async function acrossTabs<T>(name: string, run: () => Promise<T>): Promise<T> {
  let locks: LockManager | undefined
  try {
    locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  } catch {
    locks = undefined
  }
  if (!locks || typeof locks.request !== "function") return run()
  let ran = false
  try {
    return (await locks.request(name, () => {
      ran = true
      return run()
    })) as T
  } catch (e) {
    // The work failed under the lock: that is the answer.
    if (ran) throw e
    // The lock itself was refused: run in this tab alone.
    return run()
  }
}
