"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * A layout effect that runs once for each value of `key`, and never again for
 * the same one.
 *
 * WHY. React runs a component's layout effects again, deps unchanged, when a
 * Suspense boundary above it hides and then shows it again. A chunk that
 * suspends while it loads (a dialog behind next/dynamic with no boundary of
 * its own) hides everything under the nearest boundary, often the route's
 * loading.tsx, and shows it again once the chunk is in. A task list that
 * cleared its shared store slot "on mount" in a plain layout effect cleared it
 * again then, and stayed empty: the answer it refills the slot from had not
 * changed, so nothing refilled it. On 11 Oct, opening a project's Forms or
 * Time left the list behind a skeleton until a reload.
 */
export function useLayoutOnce(key: unknown, run: () => void) {
  const ran = useRef<{ key: unknown } | null>(null)
  useLayoutEffect(() => {
    if (ran.current && Object.is(ran.current.key, key)) return
    ran.current = { key }
    run()
    // `run` is read when the key changes, as an effect with [key] would read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
