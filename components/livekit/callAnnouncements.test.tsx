import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const announce = vi.fn()
vi.mock("@/lib/ui/announce", () => ({ announce: (t: string) => announce(t) }))

import { useCallAnnouncements, type AnnouncedCall } from "./useCallAnnouncements"

// meet-18 (D-CL-13): the call says each change once, to a screen reader:
// joins and leaves, hands up with their place and down, someone waiting to join, and
// recording or captions stopping (their starts are their pills'). Several
// within a moment are said as one, and one sentence never cuts another off.

const person = (identity: string, name: string, o: { you?: boolean; hand?: number | null } = {}) => ({ identity, name, you: !!o.you, hand: o.hand ?? null })
const sam = person("sam", "Sam Rivera", { you: true })
const maya = person("maya", "Maya Chen")
const jo = person("jo", "Jo Park")
const lee = person("lee", "Lee Hall")
const base: AnnouncedCall = { people: [sam, maya], knocks: [], recording: false, captions: false }

beforeEach(() => vi.useFakeTimers({ now: Date.UTC(2026, 9, 22, 9, 30) }))
afterEach(() => {
  vi.useRealTimers()
  announce.mockReset()
})

const said = () => announce.mock.calls.map((c) => c[0])

describe("what the call says", () => {
  it("says nothing of who was already there, then each join and leave, gathered over two seconds", () => {
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: base })
    vi.advanceTimersByTime(5_000)
    expect(said()).toEqual([])
    rerender({ ...base, people: [sam, maya, jo] })
    vi.advanceTimersByTime(1_000)
    rerender({ ...base, people: [sam, maya, jo, lee] })
    vi.advanceTimersByTime(2_000)
    expect(said()).toEqual(["Jo Park and Lee Hall joined"])
    rerender({ ...base, people: [sam, jo, lee] })
    vi.advanceTimersByTime(4_000)
    expect(said()).toEqual(["Jo Park and Lee Hall joined", "Maya Chen left"])
  })

  it("says each hand going up with its place in line, yours too, and each coming down, many at once as one", () => {
    const up = (p: ReturnType<typeof person>, hand: number) => ({ ...p, hand })
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: { ...base, people: [sam, maya, jo] } })
    rerender({ ...base, people: [sam, up(maya, 10), jo] })
    rerender({ ...base, people: [sam, up(maya, 10), up(jo, 20)] })
    rerender({ ...base, people: [up(sam, 30), up(maya, 10), up(jo, 20)] })
    rerender({ ...base, people: [up(sam, 30), maya, up(jo, 20)] })
    // A host's Lower all.
    rerender({ ...base, people: [sam, maya, jo] })
    // Someone who comes in with a hand up is said as a join, not a hand.
    rerender({ ...base, people: [sam, maya, jo, up(lee, 40)] })
    vi.advanceTimersByTime(20_000)
    expect(said()).toEqual([
      "Maya Chen raised their hand",
      "Jo Park raised their hand, 2nd in line",
      "You raised your hand, 3rd in line",
      "Maya Chen lowered their hand",
      "2 hands lowered",
      "Lee Hall joined",
    ])
  })

  it("says who waits in the knock bar's words, gathered, and nothing of a knock let in at once", () => {
    const gia = { ticket: "t1", name: "Gia Rossi" }
    const priya = { ticket: "t2", name: "Priya Shah" }
    const lee = { ticket: "t3", name: "Lee Hall" }
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: base })
    rerender({ ...base, knocks: [gia] })
    vi.advanceTimersByTime(3_000)
    rerender({ ...base, knocks: [gia, priya] })
    vi.advanceTimersByTime(3_000)
    rerender({ ...base, knocks: [gia, priya, lee] })
    rerender({ ...base, knocks: [gia, priya] })
    vi.advanceTimersByTime(3_000)
    expect(said()).toEqual(["Gia Rossi is waiting to join", "2 people are waiting to join"])
  })

  it("says recording and captions stopping, and leaves their starts to their pills", () => {
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: base })
    rerender({ ...base, recording: true, captions: true })
    vi.advanceTimersByTime(3_000)
    expect(said()).toEqual([])
    rerender({ ...base, recording: false, captions: false })
    vi.advanceTimersByTime(5_000)
    expect(said()).toEqual(["Recording stopped", "Captions are off"])
  })

  it("leaves a moment between two sentences, so one never cuts the other off", () => {
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: { ...base, recording: true, captions: true } })
    rerender({ ...base, recording: false, captions: false })
    vi.advanceTimersByTime(100)
    expect(said()).toEqual(["Recording stopped"])
    vi.advanceTimersByTime(1_000)
    expect(said()).toEqual(["Recording stopped"])
    vi.advanceTimersByTime(600)
    expect(said()).toEqual(["Recording stopped", "Captions are off"])
  })
})
