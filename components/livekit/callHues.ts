import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useMaybeRoomContext } from "@livekit/components-react"
import { ParticipantKind, RoomEvent, type Room } from "livekit-client"
import { TRANSCRIBER_IDENTITY } from "@/lib/calls/signals"
import { hash32, type CampHue } from "@/lib/campHue"
import { shareHues } from "@/lib/shareHues"
import { personHue } from "@/lib/utils/getAvatarColor"
import { guestName } from "./callLevels"

/*
 * Each person's colour in a call (V-190). It was their own name's hue, so two
 * people whose names hash to one hue (Sam Rivera and Lena Ortiz are both lake)
 * drew in one colour, and their strokes on a shared screen looked alike. Now a
 * call shares the six out in join order (lib/shareHues): the first to join
 * keeps their own hue, and a later one whose hue is taken gets the least used
 * one after it, so nobody shares a colour while six last. Their face, speaking
 * ring, caption and strokes all take it. Every screen sees the same people and
 * the same join times (LiveKit's, in whole seconds), so every screen agrees;
 * people who joined in the same second go by their name's hash, then identity.
 */

/** Who is in a call, as its colours see them: a LiveKit participant has all four. */
export interface CallPerson {
  identity: string
  name?: string
  joinedAt?: Date
  kind?: ParticipantKind
}

/** An agent's part: it keeps the agent tint and takes no person's hue. */
export function isAgentParticipant(p: { kind?: ParticipantKind } | undefined): boolean {
  return p?.kind === ParticipantKind.AGENT
}

/** The name a call shows for someone, which their colour keys on: a guest's without its "Guest:", as on their tile's plate. */
export function callName(identity: string, name: string | undefined): string {
  return guestName(identity, name || identity || "Guest").name
}

const nameHash = (name: string) => hash32(name.trim().toLowerCase())

/** Each person's colour, by identity, shared out in join order. Pure. */
export function callHues(people: Iterable<CallPerson>): Map<string, CampHue> {
  const order = [...people]
    // Agents keep their tint, and the transcriber is never drawn: neither takes a person's hue.
    .filter((p) => p.identity && p.identity !== TRANSCRIBER_IDENTITY && !isAgentParticipant(p))
    .map((p) => ({ identity: p.identity, name: callName(p.identity, p.name), at: p.joinedAt?.getTime() ?? Number.POSITIVE_INFINITY }))
  // Infinity - Infinity is NaN, which falls through to the name's hash like a tie.
  order.sort((a, b) => a.at - b.at || nameHash(a.name) - nameHash(b.name) || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0))
  return shareHues(order.map((p) => [p.identity, personHue(p.name)] as const))
}

/**
 * The people in a room, as callHues takes them: you and everyone else. A join
 * time is the server's, so only someone it has described (who has a sid) has
 * one. LiveKit reads anyone else's as now, a new one at every read: you, until
 * the call connects, would have moved on every render.
 */
export function roomPeople(room: Pick<Room, "localParticipant" | "remoteParticipants"> | undefined): CallPerson[] {
  if (!room) return []
  return [room.localParticipant, ...room.remoteParticipants.values()].map((p) => ({ identity: p.identity, name: p.name, kind: p.kind, joinedAt: p.sid ? p.joinedAt : undefined }))
}

/** A person's colour from a call's sheet, or their own hue for someone it doesn't know (yet). */
export function callHueOf(hues: ReadonlyMap<string, CampHue>, identity: string, name?: string): CampHue {
  return hues.get(identity) ?? personHue(callName(identity, name))
}

/** What a room says when who is in it, or what they're called, changes: each can change someone's colour. */
export const CALL_PEOPLE_EVENTS = [RoomEvent.Connected, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantNameChanged] as const
type PeopleRow = [identity: string, name: string, joinedAt: number | null, kind: ParticipantKind | null]

/** What callHues reads from a room, as one string, so a component draws again only when it changes. */
function peopleText(room: Room | undefined): string {
  return JSON.stringify(roomPeople(room).map((p): PeopleRow => [p.identity, p.name ?? "", p.joinedAt?.getTime() ?? null, p.kind ?? null]))
}

/** callHueOf for a component in a call, drawn again when someone joins, leaves or is renamed. Outside a call, everyone's own hue. */
export function useCallHues(): (identity: string, name?: string) => CampHue {
  const room = useMaybeRoomContext()
  const subscribe = useCallback(
    (changed: () => void) => {
      if (!room) return () => {}
      for (const e of CALL_PEOPLE_EVENTS) room.on(e, changed)
      return () => {
        for (const e of CALL_PEOPLE_EVENTS) room.off(e, changed)
      }
    },
    [room],
  )
  const text = useSyncExternalStore(subscribe, () => peopleText(room), () => "[]")
  return useMemo(() => {
    const rows = JSON.parse(text) as PeopleRow[]
    const hues = callHues(rows.map(([identity, name, at, kind]) => ({ identity, name, joinedAt: at === null ? undefined : new Date(at), kind: kind ?? undefined })))
    return (identity: string, name?: string) => callHueOf(hues, identity, name)
  }, [text])
}
