import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { RoomEvent } from "livekit-client"
import type { CallActivities } from "@/lib/calls/activities"

const readActivities = vi.fn()
const doActivity = vi.fn()
vi.mock("@/services/callActivitiesService", () => ({
  readActivities: (...a: unknown[]) => readActivities(...a),
  doActivity: (...a: unknown[]) => doActivity(...a),
}))

import { READ_GAP_MS, SAFETY_MS, useCallActivities } from "./useCallActivities"
import { CALL_TOPIC } from "./callState"

// A call's polls and questions kept up to date while their panel is open
// (calls package A): each screen reads its own view when the server says
// something changed, one read at a time and never more often than the guests'
// read limit allows, at once after its own action, and again after a missed
// packet (a reconnect, a sleeping tab).

const view = (n: number): CallActivities => ({ polls: [], questions: [], qa: { open: n > 0, shown: "all", anonymous: false }, runs: false })
const changed = new TextEncoder().encode(JSON.stringify({ t: "activities" }))
let visibility: DocumentVisibilityState = "visible"

function fakeRoom() {
  const handlers = new Map<string, Set<(...a: unknown[]) => void>>()
  return {
    room: {
      on: (ev: string, fn: (...a: unknown[]) => void) => (handlers.set(ev, (handlers.get(ev) ?? new Set()).add(fn)), undefined),
      off: (ev: string, fn: (...a: unknown[]) => void) => (handlers.get(ev)?.delete(fn), undefined),
    },
    emit: (ev: string, ...a: unknown[]) => act(() => handlers.get(ev)?.forEach((h) => h(...a))),
  }
}
const flush = () => act(async () => {})
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 26, 9, 0) })
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
  readActivities.mockReset()
  doActivity.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("keeping a call's polls and questions up to date", () => {
  it("reads at once, then on the server's word, never two at a time and never closer than the gap", async () => {
    const f = fakeRoom()
    let answer!: (v: unknown) => void
    readActivities.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    readActivities.mockResolvedValue({ kind: "read", activities: view(1) })
    const { result } = renderHook(() => useCallActivities({ sessionId: "s1" }, f.room as never))
    expect(result.current.status).toBe("loading")
    expect(readActivities).toHaveBeenCalledTimes(1)
    // Two packets while the first read is out: one more read, after it.
    f.emit(RoomEvent.DataReceived, changed, undefined, undefined, CALL_TOPIC)
    f.emit(RoomEvent.DataReceived, changed, undefined, undefined, CALL_TOPIC)
    expect(readActivities).toHaveBeenCalledTimes(1)
    await act(async () => answer({ kind: "read", activities: view(0) }))
    expect(result.current.status).toBe("ready")
    expect(readActivities).toHaveBeenCalledTimes(1)
    await tick(READ_GAP_MS)
    expect(readActivities).toHaveBeenCalledTimes(2)
    expect(result.current.activities).toEqual(view(1))
    // A packet from someone in the call is never believed.
    f.emit(RoomEvent.DataReceived, changed, { identity: "ben" }, undefined, CALL_TOPIC)
    await tick(READ_GAP_MS)
    expect(readActivities).toHaveBeenCalledTimes(2)
  })

  it("reads at once after your own action, and answers what the server said", async () => {
    const f = fakeRoom()
    readActivities.mockResolvedValue({ kind: "read", activities: view(1) })
    doActivity.mockResolvedValueOnce({ ok: true, id: "q1" })
    const { result } = renderHook(() => useCallActivities({ callToken: "tok" }, f.room as never))
    await flush()
    let answered: unknown
    await act(async () => {
      answered = await result.current.act({ op: "ask", text: "Recorded?", anonymous: false })
    })
    expect(answered).toEqual({ ok: true, id: "q1" })
    expect(doActivity).toHaveBeenCalledWith({ callToken: "tok" }, { op: "ask", text: "Recorded?", anonymous: false })
    expect(readActivities).toHaveBeenCalledTimes(2)
  })

  it("stops reading once the activities are refused, and says so", async () => {
    const f = fakeRoom()
    readActivities.mockResolvedValueOnce({ kind: "refused" })
    const { result } = renderHook(() => useCallActivities({ sessionId: "s1" }, f.room as never))
    await flush()
    expect(result.current.status).toBe("refused")
    f.emit(RoomEvent.DataReceived, changed, undefined, undefined, CALL_TOPIC)
    f.emit(RoomEvent.Reconnected)
    await tick(SAFETY_MS)
    expect(readActivities).toHaveBeenCalledTimes(1)
  })

  it("says a trouble that passes, keeps what it read, and reads again on Try again", async () => {
    const f = fakeRoom()
    readActivities.mockResolvedValueOnce({ kind: "read", activities: view(1) }).mockResolvedValueOnce({ kind: "busy" }).mockResolvedValueOnce({ kind: "read", activities: view(0) })
    const { result } = renderHook(() => useCallActivities({ sessionId: "s1" }, f.room as never))
    await flush()
    f.emit(RoomEvent.DataReceived, changed, undefined, undefined, CALL_TOPIC)
    await tick(READ_GAP_MS)
    expect(result.current.trouble).toBe("busy")
    expect(result.current.activities).toEqual(view(1))
    await act(async () => result.current.retry())
    expect(result.current.trouble).toBeNull()
    expect(result.current.activities).toEqual(view(0))
  })

  it("reads again after a reconnect, on coming back to the page, and every so often while it's in view", async () => {
    const f = fakeRoom()
    readActivities.mockResolvedValue({ kind: "read", activities: view(1) })
    renderHook(() => useCallActivities({ sessionId: "s1" }, f.room as never))
    await flush()
    f.emit(RoomEvent.Reconnected)
    await flush()
    expect(readActivities).toHaveBeenCalledTimes(2)
    visibility = "hidden"
    await tick(SAFETY_MS)
    expect(readActivities).toHaveBeenCalledTimes(2)
    visibility = "visible"
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
    await flush()
    expect(readActivities).toHaveBeenCalledTimes(3)
    await tick(SAFETY_MS)
    expect(readActivities).toHaveBeenCalledTimes(4)
  })

  it("drops an answer for the call it read before, once the reader is someone else", async () => {
    const f = fakeRoom()
    let first!: (v: unknown) => void
    readActivities.mockImplementationOnce(() => new Promise((r) => (first = r)))
    readActivities.mockResolvedValueOnce({ kind: "read", activities: view(0) })
    const { result, rerender } = renderHook(({ id }) => useCallActivities({ sessionId: id }, f.room as never), { initialProps: { id: "s1" } })
    rerender({ id: "s2" })
    await flush()
    expect(result.current.activities).toEqual(view(0))
    await act(async () => first({ kind: "read", activities: view(1) }))
    expect(result.current.activities).toEqual(view(0))
  })
})
