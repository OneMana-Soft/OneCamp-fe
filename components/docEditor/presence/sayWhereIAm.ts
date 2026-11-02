"use client"

// Where this tab is looking, said only while someone follows it (presence/people: `following` and `view`), so a tab
// nobody follows sends nothing more. A doc says its top block (PresenceOverlay); a board says its camera
// (components/board/boardHereNow). One copy of the rule for both.

import * as React from "react"
import type { AwarenessLike } from "./live"
import { VIEW_FIELD } from "./fields"
import { followersOf } from "./people"

/** Where a tab is looking, read as it is asked, and a way to hear it move (returns how to stop hearing). */
export interface LookSource {
  read(): unknown
  listen(onMove: () => void): () => void
}

/**
 * While someone follows this tab, it says where it is looking (`read`) in its awareness `view`, again at most every
 * 120 ms as it moves, and never the same view twice in a row; when the last follower goes, or the tab closes, it says
 * nothing. `open` finds the source once mounted (a doc's scroller is there only then); null says nothing at all.
 */
export function useSayWhereIAm(awareness: AwarenessLike | null | undefined, open: () => LookSource | null) {
  React.useEffect(() => {
    const source = awareness ? open() : null
    if (!awareness || !source) return
    let watched = false
    let timer = 0
    let said = ""
    const say = () => {
      timer = 0
      if (!watched) return
      const view = source.read() ?? null
      const key = JSON.stringify(view)
      if (key === said) return
      said = key
      awareness.setLocalStateField(VIEW_FIELD, view)
    }
    const onMove = () => {
      if (watched && !timer) timer = window.setTimeout(say, 120)
    }
    const onChange = () => {
      const now = followersOf(awareness.getStates(), awareness.clientID).length > 0
      if (now === watched) return
      watched = now
      if (now) say()
      else {
        said = ""
        awareness.setLocalStateField(VIEW_FIELD, null)
      }
    }
    awareness.on("change", onChange)
    const unlisten = source.listen(onMove)
    onChange()
    return () => {
      awareness.off("change", onChange)
      unlisten()
      window.clearTimeout(timer)
      if (watched) awareness.setLocalStateField(VIEW_FIELD, null)
    }
  }, [awareness, open])
}
