"use client"

import * as React from "react"

/** What the board's hooks read: Excalidraw's own API, or a test's stand-in. */
export interface SceneSource {
  getSceneElements(): readonly unknown[]
  onChange(listener: (elements: readonly unknown[], appState?: unknown) => void): () => void
}

const NONE: readonly never[] = []

/**
 * The board's elements as a person sees them (none deleted), read again only
 * when they change: Excalidraw hands its listeners the same array until the
 * scene changes, so a pan or a zoom re-reads nothing and renders nothing.
 * For what a bar or a panel shows of the board (the Frames panel's rows, the
 * notes bar's colours, a frame's notes to make into tasks). A part shown only
 * some of the time (the board's map) passes enabled=false while it's hidden:
 * nothing is read or listened to, and it gets none, as with useBoardView.
 */
export function useSceneElements<T = unknown>(api: SceneSource, enabled = true): readonly T[] {
  const [elements, setElements] = React.useState(() => (enabled ? (api.getSceneElements() as readonly T[]) : NONE))
  React.useEffect(() => {
    if (!enabled) return
    setElements(api.getSceneElements() as readonly T[])
    let last: readonly unknown[] | null = null
    return api.onChange((els) => {
      if (els === last) return
      last = els
      setElements(api.getSceneElements() as readonly T[])
    })
  }, [api, enabled])
  return enabled ? elements : NONE
}
