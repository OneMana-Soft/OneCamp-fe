import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const announce = vi.fn()
vi.mock("@/lib/ui/announce", () => ({ announce: (t: string) => announce(t) }))

import { useCallAnnouncements, type AnnouncedCall } from "./useCallAnnouncements"

// meet-18 (D-CL-13): the call says each change once, to a screen reader:
// joins and leaves, hands up with their place and down, someone waiting to join,
// who started recording (UX-CALLS-H1: a pill's live region mounts with its
// words, which most screen readers miss), and recording or captions stopping
// (a captions start is its notice's). Several within a moment are said as one,
// and one sentence never cuts another off.

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

  // V-948: with the call's transcript on and kept, its lines are filed under
  // the recording: the screen reader hears that a transcript comes with it, as
  // the notice says. Captions that keep nothing say what they always said.
  it("a screen reader hears that a transcript comes with the recording while the call keeps one (V-948)", () => {
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: base })
    rerender({ ...base, recording: true, recordingBy: "Maya Chen", captions: true, transcript: true })
    vi.advanceTimersByTime(3_000)
    expect(said()).toEqual(["Maya Chen started recording, with a transcript"])
    rerender({ ...base, recording: false, captions: true, transcript: false })
    rerender({ ...base, recording: true, recordingBy: "Maya Chen", captions: true, transcript: false })
    vi.advanceTimersByTime(5_000)
    expect(said()).toEqual(["Maya Chen started recording, with a transcript", "Recording stopped", "Maya Chen started recording"])
  })

  // On purpose (UX-CALLS-H1): a recording's start was left to its pill, and
  // the pill's live region mounts with its words, which most screen readers
  // miss. Who started it is said now; a captions start is still its notice's.
  it("a screen reader hears who started recording, and recording and captions stopping", () => {
    const { rerender } = renderHook((c: AnnouncedCall) => useCallAnnouncements(c), { initialProps: base })
    rerender({ ...base, recording: true, recordingBy: "Maya Chen", captions: true })
    vi.advanceTimersByTime(3_000)
    expect(said()).toEqual(["Maya Chen started recording"])
    rerender({ ...base, recording: false, captions: false })
    vi.advanceTimersByTime(5_000)
    expect(said()).toEqual(["Maya Chen started recording", "Recording stopped", "Captions are off"])
    // A server that doesn't say who: that it started.
    rerender({ ...base, recording: true })
    vi.advanceTimersByTime(2_000)
    expect(said().at(-1)).toBe("Recording started")
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
