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
  const warm = () => (pending ??= load().then((m) => (mod = m)))
  function View({ render, fallback }: { render: (m: M) => React.ReactNode; fallback: React.ReactNode }) {
    const [, loaded] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
      if (mod) return
      let live = true
      void warm().then(() => live && loaded())
      return () => {
        live = false
      }
    }, [])
    return <>{mod ? render(mod) : fallback}</>
  }
  return { View, warm }
}
