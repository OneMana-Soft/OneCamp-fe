import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { connectedRoomName } from "./connectedRoom"

// A room as LiveKit's: named from the join's answer, then it says Connected.
function fakeRoom(name = "") {
  const handlers = new Map<string, Set<() => void>>()
  return {
    name,
    on(event: string, fn: () => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
      return this
    },
    off(event: string, fn: () => void) {
      handlers.get(event)?.delete(fn)
      return this
    },
    emit(event: string) {
      handlers.get(event)?.forEach((fn) => fn())
    },
    listening: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  }
}
const nameOf = (room: ReturnType<typeof fakeRoom>, ms?: number) => connectedRoomName(room as unknown as Parameters<typeof connectedRoomName>[0], ms)

describe("connectedRoomName (V-30: a call still connecting has no name yet)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("answers a connected room's name at once", async () => {
    const room = fakeRoom("ch-1")
    await expect(nameOf(room)).resolves.toBe("ch-1")
    expect(room.listening()).toBe(0)
  })

  it("waits for a room still connecting, and answers its name once it connects", async () => {
    const room = fakeRoom()
    const named = nameOf(room)
    room.name = "ch-1"
    room.emit("connected")
    await expect(named).resolves.toBe("ch-1")
    expect(room.listening()).toBe(0)
  })

  it("answers nothing when the room doesn't connect in time", async () => {
    const room = fakeRoom()
    const named = nameOf(room, 15_000)
    await vi.advanceTimersByTimeAsync(14_999)
    room.emit("reconnecting")
    await vi.advanceTimersByTimeAsync(1)
    await expect(named).resolves.toBeUndefined()
    expect(room.listening()).toBe(0)
  })

  it("answers nothing when the call ends before it connects", async () => {
    const room = fakeRoom()
    const named = nameOf(room)
    room.emit("disconnected")
    await expect(named).resolves.toBeUndefined()
    expect(room.listening()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
