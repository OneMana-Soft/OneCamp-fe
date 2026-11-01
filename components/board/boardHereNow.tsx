"use client"

// "Here now" on a board (miro-04 4): the presence stack's list (components/
// docEditor/presence/PresenceList) gets a board's people and, for each, Jump to
// and Follow, as a doc's does. Who is here goes through the doc's one reader
// (presence/read: at most once a frame, published only on news), and this tab
// says its own idle state as a doc's tab does (presence/idle), so a board's
// people are grouped, ordered and idle by the doc's rules (presence/people).
// Jump to puts the person's pointer in the middle of this screen; Follow keeps
// it there as they move, until this person moves the board themselves (a
// press or a scroll on it), presses Escape or Stop, or the one followed
// leaves; the doc's following frame (presence/FollowFrame) says so all along.
// The list finds both by the board's bus key, the doc bus the page puts round
// its presence stack (boardBusOf). The rules are in lib/board/hereNow, tested.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { setPresenceControl } from "@/components/docEditor/presence/control"
import { FollowFrame, type FollowLeader } from "@/components/docEditor/presence/FollowFrame"
import { usePublishIdle } from "@/components/docEditor/presence/idle"
import { readPresence } from "@/components/docEditor/presence/read"
import { onEscape } from "@/lib/keys/onEscape"
import { BRING_FIELD, boardBusOf, bringsIn, centreOn, pointerOf } from "@/lib/board/hereNow"
import { followScene, viewOf } from "@/lib/board/viewport"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"

type Change = { added: number[]; updated: number[]; removed: number[] }

const nameOf = (leader: FollowLeader) => leader.name || "them"

/**
 * Here now's Jump to and Follow for everyone on a board, and the following
 * frame over its canvas. `host` is the board page's own element: following
 * stops when this person presses or scrolls the canvas inside it.
 */
export function BoardHereNow({ provider, api, boardId, host, editable = false }: { provider: HocuspocusProvider; api: ExcalidrawImperativeAPI | null; boardId: string; host: HTMLElement | null; editable?: boolean }) {
  const awareness = provider.awareness
  const key = boardBusOf(boardId).key

  usePublishIdle(awareness)
  React.useEffect(() => (awareness ? readPresence(key, awareness) : undefined), [awareness, key])

  const jump = React.useCallback(
    (client: number) => {
      const at = awareness ? pointerOf(awareness.getStates(), client) : null
      if (!at || !api) return false
      const s = api.getAppState()
      api.updateScene({ appState: centreOn({ width: s.width, height: s.height, zoom: s.zoom.value }, at) })
      return true
    },
    [awareness, api],
  )

  // Following: their pointer kept in the middle as it moves; who they are kept from when it started.
  const [followed, setFollowed] = React.useState<{ client: number; leader: FollowLeader } | null>(null)
  const [said, setSaid] = React.useState("")
  const stop = React.useCallback((why: string) => {
    setFollowed(null)
    setSaid(why)
  }, [])

  React.useEffect(() => {
    if (!followed || !awareness) return
    const { client, leader } = followed
    const onChange = ({ updated, removed }: Change) => {
      if (removed.includes(client)) stop(`${nameOf(leader)} left the board, so you're no longer following them`)
      else if (updated.includes(client)) jump(client)
    }
    awareness.on("change", onChange)
    // This person moving the board themselves ends it: a press or a scroll on its canvas.
    const stopped = () => stop(`Stopped following ${nameOf(leader)}`)
    const board = host?.querySelector(".excalidraw") ?? null
    board?.addEventListener("wheel", stopped, { passive: true })
    board?.addEventListener("pointerdown", stopped)
    // Escape through the page's one answer (lib/keys/escape): an open overlay above takes it first.
    const stopEscape = onEscape("page", stopped)
    return () => {
      awareness.off("change", onChange)
      board?.removeEventListener("wheel", stopped)
      board?.removeEventListener("pointerdown", stopped)
      stopEscape()
    }
  }, [followed, awareness, jump, host, stop])

  const follow = React.useCallback(
    (client: number | null) => {
      if (client === null) {
        if (followed) stop(`Stopped following ${nameOf(followed.leader)}`)
        return
      }
      const leader = (awareness?.getStates().get(client) as { user?: FollowLeader | null } | undefined)?.user ?? {}
      jump(client)
      setFollowed({ client, leader })
      setSaid(`Following ${nameOf(leader)}. Press Esc to stop.`)
    },
    [awareness, followed, jump, stop],
  )

  // Bring everyone here (miro-21 1): an editor's tab says where it looks, under a new id; every other tab on the
  // board shows that place once, fitted to its own screen, and can go back. Someone who comes later is never moved.
  const { toast } = useToast()
  const bringAll = React.useCallback(() => {
    if (!awareness || !api) return
    const s = api.getAppState()
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    awareness.setLocalStateField(BRING_FIELD, { id, view: viewOf(s) })
    toast({ title: "Everyone here now sees what you see" })
  }, [awareness, api, toast])
  const seen = React.useRef(new Set<string>())
  React.useEffect(() => {
    if (!awareness || !api) return
    bringsIn(awareness.getStates(), awareness.clientID, seen.current)
    const onChange = () => {
      for (const b of bringsIn(awareness.getStates(), awareness.clientID, seen.current)) {
        const s = api.getAppState()
        const back = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }
        setFollowed(null)
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
    awareness.on("change", onChange)
    return () => awareness.off("change", onChange)
  }, [awareness, api, toast])

  React.useEffect(() => {
    setPresenceControl(key, { jump, follow, following: followed?.client ?? null, bringAll: editable ? bringAll : undefined })
  }, [key, jump, follow, followed, editable, bringAll])
  React.useEffect(() => () => setPresenceControl(key, null), [key])

  // Under the board's own top bar (its tools sit at the top centre).
  return <FollowFrame leader={followed?.leader ?? null} said={said} onStop={() => follow(null)} className="top-[4.25rem]" />
}
