"use client"

import * as React from "react"
import { whenSceneReady } from "@/lib/board/scene"

interface SceneLoader {
  getAppState(): { isLoading: boolean }
}

/**
 * Whether this Excalidraw has finished loading its own scene. Until it has,
 * anything put on the canvas is wiped when it does (lib/board/scene,
 * whenSceneReady), so a board's drawing and camera wait for this: the member's
 * canvas and a guest's view alike.
 */
export function useSceneReady(api: SceneLoader | null): boolean {
  // Ready for which api: a new one (Excalidraw remounted) starts unready.
  const [readyFor, setReadyFor] = React.useState<SceneLoader | null>(null)
  React.useEffect(() => {
    if (!api) return
    return whenSceneReady(() => api.getAppState().isLoading, () => setReadyFor(api))
  }, [api])
  return api !== null && readyFor === api
}
