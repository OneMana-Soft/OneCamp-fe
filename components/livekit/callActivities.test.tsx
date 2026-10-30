import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { RoomEvent } from "livekit-client"

const callToast = vi.fn()
vi.mock("./callSurface", () => ({ callToast: (...a: unknown[]) => callToast(...a) }))

import { lightsDock, readActivitiesPacket } from "./callActivities"
import { useActivitiesLight } from "./useActivitiesLight"
import { CALL_TOPIC } from "./callState"

// A call's polls and questions as the call hears of them (calls package A):
// only the server's word that something changed, never who, and the dock lit
// while the panel is shut when it's something a person should look at.

const packet = (o: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify(o))
const someone = { identity: "ben", name: "Ben Ito" }

afterEach(() => {
  cleanup()
  callToast.mockReset()
})

describe("an activities packet", () => {
  it("is believed only from the server, and says what changed or nothing", () => {
    expect(readActivitiesPacket(packet({ t: "activities", what: "poll" }), undefined)).toEqual({ what: "poll" })
    expect(readActivitiesPacket(packet({ t: "activities" }), undefined)).toEqual({ what: null })
    expect(readActivitiesPacket(packet({ t: "activities", what: "ben voted" }), undefined)).toEqual({ what: null })
    // Anyone in the call could otherwise light everyone's dock.
    expect(readActivitiesPacket(packet({ t: "activities", what: "poll" }), someone)).toBeUndefined()
    expect(readActivitiesPacket(packet({ t: "spotlight" }), undefined)).toBeUndefined()
    expect(readActivitiesPacket(new TextEncoder().encode("not json"), undefined)).toBeUndefined()
  })
})

describe("what lights the dock", () => {
  it("is a poll, shared results or Q&A changing for everyone, and a question asked for whoever runs the call", () => {
    for (const what of ["poll", "results", "qa"] as const) {
      expect(lightsDock(what, false)).toBe(true)
      expect(lightsDock(what, true)).toBe(true)
    }
    expect(lightsDock("question", true)).toBe(true)
    expect(lightsDock("question", false)).toBe(false)
    expect(lightsDock(null, true)).toBe(false)
  })
})

function fakeRoom() {
  const handlers = new Set<(...a: unknown[]) => void>()
  return {
    room: {
      on: (ev: string, fn: (...a: unknown[]) => void) => (ev === RoomEvent.DataReceived && handlers.add(fn), undefined),
      off: (_ev: string, fn: (...a: unknown[]) => void) => (handlers.delete(fn), undefined),
    },
    receive: (payload: Uint8Array, from?: { identity: string }, topic = CALL_TOPIC) => act(() => handlers.forEach((h) => h(payload, from, undefined, topic))),
    listening: () => handlers.size,
  }
}

describe("the dock's light", () => {
  it("lights on a poll starting while the panel is shut, says so once in a toast, and goes out when it opens", () => {
    const f = fakeRoom()
    const { result, rerender } = renderHook(({ open }) => useActivitiesLight(f.room as never, open, false), { initialProps: { open: false } })
    expect(result.current).toBe(false)
    f.receive(packet({ t: "activities", what: "poll" }))
    expect(result.current).toBe(true)
    expect(callToast).toHaveBeenCalledTimes(1)
    expect(callToast).toHaveBeenCalledWith(expect.objectContaining({ title: "A poll just started" }))
    rerender({ open: true })
    expect(result.current).toBe(false)
    // The open panel reads for itself: the dock no longer listens.
    expect(f.listening()).toBe(0)
  })

  it("stays out for a vote, a question asked when you don't run the call, another topic, or a packet from someone in the call", () => {
    const f = fakeRoom()
    const { result } = renderHook(() => useActivitiesLight(f.room as never, false, false))
    f.receive(packet({ t: "activities" }))
    f.receive(packet({ t: "activities", what: "question" }))
    f.receive(packet({ t: "activities", what: "poll" }), undefined, "oc.signal")
    f.receive(packet({ t: "activities", what: "poll" }), someone)
    expect(result.current).toBe(false)
    expect(callToast).not.toHaveBeenCalled()
  })

  it("lights for whoever runs the call when a question is asked, without a toast", () => {
    const f = fakeRoom()
    const { result } = renderHook(() => useActivitiesLight(f.room as never, false, true))
    f.receive(packet({ t: "activities", what: "question" }))
    expect(result.current).toBe(true)
    expect(callToast).not.toHaveBeenCalled()
  })
})
