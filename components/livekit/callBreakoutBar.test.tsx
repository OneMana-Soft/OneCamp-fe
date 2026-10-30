import { EventEmitter } from "events"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { RoomEvent, type Room } from "livekit-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CallBreakouts } from "@/lib/calls/breakouts"

const toasts = vi.fn()
const failures = vi.fn()
const breakoutToken = vi.fn()
const chooseBreakout = vi.fn()
vi.mock("./callSurface", () => ({ callToast: (t: unknown) => toasts(t) }))
vi.mock("./VideoControls", () => ({ showCallFailure: (f: unknown) => failures(f) }))
vi.mock("@/services/callBreakoutsService", () => ({
  breakoutToken: (...a: unknown[]) => breakoutToken(...a),
  chooseBreakout: (...a: unknown[]) => chooseBreakout(...a),
}))

import CallBreakoutBar, { readBreakoutPacket } from "./CallBreakoutBar"

// Breakout rooms for everyone in the call (calls package C, meet-10 and
// zoom-02): Join your room, pick one while people choose, Back to main room,
// the time left and the call back, the server's word to move, and what's said
// to every room. Only the server moves anyone.

const SAM = "sam"
const packet = (o: object) => new TextEncoder().encode(JSON.stringify(o))
const rooms = (o: Partial<CallBreakouts> = {}): CallBreakouts => ({
  open: true,
  choose: false,
  rooms: [
    { n: 1, name: "Design" },
    { n: 2, name: "Launch" },
  ],
  assigned: { [SAM]: 2 },
  room: 0,
  ...o,
})
function fakeRoom(mic = true, camera = false) {
  const room = new EventEmitter() as EventEmitter & { localParticipant: { identity: string; isMicrophoneEnabled: boolean; isCameraEnabled: boolean } }
  room.localParticipant = { identity: SAM, isMicrophoneEnabled: mic, isCameraEnabled: camera }
  return room
}
function bar(o: Partial<React.ComponentProps<typeof CallBreakoutBar>> = {}) {
  const room = fakeRoom()
  const onHop = vi.fn()
  const props = { room: room as unknown as Room, breakouts: rooms(), identity: SAM, runsCall: false, inRoom: null, asker: { sessionId: "s1" }, language: "en", onHop, onHeight: () => {}, ...o }
  return { room, onHop, ...render(<CallBreakoutBar {...props} />) }
}

beforeEach(() => {
  breakoutToken.mockReset().mockResolvedValue({ ok: true, token: "tok-2", n: 2, name: "Launch" })
  chooseBreakout.mockReset().mockResolvedValue(true)
  toasts.mockReset()
  failures.mockReset()
})
afterEach(cleanup)

describe("the server's word on breakout rooms", () => {
  it("reads where you now belong and what's said to every room, from the server only", () => {
    expect(readBreakoutPacket(packet({ t: "breakout", room: 2, name: "Launch" }), undefined)).toEqual({ t: "breakout", room: 2, name: "Launch" })
    expect(readBreakoutPacket(packet({ t: "breakout" }), undefined)).toEqual({ t: "breakout", room: 0 })
    expect(readBreakoutPacket(packet({ t: "breakout", room: -1, name: "x" }), undefined)).toEqual({ t: "breakout", room: 0 })
    expect(readBreakoutPacket(packet({ t: "breakout_broadcast", by: "Maya", text: " Back in 5 " }), undefined)).toEqual({ t: "breakout_broadcast", by: "Maya", text: "Back in 5" })
    expect(readBreakoutPacket(packet({ t: "breakout_broadcast", text: "" }), undefined)).toBeNull()
    // Someone in the call can't move anyone, nor speak as whoever runs it.
    expect(readBreakoutPacket(packet({ t: "breakout", room: 1 }), { identity: "priya" })).toBeNull()
    expect(readBreakoutPacket(packet({ t: "breakout_broadcast", text: "hi" }), { identity: "priya" })).toBeNull()
  })
})

