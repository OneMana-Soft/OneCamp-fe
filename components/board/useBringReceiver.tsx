"use client"

// Bring everyone here, received (miro-21 1): another editor's tab says where it looks, under a new id, and this screen
// shows that place once, fitted to it, with a toast that names who brought everyone and offers Go back. A bring made
// before this screen came, there at its first sync (presence/firstSync), is never shown. A member's board
// (boardHereNow) and a share link's guest (components/guest/GuestBoardViewer) both receive brings through it.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { bringsIn } from "@/lib/board/hereNow"
import { followScene, viewOf } from "@/lib/board/viewport"
import { useAtFirstSync } from "@/components/docEditor/presence/firstSync"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"

/** A board's awareness, as a bring is read from it. */
interface Live {
  clientID: number
  getStates(): Map<number, unknown>
  on(event: "change", cb: () => void): void
  off(event: "change", cb: () => void): void
}

/** The ids of the brings on the board now. */
function bringsThere(awareness: Live): ReadonlySet<string> {
  const ids = new Set<string>()
  bringsIn(awareness.getStates(), awareness.clientID, ids)
  return ids
}

/**
 * Shows each new bring once, from the board's first sync (`synced`: the collaboration's). `onBrought` runs first: a
 * follow that would take this screen straight back ends.
 */
export function useBringReceiver(awareness: Live | null | undefined, api: ExcalidrawImperativeAPI | null, synced: boolean, onBrought?: () => void) {
  const { toast } = useToast()
  const opened = useAtFirstSync(awareness, synced, bringsThere)
  const seen = React.useRef(new Set<string>())
  const brought = React.useRef(onBrought)
  brought.current = onBrought
  React.useEffect(() => {
    if (!awareness || !api || !opened) return
    for (const id of opened) seen.current.add(id)
    const onChange = () => {
      for (const b of bringsIn(awareness.getStates(), awareness.clientID, seen.current)) {
        const s = api.getAppState()
        const back = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }
        brought.current?.()
        const next = followScene(b.view, viewOf(s))
        if (next) api.updateScene({ appState: next })
        toast({
          title: `${b.name || "Someone"} brought everyone here`,
          action: (
            <ToastAction altText="Go back to where you were" onClick={() => api.updateScene({ appState: back })}>
              Go back
            </ToastAction>
          ),
        })
      }
    }
    // One made since the first sync, before this screen could show it (its drawing came later), shows now.
    onChange()
    awareness.on("change", onChange)
    return () => awareness.off("change", onChange)
  }, [awareness, api, toast, opened])
}
