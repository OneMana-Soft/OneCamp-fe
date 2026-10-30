/**
 * A load made once: every call answers the same promise, so a chunk is asked
 * for once however many places want it. A load that fails is forgotten, so
 * the next call asks again (a chunk that didn't come may come next time).
 */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = null
      throw error
    }))
}