describe("the bar above the dock", () => {
  it("asks you to join your room when the rooms open, and takes you there with your mic and camera as they were", async () => {
    const { onHop } = bar()
    expect(screen.getByRole("region", { name: "Breakout rooms" })).toHaveTextContent("Breakout rooms are open: you're in Launch")
    fireEvent.click(screen.getByRole("button", { name: "Join Launch" }))
    await waitFor(() => expect(onHop).toHaveBeenCalledWith({ n: 2, name: "Launch", token: "tok-2" }, { audio: true, video: false }))
    expect(chooseBreakout).toHaveBeenCalledWith({ sessionId: "s1" }, 2)
    expect(breakoutToken).toHaveBeenCalledWith({ sessionId: "s1" }, 2, "en")
  })

  it("offers every room while people choose", () => {
    bar({ breakouts: rooms({ choose: true }) })
    expect(screen.getByRole("region", { name: "Breakout rooms" })).toHaveTextContent("pick one")
    expect(screen.getByRole("button", { name: "Join Design" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Join Launch" })).toBeTruthy()
  })

  it("says nothing while the rooms are closed, or to someone with no room and no choice", () => {
    bar({ breakouts: rooms({ open: false }) })
    expect(screen.queryByRole("region")).toBeNull()
    cleanup()
    bar({ breakouts: rooms({ assigned: {} }) })
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("says the server's refusal in its words, and stays where you are", async () => {
    breakoutToken.mockResolvedValue({ ok: false, msg: "That isn't your room." })
    const { onHop } = bar()
    fireEvent.click(screen.getByRole("button", { name: "Join Launch" }))
    await waitFor(() => expect(failures).toHaveBeenCalledWith({ title: "You couldn't join Launch", description: "That isn't your room." }))
    expect(onHop).not.toHaveBeenCalled()
  })

  it("in a room: names it, counts down the call back, and takes you back to the main room", () => {
    const { onHop } = bar({ inRoom: { n: 2, name: "Launch" }, breakouts: rooms({ room: 2, closingAt: Date.now() + 24_000 }) })
    expect(screen.getByRole("region", { name: "Breakout rooms" }).textContent).toMatch(/Launch · Back to the main room in 0:2[34]/)
    fireEvent.click(screen.getByRole("button", { name: "Back to main room" }))
    expect(onHop).toHaveBeenCalledWith(null, { audio: true, video: false })
    expect(chooseBreakout).toHaveBeenCalledWith({ sessionId: "s1" }, 0)
  })

  it("moves you when the server says so, and back when the rooms close; never to where you already are", async () => {
    const { room, onHop } = bar()
    act(() => void room.emit(RoomEvent.DataReceived, packet({ t: "breakout", room: 2, name: "Launch" }), undefined, undefined, "oc.call"))
    await waitFor(() => expect(onHop).toHaveBeenCalledWith({ n: 2, name: "Launch", token: "tok-2" }, { audio: true, video: false }))
    cleanup()
    const inRoom = bar({ inRoom: { n: 2, name: "Launch" } })
    act(() => void inRoom.room.emit(RoomEvent.DataReceived, packet({ t: "breakout", room: 2 }), undefined, undefined, "oc.call"))
    act(() => void inRoom.room.emit(RoomEvent.DataReceived, packet({ t: "breakout" }), undefined, undefined, "oc.call"))
    await waitFor(() => expect(inRoom.onHop).toHaveBeenCalledWith(null, { audio: true, video: false }))
    expect(inRoom.onHop).toHaveBeenCalledTimes(1)
  })

  it("shows what's said to every room in the bar, never a toast on top of it (DB-25), and fades after 15 s", () => {
    vi.useFakeTimers()
    try {
      const { room } = bar({ inRoom: { n: 2, name: "Launch" } })
      act(() => void room.emit(RoomEvent.DataReceived, packet({ t: "breakout_broadcast", by: "Maya", text: "Five minutes" }), undefined, undefined, "oc.call"))
      const region = screen.getByRole("region", { name: "Breakout rooms" })
      expect(region).toHaveTextContent("Maya, to every room: Five minutes")
      expect(region).toHaveTextContent("Back to main room")
      expect(toasts).not.toHaveBeenCalled()
      act(() => void vi.advanceTimersByTime(15_000))
      expect(screen.queryByText(/to every room/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("in the main room with nothing else to show, the bar carries the message alone", () => {
    const { room } = bar({ breakouts: rooms({ open: false }) })
    act(() => void room.emit(RoomEvent.DataReceived, packet({ t: "breakout_broadcast", text: "Rooms open in a minute" }), undefined, undefined, "oc.call"))
    expect(screen.getByRole("region", { name: "Breakout rooms" })).toHaveTextContent("To every room: Rooms open in a minute")
  })

  it("while the knock bar has the dock, still hears the server: the message as a toast, and the move", async () => {
    const { room, onHop } = bar({ hidden: true })
    expect(screen.queryByRole("region")).toBeNull()
    act(() => void room.emit(RoomEvent.DataReceived, packet({ t: "breakout_broadcast", by: "Maya", text: "Five minutes" }), undefined, undefined, "oc.call"))
    expect(toasts).toHaveBeenCalledWith({ title: "Maya, to every room", description: "Five minutes", duration: 15_000 })
    act(() => void room.emit(RoomEvent.DataReceived, packet({ t: "breakout", room: 2 }), undefined, undefined, "oc.call"))
    await waitFor(() => expect(onHop).toHaveBeenCalled())
  })
})
