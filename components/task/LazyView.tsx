"use client"

import * as React from "react"

/**
 * A view loaded as a chunk of its own, without Suspense (work.md, the route's
 * size). next/dynamic shows its fallback through React's Suspense, which holds
 * a fallback on screen for a few hundred ms even when the chunk is already
 * in, and a tab switch paid that every time (the board tab went from 40 to
 * 570 ms). Here a loaded chunk renders at once; one still on its way shows
 * the fallback until it lands. warm() starts the load early (when idle).
 */
export function lazyView<M>(load: () => Promise<M>) {
  let mod: M | null = null
  let pending: Promise<M> | null = null
  /** The views drawn without the chunk: each is drawn again when it lands, whoever asked for it. */
  const waiting = new Set<() => void>()
  // A load that fails is forgotten, so the next warm() or View asks again:
  // kept, one failed fetch (offline for a moment) left the view unopenable.
  const warm = () =>
    (pending ??= load().then(
      (m) => {
        mod = m
        waiting.forEach((draw) => draw())
        return m
      },
      (e) => {
        pending = null
        throw e
      },
    ))
  function View({ render, fallback }: { render: (m: M) => React.ReactNode; fallback: React.ReactNode }) {
    const [, loaded] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
      if (mod) return
      waiting.add(loaded)
      return () => {
        waiting.delete(loaded)
      }
    }, [])
    // Each time it is drawn without the chunk, it asks for it: a failed load
    // keeps the fallback, and the next draw (or warm()) asks again. A load on
    // its way is asked for once.
    React.useEffect(() => {
      if (!mod) warm().catch(() => {})
    })
    return <>{mod ? render(mod) : fallback}</>
  }
  return { View, warm }
}
