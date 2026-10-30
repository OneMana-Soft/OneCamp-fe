"use client"

import * as React from "react"
import { movingByHand, selectedIn } from "@/lib/board/scene"
import type { SceneSource } from "@/hooks/useSceneElements"

type Watched = { id: string; version?: number; isDeleted?: boolean }

/**
 * A count that rises each time any element named by `ids` changes, for a part drawn on those elements: the bar
 * beside a selection, a note's tag chips (miro-06). Excalidraw moves, sizes and turns elements IN PLACE, frame by
 * frame, and keeps its array until a move ends (an arrow key's nudge never replaces it), so a part that reads again
 * only when the array changes (useSceneElements) is left where the elements were.
 *
 * It sums the elements' versions, which Excalidraw raises on every change: O(ids) a change of the board, and a walk
 * of the board only when its array is a new one. While elements move by hand it holds, and rises once as the move
 * ends; a part that rides on them (`duringMoves`) rises with every frame of it.
 */
export function useElementsChanged(api: SceneSource, ids: readonly string[], { duringMoves = false } = {}): number {
  const [count, setCount] = React.useState(0)
  React.useEffect(() => {
    if (ids.length === 0) return
    let scene: readonly unknown[] | null = null
    let watched: Watched[] = []
    const watch = (elements: readonly unknown[]) => {
      scene = elements
      watched = selectedIn(elements as readonly Watched[], ids)
    }
    const versions = () => {
      let v = 0
      for (const e of watched) v += e.version ?? 0
      return v
    }
    watch(api.getSceneElements())
    let seen = versions()
    return api.onChange((elements, appState) => {
      if (elements !== scene) watch(elements)
      if (!duringMoves && movingByHand(appState)) return
      const now = versions()
      if (now === seen) return
      seen = now
      setCount((n) => n + 1)
    })
  }, [api, ids, duringMoves])
  return count
}
