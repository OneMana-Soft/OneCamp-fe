"use client"

// A board's frames as a deck, live (lib/calls/slides deckOf): the frames in the
// order the Frames panel keeps in the board's boardMeta, for everyone, as they
// are drawn, renamed, deleted and reordered. One reader for the Frames panel,
// a call's stage's slides (components/livekit/stageSlides) and a board's own
// slides (components/board/boardSlides).

import * as React from "react"
import type * as Y from "yjs"
import { useSceneElements } from "@/hooks/useSceneElements"
import { frameOrderOf } from "@/lib/board/frames"
import { deckOf, type SceneFrame, type Slide } from "@/lib/calls/slides"

/** The frames' order the board keeps (the Frames panel's), live for everyone; null when none is kept. */
export function useFrameOrder(doc: Y.Doc | undefined): string[] | null {
  // Read at once, so a deck asked for as it mounts (Present's first slide) is in the kept order from the start.
  const [order, setOrder] = React.useState<string[] | null>(() => (doc ? frameOrderOf(doc.getMap<unknown>("boardMeta")) : null))
  React.useEffect(() => {
    if (!doc) return
    const meta = doc.getMap<unknown>("boardMeta")
    const read = () => setOrder(frameOrderOf(meta))
    read()
    meta.observe(read)
    return () => meta.unobserve(read)
  }, [doc])
  return order
}

/** The board's frames as slides, in the Frames panel's order, read again only when the scene changes (a pan is no change). */
export function useBoardDeck(api: Parameters<typeof useSceneElements>[0], doc: Y.Doc | undefined): Slide[] {
  const elements = useSceneElements<SceneFrame>(api)
  const order = useFrameOrder(doc)
  return React.useMemo(() => deckOf(elements, order), [elements, order])
}
