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
 *
 * The queue (one at a time from each person, at most eight, each gone after
 * its float) and the rising mark are the ones a board shows too
 * (components/reactions/rising).
 */

import * as React from "react"
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant, type Room } from "livekit-client"
import { CALL_SIGNAL_TOPIC, encodeSignal, readReaction } from "@/lib/calls/signals"
import type { Reaction } from "@/lib/reactions/set"
import { Rising, useReactionQueue, type FloatingReaction } from "@/components/reactions/rising"
import { heldFor, partOf } from "@/lib/calls/control"
import { guestName } from "./callLevels"
import { readCallMetadata } from "./callState"

/** Whether the call holds reactions for this person now. */
const reactionsHeld = (room: Room, attributes: Readonly<Record<string, string>> | undefined) =>
  heldFor(readCallMetadata(room.metadata).held, partOf(attributes)).has("react")

/** The reactions on the stage now, and how to send one to everyone. */
export function useCallReactions(room: Room | undefined) {
  const { shown, add } = useReactionQueue()

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
    (emoji: Reaction) => {
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
