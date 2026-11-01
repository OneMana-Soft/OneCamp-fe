import { vi } from "vitest"
import { act } from "@testing-library/react"
import { RoomEvent } from "livekit-client"
import { CALL_SIGNAL_TOPIC, encodeSignal } from "@/lib/calls/signals"

type Attrs = Record<string, string>

/**
 * A call's room as the call's hooks read it (useCallInk): you are Sam, Ana and
 * Ben are in it, and every packet you send is kept. `emit` fires a room event
 * inside act; `receive` hands you a call signal from someone in the call.
 */
export function fakeCallRoom(o: { metadata?: string; me?: Attrs } = {}) {
  const handlers = new Map<string, Set<(...a: unknown[]) => void>>()
  const publishData = vi.fn().mockResolvedValue(undefined)
  const people = new Map(["ana", "ben"].map((identity) => [identity, { identity, name: identity, attributes: {} as Attrs }]))
  const local = { identity: "sam", name: "Sam Rivera", publishData, attributes: o.me ?? {} }
  const room = {
    on: (ev: string, fn: (...a: unknown[]) => void) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set())
      handlers.get(ev)!.add(fn)
      return room
    },
    off: (ev: string, fn: (...a: unknown[]) => void) => {
      handlers.get(ev)?.delete(fn)
      return room
    },
    metadata: o.metadata,
    localParticipant: local,
    remoteParticipants: people,
    getParticipantByIdentity: (id: string) => (id === local.identity ? local : people.get(id)),
  }
  const emit = (ev: string, ...a: unknown[]) => act(() => handlers.get(ev)?.forEach((h) => h(...a)))
  return {
    room,
    publishData,
    emit,
    receive: (kind: string, payload: unknown, from: string) => emit(RoomEvent.DataReceived, encodeSignal(kind, payload), people.get(from), undefined, CALL_SIGNAL_TOPIC),
    /** What was sent: each packet's kind and payload, with the options it went with. */
    sent: () =>
      publishData.mock.calls.map(([bytes, opts]) => ({ ...(JSON.parse(new TextDecoder().decode(bytes as Uint8Array)) as { kind: string; payload: Record<string, unknown> }), opts: opts as Record<string, unknown> })),
  }
}
