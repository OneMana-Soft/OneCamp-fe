"use client"

/**
 * Presence on a board: the people on it, live, as cursors with their names on
 * this canvas, and this tab's own name and pointer for theirs. It travels on
 * the board document's awareness, never stored: the board's own channel for
 * the pointers a call's board shows (calls package B). One copy, for a
 * member's canvas and a call's guest's.
 *
 * `publish` says whether this tab tells the others who it is and where it
 * points. A member's canvas always does. A call's guest does only while they
 * may draw (main, 27 Oct): a guest who only looks publishes nothing, and a
 * guest whose drawing is switched off takes their name and pointer back at
 * once. A view that closes takes nothing back itself: its session does, at
 * its last view (and a guest's socket closes then).
 *
 * Everyone else's cursor is read here (useRemoteCursors) and drawn over the
 * canvas by boardCursors.tsx, in each person's own colour.
 *
 * A laser everyone sees (miro-28, miro-10) is the pointer, as Excalidraw's own
 * collaboration sends it: its tool says "laser" and its button "down" while
 * it's held, going out at most once every INK_SEND_MS (lib/calls/laser), with
 * no stroke kept, so a hold of any length goes on. Everyone else's is read here
 * (useRemoteLasers) for Excalidraw's own trail for a collaborator, the one the
 * drawer sees of their own: it decays from its tail while held, the same on
 * every screen. Whoever publishes may laser; everyone who reads the awareness
 * sees it, by an opaque key and no name. Nothing is stored.
 */

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types"
import { INK_SEND_MS, laserTimers } from "@/lib/calls/laser"
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID"

/** Who this tab is to the others on the board. */
export interface PresenceUser {
  id: string
  name: string
  profileKey?: string
}

/** What Excalidraw's onPointerUpdate hands over on every move, press and release; `tool` is "laser" while its laser is out. */
export interface PointerUpdate {
  pointer: { x: number; y: number; tool?: "pointer" | "laser" }
  button: "down" | "up"
}

/** Someone else on the board, where they point (in the board's own coordinates). */
export interface RemoteCursor {
  key: string
  id?: string
  name: string
  pointer: { x: number; y: number }
  button: "down" | "up"
}

export type Awareness = NonNullable<HocuspocusProvider["awareness"]>

/** A pointer that only hovers goes out at most this often (~20 a second); Excalidraw reports every mouse move. */
const HOVER_EVERY_MS = 50

/** A held laser: where it points now, and its next update while it waits its turn. */
type Held = { pointer: PointerUpdate["pointer"]; wait?: () => void }

export function useBoardPresence({
  awareness,
  user,
  publish,
}: {
  awareness: Awareness | null | undefined
  user: PresenceUser
  publish: boolean
}): (payload: PointerUpdate) => void {
  // Who this tab is, so the others can name its cursor.
  React.useEffect(() => {
    if (!awareness || !publish) return
    awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name,
      color: generateColorFromUUID(user.id || "default"),
      profileKey: user.profileKey,
    })
  }, [awareness, publish, user.id, user.name, user.profileKey])

  // Stopped publishing: name and pointer leave the others' boards, in one
  // update. A tab that never published has nothing to take back.
  React.useEffect(() => {
    if (!awareness || publish) return
    const state = awareness.getLocalState()
    if (state && (state.user || state.pointer)) awareness.setLocalState({ ...state, user: null, pointer: null, button: null })
  }, [awareness, publish])

  const lastSentRef = React.useRef(0)
  const heldRef = React.useRef<Held | null>(null)
  // A held laser's next update, while it waits its turn.
  const [timers] = React.useState(laserTimers)
  React.useEffect(() => {
    heldRef.current = null
    return timers.stop
  }, [timers, awareness, publish])

  return React.useCallback(
    (payload: PointerUpdate) => {
      if (!awareness || !publish) return
      // One update with every field that changed.
      const send = (fields: Record<string, unknown>) => {
        const state = awareness.getLocalState()
        if (state) awareness.setLocalState({ ...state, ...fields })
        lastSentRef.current = Date.now()
      }
      const now = Date.now()
      const held = heldRef.current
      if (payload.pointer.tool === "laser" && payload.button === "down") {
        // Held down: where it points goes out at most once every INK_SEND_MS, the newest place each time (one that
        // waits its turn goes when it comes). Nothing is kept: a hold of any length goes on.
        const h = held ?? (heldRef.current = { pointer: payload.pointer })
        h.pointer = payload.pointer
        if (now - lastSentRef.current >= INK_SEND_MS) {
          h.wait?.()
          h.wait = undefined
          send({ pointer: h.pointer, button: "down" })
        } else
          h.wait ??= timers.later(() => {
            h.wait = undefined
            send({ pointer: h.pointer, button: "down" })
          }, INK_SEND_MS - (now - lastSentRef.current))
        return
      }
      if (held) {
        // Let go, at once: the last word on the stroke, nothing of it still waiting. Another tool now, mid-stroke,
        // ends it the same way, where the laser last was; that tool's own pointer follows as any does.
        held.wait?.()
        heldRef.current = null
        const laser = payload.pointer.tool === "laser"
        send({ pointer: laser ? payload.pointer : held.pointer, button: "up" })
        if (laser) return
      }
      // A press, a drag and a release go out at once; a hover is throttled.
      if (payload.button === "up" && now - lastSentRef.current < HOVER_EVERY_MS) return
      send({ pointer: payload.pointer, button: payload.button })
    },
    [awareness, publish, timers],
  )
}

