"use client"

/**
 * Reactions in a call (step 3, part 2): a tray of six from the dock, sent to
 * everyone over the call's own signals (lib/calls/signals) and floated up the
 * stage's left edge with who sent them. UI only: nothing is kept, and the
 * Call State package (#29) takes the signals over when it lands.
 *
 * A reaction never reaches the server, so while the people running the call
 * hold reactions (meet-12) every screen drops a held sender's, read from the
 * room's metadata and the sender's attributes, which only the server sets: a
 * changed client can't put one on anyone else's stage.
 */

import * as React from "react"
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant, type Room } from "livekit-client"
import { CALL_SIGNAL_TOPIC, REACTION_NAMES, encodeSignal, readReaction, type CallReaction } from "@/lib/calls/signals"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { heldFor, partOf } from "@/lib/calls/control"
import { guestName } from "./callLevels"
import { readCallMetadata } from "./callState"

/** Whether the call holds reactions for this person now. */
const reactionsHeld = (room: Room, attributes: Readonly<Record<string, string>> | undefined) =>
  heldFor(readCallMetadata(room.metadata).held, partOf(attributes)).has("react")

export interface FloatingReaction {
  id: number
  emoji: CallReaction
  name: string
  mine: boolean
}

/** How long one floats. */
export const REACTION_FLOAT_MS = 3200
/** At most this many at once: a burst from everyone stays a burst. */
const MAX_SHOWN = 8
/** One person's reactions closer together than this count once. */
const SAME_PERSON_MS = 250

/** The reactions on the stage now, and how to send one to everyone. */
export function useCallReactions(room: Room | undefined) {
  const [shown, setShown] = React.useState<FloatingReaction[]>([])
  const seq = React.useRef(0)
  const lastBy = React.useRef(new Map<string, number>())
  const timers = React.useRef(new Set<number>())

  const add = React.useCallback((emoji: CallReaction, identity: string, name: string, mine: boolean): boolean => {
    const t = Date.now()
    if (t - (lastBy.current.get(identity) ?? -Infinity) < SAME_PERSON_MS) return false
    lastBy.current.set(identity, t)
    const id = ++seq.current
    setShown((list) => [...list, { id, emoji, name, mine }].slice(-MAX_SHOWN))
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setShown((list) => list.filter((r) => r.id !== id))
    }, REACTION_FLOAT_MS)
    timers.current.add(timer)
    return true
  }, [])

  React.useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  React.useEffect(() => {
    if (!room) return
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
      const r = readReaction(payload, participant, topic)
      if (r && !reactionsHeld(room, participant?.attributes)) add(r.emoji, r.identity, guestName(r.identity, r.name).name, false)
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, add])

  const send = React.useCallback(
    (emoji: CallReaction) => {
      const me = room?.localParticipant
      // Held, it would reach nobody's stage: it doesn't float on yours either.
      if (!room || !me || reactionsHeld(room, me.attributes)) return
      // LiveKit never hands a packet back to its sender: yours floats here.
      if (!add(emoji, me.identity, "You", true)) return
      void me.publishData(encodeSignal("reaction", { emoji }), { reliable: false, topic: CALL_SIGNAL_TOPIC }).catch(() => {})
    },
    [room, add],
  )

  return { shown, send }
}

/** One reaction rising and fading; with reduced motion it only fades. */
function Rising({ r }: { r: FloatingReaction }) {
  const ref = React.useCallback((el: HTMLLIElement | null) => {
    if (!el || typeof el.animate !== "function") return
    const still = prefersReducedMotion()
    el.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: "translateY(12px) scale(0.8)" },
            { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.12 },
            { opacity: 1, transform: "translateY(-56px) scale(1)", offset: 0.75 },
            { opacity: 0, transform: "translateY(-80px) scale(0.96)" },
          ],
      { duration: REACTION_FLOAT_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    )
  }, [])
  return (
    <li ref={ref} className="flex items-center gap-1.5" data-call-reaction={r.mine ? "mine" : ""}>
      <span aria-hidden className="text-3xl leading-none drop-shadow-[0_2px_6px_rgb(0_0_0/0.35)]">
        {r.emoji}
      </span>
      <span aria-hidden className="rounded-[8px] bg-[#1F2024]/90 px-1.5 py-0.5 text-micro font-medium text-[#EEEEF0]">
        {r.name}
      </span>
      <span className="sr-only">{`${r.name} reacted: ${REACTION_NAMES[r.emoji]}`}</span>
    </li>
  )
}

/**
 * The reactions, floating up the stage's left edge, above the dock and clear
 * of the name plate at a tile's foot (they first sat on it, and covered the
 * name). They take no presses: the tiles under them stay pressable. A screen
 * reader hears each.
 */
export function FloatingReactions({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <ul
      role="log"
      aria-label="Reactions"
      aria-live="polite"
      className="pointer-events-none absolute bottom-[148px] left-6 z-20 flex flex-col-reverse gap-2 @3xl:bottom-[140px] @7xl:bottom-[156px]"
    >
      {reactions.map((r) => (
        <Rising key={r.id} r={r} />
      ))}
    </ul>
  )
}
