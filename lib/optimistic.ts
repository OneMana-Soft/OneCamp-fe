/**
 * An optimistic write: the change shows at once, the request makes it, and a
 * request that fails puts back what was there.
 *
 * One helper for every store a screen keeps its copy in (React state, Redux,
 * the SWR cache): the caller says how to show the change (apply), how to take
 * it back (revert, usually by restoring what it read before applying) and how
 * to make it (commit, the request).
 *
 *     const before = status
 *     const r = await optimistic({
 *       key: `task:${id}:status`,
 *       apply: () => setStatus(next),
 *       revert: () => setStatus(before),
 *       commit: () => post.makeRequest({ ... }),
 *     })
 *     if (r.ok) ...
 *
 * It never throws, so a failed write leaves no uncaught rejection behind
 * (PTC-2: the task panel stayed Done and the page raised an error). It raises
 * no toast either: a failed write is said by its request (lib/axiosInstance,
 * hooks/usePost).
 *
 * Writes to one thing in quick succession (a status clicked to In progress,
 * then to Done) share a key. The thing then shows the latest of them that
 * hasn't failed, or what it showed before them all: a write that fails while
 * a later one is still going changes nothing on screen, and when the last of
 * them fails, the screen goes back to the last one that didn't.
 */

export type OptimisticResult<T> = { ok: true; value: T } | { ok: false; error: unknown }

export interface OptimisticWrite<T> {
  /** Shows the change, at once. */
  apply: () => void
  /** Makes it: the request. */
  commit: () => Promise<T>
  /** Takes the change back, to what was shown just before apply. */
  revert: () => void
  /** The thing written ("task:<id>:status"), for writes to it in quick succession. */
  key?: string
}

type Pending = { revert: () => void; state: "pending" | "ok" | "failed" }

/** The writes to each key not yet all answered, in the order they were made. */
const runs = new Map<string, Pending[]>()

export async function optimistic<T>({ apply, commit, revert, key }: OptimisticWrite<T>): Promise<OptimisticResult<T>> {
  const me: Pending = { revert, state: "pending" }
  let run: Pending[] | undefined
  if (key !== undefined) {
    run = runs.get(key) ?? []
    run.push(me)
    runs.set(key, run)
  }
  apply()
  try {
    const value = await commit()
    me.state = "ok"
    return { ok: true, value }
  } catch (error) {
    me.state = "failed"
    if (!run) {
      revert()
    } else {
      // Back to the latest write that hasn't failed, unless one after this
      // one is still showing (or was taken): undo from the first failure
      // after it, which saw that write's change as "before".
      let last = -1
      for (let i = run.length - 1; i >= 0; i--) {
        if (run[i].state !== "failed") {
          last = i
          break
        }
      }
      if (last < run.indexOf(me)) run[last + 1].revert()
    }
    return { ok: false, error }
  } finally {
    if (run && key !== undefined && run.every((w) => w.state !== "pending") && runs.get(key) === run) runs.delete(key)
  }
}