/** Everyone else on the board who is named and pointing, live. */
export function useRemoteCursors(awareness: Awareness | null | undefined): RemoteCursor[] {
  const [cursors, setCursors] = React.useState<RemoteCursor[]>([])
  React.useEffect(() => {
    if (!awareness) {
      setCursors([])
      return
    }
    const read = () => {
      const out: RemoteCursor[] = []
      ;(awareness.getStates() as Map<number, Record<string, unknown>>).forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const u = state.user as { id?: string; name?: string } | null | undefined
        const p = state.pointer as { x?: unknown; y?: unknown } | null | undefined
        if (!u?.name || typeof p?.x !== "number" || typeof p?.y !== "number") return
        out.push({ key: String(clientId), id: u.id, name: u.name, pointer: { x: p.x, y: p.y }, button: state.button === "down" ? "down" : "up" })
      })
      setCursors(out)
    }
    awareness.on("change", read)
    read()
    return () => {
      awareness.off("change", read)
    }
  }, [awareness])
  return cursors
}

/** Someone else's laser now: its key for Excalidraw, its colour, where it points, whether it's held, and its timer. */
type Live = { key: SocketId; fill: string; x: number; y: number; down: boolean; wait?: () => void }

/**
 * Everyone else's lasers, for Excalidraw's own trail for a collaborator (LaserTrails, @excalidraw/excalidraw 0.18.1
 * dist/dev/index.js:23905-23990): the trail the drawer sees of their own, about its last second and 50 points while
 * held, decaying from its tail, the rest going once it's let go. Each as a collaborator Excalidraw draws no cursor or
 * name for (renderCursor false, no username: ours are drawn over the board), in its person's colour (`colour`, from
 * their name), keyed by its awareness client and that colour, never a name (Excalidraw keeps a trail's colour from its
 * first sight, so a new colour is a new trail).
 *
 * A laser held with nothing new for LASER_MS ends as a let-go does (its person went still, or offline without a word),
 * and a state read again draws nothing again. An ended one leaves LASER_MS on, its trail gone by then. Its person
 * leaving takes it at once: Excalidraw stops the trail of a collaborator no longer there only while some are, so one
 * with no pointer stands in for LASER_MS. Empty while no one lasers, so Excalidraw lists no one.
 */
export function useRemoteLasers(awareness: Awareness | null | undefined, colour: (name: string) => string): Map<SocketId, Collaborator> {
  const [lasers, setLasers] = React.useState<Map<SocketId, Collaborator>>(() => new Map())
  React.useEffect(() => {
    setLasers(new Map())
    if (!awareness) return
    const timers = laserTimers()
    // Each person's laser by their client, the stand-ins for those who left, and the last state read of each.
    const live = new Map<number, Live>()
    const left = new Set<SocketId>()
    const seen = new Map<number, string>()
    const show = () => {
      const out = new Map<SocketId, Collaborator>()
      live.forEach(({ key, fill, x, y, down }) => out.set(key, { pointer: { x, y, tool: "laser", renderCursor: false, laserColor: fill }, button: down ? "down" : "up" }))
      left.forEach((key) => out.set(key, {}))
      setLasers(out)
    }
    const end = (client: number, l: Live) => {
      l.down = false
      l.wait?.()
      l.wait = timers.later(() => live.get(client) === l && live.delete(client) && show())
    }
    const read = () => {
      const states = awareness.getStates() as Map<number, Record<string, unknown>>
      let changed = false
      live.forEach((l, client) => {
        if (states.has(client)) return
        l.wait?.()
        live.delete(client)
        const key = String(client) as SocketId
        left.add(key)
        timers.later(() => left.delete(key) && show())
        changed = true
      })
      for (const client of seen.keys()) if (!states.has(client)) seen.delete(client)
      states.forEach((state, client) => {
        if (client === awareness.clientID) return
        const p = state.pointer as { x?: unknown; y?: unknown; tool?: unknown } | null | undefined
        const name = (state.user as { name?: unknown } | null | undefined)?.name
        const laser = p?.tool === "laser" && Number.isFinite(p.x) && Number.isFinite(p.y) && typeof name === "string"
        const down = laser && state.button === "down"
        const sig = laser ? `${p.x} ${p.y} ${down}` : ""
        if (seen.get(client) === sig) return
        seen.set(client, sig)
        const l = live.get(client)
        if (!laser || !p) {
          // Another tool now, or no pointer: a held laser ends.
          if (l?.down) {
            end(client, l)
            changed = true
          }
          return
        }
        if (!l && !down) return
        const fill = colour(name as string)
        const n = l ?? { key: `${client} ${fill}` as SocketId, fill, x: 0, y: 0, down }
        live.set(client, n)
        n.x = p.x as number
        n.y = p.y as number
        if (down) {
          n.down = true
          n.wait?.()
          n.wait = timers.later(() => (end(client, n), show()))
        } else end(client, n)
        changed = true
      })
      if (changed) show()
    }
    awareness.on("change", read)
    read()
    return () => {
      awareness.off("change", read)
      timers.stop()
    }
  }, [awareness, colour])
  return lasers
}
