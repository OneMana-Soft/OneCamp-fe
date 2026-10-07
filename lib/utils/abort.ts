/**
 * Waiting that can be called off, for loops that ask the server until
 * something is ready (an AI draft, a long job) and must stop when the person
 * leaves.
 */

/** Resolves after ms, or rejects with an AbortError as soon as signal aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/** Whether an error only means the work was called off: a DOM abort or a cancelled axios request. */
export function isAbort(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name
  return name === "AbortError" || name === "CanceledError"
}
