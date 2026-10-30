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
 */

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID"

/** Who this tab is to the others on the board. */
export interface PresenceUser {
  id: string
  name: string
  profileKey?: string
}

/** What Excalidraw's onPointerUpdate hands over on every move, press and release. */
export interface PointerUpdate {
  pointer: { x: number; y: number }
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
  return React.useCallback(
    (payload: PointerUpdate) => {
      if (!awareness || !publish) return
      const now = Date.now()
      // A press, a drag and a release go out at once; a hover is throttled.
      if (payload.button === "up" && now - lastSentRef.current < HOVER_EVERY_MS) return
      lastSentRef.current = now
      awareness.setLocalStateField("pointer", payload.pointer)
      awareness.setLocalStateField("button", payload.button)
    },
    [awareness, publish],
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
