/**
 * Work done in short slices, so a 5,000-block version never holds the page
 * for one long task (G-PERF): each slice runs until its budget is spent, then
 * yields to the browser, which paints and answers keys before the next.
 *
 * The browser's own work counts too: every block put on the page is styled
 * before the next frame, so a slice also ends once it has shown MAX_SHOWN
 * blocks (copying a known version is fast enough to show thousands in 8 ms,
 * and the frame after cost 230 ms at 4x CPU).
 */

export interface SliceOptions {
  signal?: AbortSignal
  /** How long one slice may run, in ms. */
  sliceMs?: number
}

/** How a run of slices went: for the perf numbers. */
export interface SliceStats {
  slices: number
  longestSliceMs: number
}

const MAX_SHOWN = 200

const aborted = () => new DOMException("The preview was replaced", "AbortError")

/** Hands the thread back to the browser for a moment. */
function yieldToBrowser(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      ch.port1.close()
      resolve()
    }
    ch.port2.postMessage(null)
  })
}

/**
 * A slicer: `tick()` answers true while the slice still has time and room;
 * `shown(n)` counts blocks it put on the page; `next()` ends the slice and
 * yields. Throws an AbortError once the signal fires.
 */
export function slicer(opts: SliceOptions = {}) {
  const budget = opts.sliceMs ?? 8
  const stats: SliceStats = { slices: 1, longestSliceMs: 0 }
  let began = performance.now()
  let shown = 0
  const check = () => {
    if (opts.signal?.aborted) throw aborted()
  }
  return {
    stats,
    check,
    shown(n: number) {
      shown += n
    },
    tick: () => shown < MAX_SHOWN && performance.now() - began < budget,
    async next() {
      stats.longestSliceMs = Math.max(stats.longestSliceMs, performance.now() - began)
      await yieldToBrowser()
      check()
      stats.slices++
      shown = 0
      began = performance.now()
    },
    done() {
      stats.longestSliceMs = Math.max(stats.longestSliceMs, performance.now() - began)
      return stats
    },
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}
