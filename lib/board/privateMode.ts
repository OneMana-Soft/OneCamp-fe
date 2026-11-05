"use client"

// Private mode's gate (miro-25), all of it on the board's first load: its code (components/board/privateNotesHost)
// comes once a round runs or this browser kept a round's notes; till then a running round holds the frame's write.

import * as React from "react"
import type { Doc as YDoc } from "yjs"

/** The facilitation map's key for the running round. */
export const PRIVATE_KEY = "private"

/** Where a person's held notes on a board are kept. */
export const privateNotesKey = (boardId: string, userId: string) => `board-private:${boardId}:${userId}`

/** Each canvas's gate and handle by its scene's api: what lib/board/sceneOut reads to send the scene anywhere. */
export const privateViews = new WeakMap<object, { holds(): boolean; handle: { readonly current: unknown } }>()

/** `wanted` latches when the code is needed; `holds()` while a running round waits for it (`loaded` unset). */
export function usePrivateMode(yDoc: YDoc, key: string, loaded: { readonly current: unknown }, api?: object | null) {
  const map = React.useMemo(() => yDoc.getMap<unknown>("facilitation"), [yDoc])
  const [wanted, setWanted] = React.useState(false)
  React.useEffect(() => {
    const check = () => {
      let kept = false
      try {
        kept = localStorage.getItem(key) != null
      } catch {
        // No storage (a private window): nothing kept.
      }
      if (kept || map.has(PRIVATE_KEY)) setWanted(true)
    }
    check()
    map.observe(check)
    return () => map.unobserve(check)
  }, [map, key])
  const holds = React.useCallback(() => !loaded.current && map.has(PRIVATE_KEY), [map, loaded])
  React.useEffect(() => {
    if (api) privateViews.set(api, { holds, handle: loaded })
  }, [api, holds, loaded])
  return { wanted, holds }
}
