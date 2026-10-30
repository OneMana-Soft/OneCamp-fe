"use client"

import * as React from "react"
import { lazyChunk } from "@/lib/loadChunk"

/**
 * A view loaded as a chunk of its own, without Suspense (work.md, the route's
 * size). next/dynamic shows its fallback through React's Suspense, which holds
 * a fallback on screen for a few hundred ms even when the chunk is already
 * in, and a tab switch paid that every time (the board tab went from 40 to
 * 570 ms). Here a loaded chunk renders at once; one still on its way shows
 * the fallback until it lands. warm() starts the load early (when idle).
 * Its code comes through lazyChunk: a deploy reloads the page once, and warm() never settles meanwhile.
 */
export function lazyView<M>(load: () => Promise<M>) {
  const chunk = lazyChunk(load)
  let mod: M | null = null
  let pending: Promise<M> | null = null
  /** Whoever was drawn without the chunk: each is drawn again when it lands. */
  const waiting = new Set<() => void>()
  // A load that fails is forgotten, so the next warm() or View asks again:
  // kept, one failed fetch (offline for a moment) left the view unopenable.
  const warm = () =>
    (pending ??= new Promise<M>((land, fail) => {
      void chunk
        .use((e) => {
          pending = null
          fail(e)
        })
        .then((m) => {
          if (!m) return
          mod = m
          waiting.forEach((draw) => draw())
          land(m)
        })
    }))
  // Never throws: a failed load is tried again on the next draw.
  const prefetch = () => warm().then(
    () => undefined,
    () => undefined,
  )
  const subscribe = (draw: () => void) => {
    waiting.add(draw)
    return () => waiting.delete(draw)
  }
  /** The chunk once it's in, else null: a reader is drawn again when it lands, even between its draw and its effect. */
  function useLoaded(ask = true): M | null {
    const m = React.useSyncExternalStore(subscribe, () => mod, () => null)
    // Each time it is drawn without the chunk, it asks for it: a failed load
    // keeps the fallback, and the next draw (or warm()) asks again. A load on
    // its way is asked for once.
    React.useEffect(() => {
      if (ask && !mod) void prefetch()
    })
    return m
  }
  function View({ render, fallback }: { render: (m: M) => React.ReactNode; fallback: React.ReactNode }) {
    const m = useLoaded()
    return <>{m ? render(m) : fallback}</>
  }
  return { View, useLoaded, warm, prefetch }
}
