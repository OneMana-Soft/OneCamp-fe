import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { RoomEvent } from "livekit-client"
import { CALL_SIGNAL_TOPIC, encodeSignal } from "@/lib/calls/signals"
import { FloatingReactions, useCallReactions } from "./callReactions"

// Step 3, part 2: reactions in a call, over the call's own signals, UI only.

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function fakeRoom() {
  const handlers = new Set<(...a: unknown[]) => void>()
  const publishData = vi.fn().mockResolvedValue(undefined)
  return {
    room: {
      on: (ev: string, fn: (...a: unknown[]) => void) => (ev === RoomEvent.DataReceived && handlers.add(fn), undefined),
      off: (ev: string, fn: (...a: unknown[]) => void) => (handlers.delete(fn), undefined),
      localParticipant: { identity: "sam", name: "Sam Rivera", publishData },
    },
    publishData,
    receive: (payload: Uint8Array, from: { identity: string; name?: string } | undefined, topic?: string) => handlers.forEach((h) => h(payload, from, undefined, topic)),
  }
}

describe("useCallReactions", () => {
  it("sends a reaction to everyone on the call's topic, and floats yours here as You", () => {
    const f = fakeRoom()
    const { result } = renderHook(() => useCallReactions(f.room as never))
    act(() => result.current.send("👏"))
    expect(f.publishData).toHaveBeenCalledWith(encodeSignal("reaction", { emoji: "👏" }), { reliable: false, topic: CALL_SIGNAL_TOPIC })
    expect(result.current.shown).toEqual([expect.objectContaining({ emoji: "👏", name: "You", mine: true })])
  })

  it("floats one from someone else under their name, a guest's without its prefix, and never a forged or unknown one", () => {
    const f = fakeRoom()
    const { result } = renderHook(() => useCallReactions(f.room as never))
    act(() => f.receive(encodeSignal("reaction", { emoji: "🎉" }), { identity: "maya", name: "Maya Chen" }, CALL_SIGNAL_TOPIC))
    act(() => f.receive(encodeSignal("reaction", { emoji: "👍" }), { identity: "guest-1", name: "Guest: Priya" }, CALL_SIGNAL_TOPIC))
    act(() => f.receive(encodeSignal("reaction", { emoji: "<b>hi</b>" }), { identity: "leo", name: "Leo" }, CALL_SIGNAL_TOPIC))
    act(() => f.receive(encodeSignal("reaction", { emoji: "😮" }), undefined, CALL_SIGNAL_TOPIC))
    expect(result.current.shown.map((r) => `${r.emoji} ${r.name}`)).toEqual(["🎉 Maya Chen", "👍 Priya"])
  })

  it("takes one from a person at a time, and lets each go after three seconds", () => {
    vi.useFakeTimers()
    const f = fakeRoom()
    const { result } = renderHook(() => useCallReactions(f.room as never))
    act(() => {
      result.current.send("👍")
      result.current.send("👍")
    })
    expect(f.publishData).toHaveBeenCalledTimes(1)
    expect(result.current.shown).toHaveLength(1)
    act(() => vi.advanceTimersByTime(3300))
    expect(result.current.shown).toHaveLength(0)
  })
})

describe("FloatingReactions", () => {
  it("draws each with who sent it, and says it in a polite live region", () => {
    render(<FloatingReactions reactions={[{ id: 1, emoji: "🎉", name: "Maya Chen", mine: false }]} />)
    const region = screen.getByRole("log", { name: "Reactions" })
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.textContent).toContain("🎉")
    expect(region.textContent).toContain("Maya Chen")
    expect(screen.getByText("Maya Chen reacted: Celebrate")).toBeTruthy()
  })
})
