"use client"

// Following a presenter on a board (miro-21 3), one copy for a member's board (boardFacilitation) and a share link's
// guest (components/guest/GuestBoardViewer): every editor presenting is found through the relay's stamp
// (lib/board/presenting). This screen follows the first it hasn't said no to, showing what they show fitted to it
// from the moment following starts. A presenter who holds everyone takes back those who said no, and a move of this
// screen's own comes back to their view once the board settles; without a hold, moving the board yourself (a press
// or a scroll on it) stops following, as in Miro.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useBoardView } from "@/hooks/useBoardView"
import { presentersIn, type PresenceStates, type Presenter } from "@/lib/board/presenting"
import { followScene, viewOf } from "@/lib/board/viewport"

/** A board's awareness, as following a presenter reads it: everyone's states, and their changes. */
type Live = PresenceStates & { on(event: "change", cb: () => void): void; off(event: "change", cb: () => void): void }

/**
 * `presenting`: this screen presents, so it follows no one. `watching`: the caller draws over the board (vote dots),
 * so the board's view is read while it does, as it is while presenting or following, and handed back as `view`.
 */
export function usePresenterFollow(api: ExcalidrawImperativeAPI | null, awareness: Live | null | undefined, { presenting = false, watching = false } = {}) {
  const [presenters, setPresenters] = React.useState<Presenter[]>([])
  const [following, setFollowing] = React.useState<number | null>(null)
  // Where the board is looking: off the rest of the time, so a pan costs nothing.
  const view = useBoardView(api, watching || presenting || following !== null)
  const declined = React.useRef<Set<number>>(new Set())

  React.useEffect(() => {
    const read = () => setPresenters(presentersIn(awareness))
    read()
    awareness?.on("change", read)
    return () => awareness?.off("change", read)
  }, [awareness])

  // Someone starts presenting: follow them, unless we already said no to them. A presenter who holds everyone
  // takes back those who said no.
  const presenter = presenters.find((p) => p.clientId === following) ?? null
  const held = !!presenter?.hold
  React.useEffect(() => {
    if (presenting) return
    if (following !== null && !presenters.some((p) => p.clientId === following)) setFollowing(null)
    if (following === null) {
      const next = presenters.find((p) => p.hold || !declined.current.has(p.clientId))
      if (next) setFollowing(next.clientId)
    }
  }, [presenters, following, presenting])

  // Follow: show what they show, fitted to this screen as the board has it now, from the moment following starts.
  React.useEffect(() => {
    if (!presenter || !api) return
    const next = followScene(presenter.view, viewOf(api.getAppState()))
    if (next) api.updateScene({ appState: next })
  }, [presenter, api])

  // Held, a move of our own comes back to the presenter's view once the board settles.
  React.useEffect(() => {
    if (!held || !presenter || !view || !api) return
    const next = followScene(presenter.view, view)
    if (!next) return
    const t = setTimeout(() => api.updateScene({ appState: next }), 250)
    return () => clearTimeout(t)
  }, [held, presenter, view, api])

  // Moving the board yourself stops following, as in Miro, unless the presenter holds everyone.
  const stopFollowing = React.useCallback(() => {
    if (held) return
    if (following !== null) declined.current.add(following)
    setFollowing(null)
  }, [following, held])
  React.useEffect(() => {
    if (following === null || held) return
    const canvas = document.querySelector(".excalidraw") as HTMLElement | null
    if (!canvas) return
    const stop = () => stopFollowing()
    canvas.addEventListener("wheel", stop, { passive: true })
    canvas.addEventListener("pointerdown", stop)
    return () => {
      canvas.removeEventListener("wheel", stop)
      canvas.removeEventListener("pointerdown", stop)
    }
  }, [following, stopFollowing, held])

  /** Follow this presenter (a Follow press takes back a no said to them), or no one (this screen starts presenting). */
  const follow = React.useCallback((p: Presenter | null) => {
    if (p) declined.current.delete(p.clientId)
    setFollowing(p ? p.clientId : null)
  }, [])

  return { presenters, presenter, held, view, follow, stopFollowing }
}
