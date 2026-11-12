"use client"

// Following a presenter on a board (miro-21 3), one copy for a member's board (boardFacilitation) and a share link's
// guest (components/guest/GuestBoardViewer): every editor presenting is found through the relay's stamp
// (lib/board/presenting). This screen follows the first it hasn't said no to, showing what they show fitted to it
// from the moment following starts. A presenter who holds everyone takes back those who said no, and a move of this
// screen's own comes back to their view once the board settles; without a hold, moving the board yourself (a press
// or a scroll on it) stops following, as in Miro. A presenter on a slide (miro-28, components/board/boardSlides) is
// followed to that frame, fitted to this screen (presentFrame), not to the box their view shows, which a phone would
// shrink; a slide not on this screen's board yet follows their view. The slide's code (presentFrame) comes in the
// slides' own chunk (boardSlides, which the caller loads for the slide bar anyway), through lib/loadChunk: one fetch,
// and presentFrame keeps one way in (lib/lazy/lazyStaticGuard). A deploy that took it reloads the page once; any
// other failure follows their view instead, and the caller shows the slides' failed part (slidesDock's SlidesFailed)
// with Try again, which asks for the same code again.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useBoardView } from "@/hooks/useBoardView"
import { presentersIn, type PresenceStates, type Presenter } from "@/lib/board/presenting"
import { followScene, viewOf } from "@/lib/board/viewport"
import { lazyChunk } from "@/lib/loadChunk"
import type { FrameHold } from "./presentFrame"

const frameCode = lazyChunk(() => import("./boardSlides"))

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

  // On a slide whose frame this screen's board has: that frame, fitted to this screen and held there as its room
  // changes. Its code comes only once a slide does, so no first load carries it.
  const slide = presenter?.slide ?? ""
  const slideHere = !!slide && !!api?.getSceneElements().some((e) => e.id === slide && !e.isDeleted)
  const slideHold = React.useRef<FrameHold | null>(null)
  // The slide's code failed (not a deploy): their view is followed until Try again, or the next slide, brings it.
  const [codeFailed, setCodeFailed] = React.useState(false)
  const [tries, setTries] = React.useState(0)
  const slideShown = slideHere && !codeFailed
  React.useEffect(() => {
    if (!api || !slideHere) return
    let gone = false
    void frameCode.use(() => !gone && setCodeFailed(true)).then((code) => {
      if (gone || !code) return
      setCodeFailed(false)
      slideHold.current = code.holdOnBoard(api)
      slideHold.current.show(slide, true)
    })
    return () => {
      gone = true
      slideHold.current?.stop()
      slideHold.current = null
    }
  }, [api, slide, slideHere, tries])
  const retrySlide = React.useCallback(() => setTries((n) => n + 1), [])

  // Follow: show what they show, fitted to this screen as the board has it now, from the moment following starts.
  React.useEffect(() => {
    if (!presenter || !api || slideShown) return
    const next = followScene(presenter.view, viewOf(api.getAppState()))
    if (next) api.updateScene({ appState: next })
  }, [presenter, api, slideShown])

  // Held, a move of our own comes back to the presenter's view, or their slide, once the board settles.
  React.useEffect(() => {
    if (!held || !presenter || !view || !api) return
    if (slideShown) {
      const t = setTimeout(() => slideHold.current?.show(slide, false), 250)
      return () => clearTimeout(t)
    }
    const next = followScene(presenter.view, view)
    if (!next) return
    const t = setTimeout(() => api.updateScene({ appState: next }), 250)
    return () => clearTimeout(t)
  }, [held, presenter, view, api, slide, slideShown])

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

  /** The followed slide's code failed (not a deploy): their view is followed, and `retrySlide` asks for it again. */
  const slideFailed = slideHere && codeFailed
  return { presenters, presenter, held, view, follow, stopFollowing, slideFailed, retrySlide }
}
