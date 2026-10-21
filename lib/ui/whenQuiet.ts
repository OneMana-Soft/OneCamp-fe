"use client"

import { isScrolling, watchScrolling } from "@/lib/ui/scrollState"

/**
 * Work the page can put off (a preload) waits for a quiet spell: QUIET_MS with
 * no press, key, wheel or touch, and no scroll. Then each task runs in an idle
 * moment of its own, the next once the last has settled, so no chunk's
 * evaluation lands on the frames of something a person just did.
 *
 * The right panel's preload, started by the first key, fetched and ran 820 KB
 * of code in the middle of the calendar's open (G then K): long frames of
 * 129-164 ms, and the open 100 ms slower (FLUIDITY-LEAD, 20 Oct 2026).
 */

/** How long the page must go without input before put-off work starts: past the next key of a two-key shortcut and the open it starts. */
export const QUIET_MS = 1000

let lastInput = Number.NEGATIVE_INFINITY
let listening = false

function listen() {
  if (listening || typeof window === "undefined") return
  listening = true
  watchScrolling()
  const mark = () => {
    lastInput = performance.now()
  }
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"] as const) window.addEventListener(type, mark, { capture: true, passive: true })
}

const idle = (cb: () => void): number => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 0))

function cancelIdle(id: number) {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id)
  window.clearTimeout(id)
}

/**
 * Runs `tasks` one at a time, each once the page is quiet and idle; a task's
 * promise is waited for (and its failure ignored) before the next. Returns a
 * cancel that stops the ones not yet started.
 */
export function runWhenQuiet(tasks: ReadonlyArray<() => unknown>, quietMs = QUIET_MS): () => void {
  listen()
  let next = 0
  let timer = 0
  let idleId = 0
  let stopped = false
  // The spell counts from the call as well: a caller started by a press (the
  // panels' preload) runs inside that press's dispatch, before any listener
  // added now could see it.
  const startedAt = performance.now()
  const busyFor = () => (isScrolling() ? 50 : Math.max(lastInput, startedAt) + quietMs - performance.now())
  const step = (): void => {
    if (stopped || next >= tasks.length) return
    const wait = busyFor()
    if (wait > 0) {
      timer = window.setTimeout(step, wait)
      return
    }
    idleId = idle(() => {
      if (stopped) return
      // Someone pressed or scrolled while the idle moment was coming.
      if (busyFor() > 0) return step()
      let done: unknown
      try {
        done = tasks[next++]()
      } catch {
        done = undefined
      }
      void Promise.resolve(done).then(step, step)
    })
  }
  step()
  return () => {
    stopped = true
    window.clearTimeout(timer)
    cancelIdle(idleId)
  }
}
