import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * A function whose identity never changes but which always calls the latest
 * `fn`. Lets a memoised child take handlers that its parent recreates on every
 * render (a thread panel re-renders on each keystroke of its composer) without
 * re-rendering, and without ever calling a stale closure.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
