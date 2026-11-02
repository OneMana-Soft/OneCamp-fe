"use client"

// "Here now" on a board (miro-04 4): the presence stack's list (components/
// docEditor/presence/PresenceList) gets a board's people and, for each, Jump to
// and Follow, as a doc's does. Who is here goes through the doc's one reader
// (presence/read: at most once a frame, published only on news), and this tab
// says its own idle state as a doc's tab does (presence/idle), so a board's
// people are grouped, ordered and idle by the doc's rules (presence/people).
// Jump to puts the person's pointer in the middle of this screen; Follow shows
// what they see, fitted to this screen, as a doc's Follow does (miro-21 2): this
// tab says whom it follows, and theirs says what it shows only while someone
// follows it (presence/sayWhereIAm); until it does, or from a tab that never
// says it, their pointer is kept in the middle. Following lasts until this
// person moves the board themselves (a press or a scroll on it), presses Escape
// or Stop, or the one followed leaves; the doc's following frame
// (presence/FollowFrame) says so all along.
// The list finds both by the board's bus key, the doc bus the page puts round
// its presence stack (lib/board/hereBus). The rules are in lib/board/hereNow, tested.
// The board's signals (components/board/boardSignals, miro-24: reactions and
// raised hands) are offered on the same control, for the React button and
// Here now's queue, and rise in a layer drawn here.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { setPresenceControl } from "@/components/docEditor/presence/control"
import { FollowFrame, type FollowLeader } from "@/components/docEditor/presence/FollowFrame"
import { usePublishIdle } from "@/components/docEditor/presence/idle"
import { FOLLOWING_FIELD } from "@/components/docEditor/presence/fields"
import { readPresence } from "@/components/docEditor/presence/read"
import { useSayWhereIAm, type LookSource } from "@/components/docEditor/presence/sayWhereIAm"
import { onEscape } from "@/lib/keys/onEscape"
import { BRING_FIELD, centreOn, pointerOf, viewOfTab } from "@/lib/board/hereNow"
import { boardBusOf } from "@/lib/board/hereBus"
import { followScene, viewOf } from "@/lib/board/viewport"
import { useBringReceiver } from "@/components/board/useBringReceiver"
import { useBoardSignalsLater } from "@/components/board/boardSignalsLater"
import { useToast } from "@/hooks/use-toast"

type Change = { added: number[]; updated: number[]; removed: number[] }

const nameOf = (leader: FollowLeader) => leader.name || "them"

/**
 * Here now's Jump to and Follow for everyone on a board, and the following
 * frame over its canvas. `host` is the board page's own element: following
 * stops when this person presses or scrolls the canvas inside it. `synced`:
 * the collaboration's sync; what was there at the first one is never news.
 */
export function BoardHereNow({ provider, api, boardId, host, editable = false, synced }: { provider: HocuspocusProvider; api: ExcalidrawImperativeAPI | null; boardId: string; host: HTMLElement | null; editable?: boolean; synced: boolean }) {
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

  // What they show, fitted to this screen, once their tab says it; until then, their pointer.
  const show = React.useCallback(
    (client: number) => {
      const view = awareness ? viewOfTab(awareness.getStates(), client) : null
      if (!view || !api) return jump(client)
      const next = followScene(view, viewOf(api.getAppState()))
      if (next) api.updateScene({ appState: next })
      return true
    },
    [awareness, api, jump],
  )

  // Following: what they show kept on this screen as it changes; who they are kept from when it started.
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
      else if (updated.includes(client)) show(client)
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
  }, [followed, awareness, show, host, stop])

  // This tab says whom it follows, so that tab says what it shows (presence/people); and says it no more after.
  React.useEffect(() => {
    if (!awareness) return
    const now = followed?.client ?? null
    if ((awareness.getLocalState()?.[FOLLOWING_FIELD] ?? null) !== now) awareness.setLocalStateField(FOLLOWING_FIELD, now)
  }, [awareness, followed])

  // While someone follows this tab, it says what it shows: its camera, as the board moves; while it follows someone
  // itself, the view it follows, as their tab said it. So a chain shows the first one's view, not each screen's fit of
  // the last, and two people following each other on screens of different shapes settle at once (a view fitted to the
  // screen it came from is itself) instead of widening every round trip down to the zoom floor (CR-162, F1).
  const followingRef = React.useRef<number | null>(null)
  followingRef.current = followed?.client ?? null
  const look = React.useCallback((): LookSource | null => {
    if (!api || !awareness) return null
    return {
      read: () => {
        const leader = followingRef.current
        return (leader !== null ? viewOfTab(awareness.getStates(), leader) : null) ?? viewOf(api.getAppState())
      },
      listen: (onMove) => {
        const offScroll = api.onScrollChange(onMove)
        const offChange = api.onChange(onMove)
        // Whom it follows, and what they say they show, change what it says too.
        awareness.on("change", onMove)
        return () => {
          offScroll()
          offChange()
          awareness.off("change", onMove)
        }
      },
    }
  }, [api, awareness])
  useSayWhereIAm(awareness, look)

  const follow = React.useCallback(
    (client: number | null) => {
      if (client === null) {
        if (followed) stop(`Stopped following ${nameOf(followed.leader)}`)
        return
      }
      const leader = (awareness?.getStates().get(client) as { user?: FollowLeader | null } | undefined)?.user ?? {}
      show(client)
      setFollowed({ client, leader })
      setSaid(`Following ${nameOf(leader)}. Press Esc to stop.`)
    },
    [awareness, followed, show, stop],
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
  // Another tab's bring (components/board/useBringReceiver): a follow here would take this screen straight back, so it ends.
  const unfollow = React.useCallback(() => setFollowed(null), [])
  useBringReceiver(awareness, api, synced, unfollow)

  // Reactions and raised hands (miro-24), for everyone on the board; lowering someone's is an editor's. Their code loads
  // on the first one anyone sends or this person makes (components/board/boardSignalsLater).
  const { react, hand, lower, layer } = useBoardSignalsLater(awareness, editable, synced)

  React.useEffect(() => {
    setPresenceControl(key, { jump, follow, following: followed?.client ?? null, bringAll: editable ? bringAll : undefined, react, hand, lower })
  }, [key, jump, follow, followed, editable, bringAll, react, hand, lower])
  React.useEffect(() => () => setPresenceControl(key, null), [key])

  return (
    <>
      {/* Under the board's own top bar (its tools sit at the top centre). */}
      <FollowFrame leader={followed?.leader ?? null} said={said} onStop={() => follow(null)} className="top-[4.25rem]" />
      {layer}
    </>
  )
}
