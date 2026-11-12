import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const posts = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => posts(...a) } }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ name }: { name: string }) => <span data-face={name} /> }))

import CallerRinging, { CallerRingPlace, useCallerRing } from "@/components/livekit/CallerRinging"
import { CALL_RING_EVENT } from "@/lib/calls/ring"
import { OWN_ERRORS } from "@/lib/http/ownErrors"

// The stage's use (VideoConference): the ring's state, and its place while it shows.
function Stage({ sessionId, inCall }: { sessionId: string; inCall: string[] | null }) {
  const shown = useCallerRing(sessionId, inCall)
  return shown ? <CallerRinging shown={shown} /> : null
}
// The strip's use: the ring's place while a board or a share holds the stage (V-779).
function Strip({ onShow, tile }: { onShow: () => void; tile: { w: number; h: number } }) {
  const shown = useCallerRing("s1", ["jonas"])
  return shown ? <CallerRingPlace shown={shown} tile={tile} onShow={onShow} /> : null
}

const NOW = Date.parse("2026-11-05T12:00:00Z")
const MAYA = { uuid: "maya", name: "Maya Rao" }
const told = (data: unknown) => act(() => void window.dispatchEvent(new CustomEvent(CALL_RING_EVENT, { detail: data })))
const ringing = (people: { uuid: string; name: string }[], session = "s1") => told({ state: "ringing", session, people, ring_until: new Date(NOW + 30_000).toISOString() })
const declined = (by: { uuid: string; name: string }, session = "s1") => told({ state: "declined", session, by })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  vi.setSystemTime(NOW)
  posts.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the caller's ring, on the stage while they're alone (slack-06 H2)", () => {
  it("rings one person: their face, Ringing Maya… and up to 30 seconds; no Ring again yet", () => {
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    expect(screen.getByText("Ringing Maya…")).toBeTruthy()
    expect(screen.getByText("Up to 30 seconds")).toBeTruthy()
    expect(screen.getByLabelText("Maya Rao, ringing")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ring again" })).toBeNull()
  })

  it("Maya declined: says so, once, and offers Ring again", () => {
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    declined(MAYA)
    expect(screen.getByText("Maya declined", { selector: "p:not([aria-live])" })).toBeTruthy()
    expect(screen.getByLabelText("Maya Rao, declined")).toBeTruthy()
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Maya declined")
    expect(screen.getByRole("button", { name: "Ring again" })).toBeTruthy()
  })

  it("at the ring's end: Maya didn't answer, and Ring again", () => {
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    act(() => void vi.advanceTimersByTime(30_000))
    expect(screen.getByText("Maya didn't answer", { selector: "p:not([aria-live])" })).toBeTruthy()
    expect(screen.getByLabelText("Maya Rao, didn't answer")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ring again" })).toBeTruthy()
  })

  it("a group: every face with its own state, and a summary of the settled ones only", () => {
    const five = ["Sam Lee", "Ana Cruz", "Bo Lin", "Cy Park", "Di Wu"].map((name, i) => ({ uuid: `p${i}`, name }))
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing(five)
    declined(five[0])
    declined(five[1])
    expect(screen.getByText("Ringing 5 people…")).toBeTruthy()
    expect(screen.getByText("2 declined")).toBeTruthy()
    expect(screen.getByLabelText("Sam Lee, declined")).toBeTruthy()
    expect(screen.getByLabelText("Bo Lin, ringing")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ring again" })).toBeNull()
    act(() => void vi.advanceTimersByTime(30_000))
    expect(screen.getByText("2 declined · 3 didn't answer")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ring again" })).toBeTruthy()
  })

  it("someone who joins leaves the row", () => {
    const { rerender } = render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA, { uuid: "sam", name: "Sam Lee" }])
    rerender(<Stage sessionId="s1" inCall={["jonas", "sam"]} />)
    expect(screen.queryByLabelText("Sam Lee, ringing")).toBeNull()
    expect(screen.getByLabelText("Maya Rao, ringing")).toBeTruthy()
  })

  it("Ring again asks the server, and says its refusal in words", async () => {
    posts.mockRejectedValueOnce({ response: { status: 429, data: { code: "still_ringing" } } })
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    declined(MAYA)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Ring again" })))
    expect(posts).toHaveBeenCalledWith("/calls/s1/ring", {}, OWN_ERRORS)
    expect(screen.getByText("It's still ringing.")).toBeTruthy()
  })

  it("a new ring says nothing of the last one's refusal", async () => {
    posts.mockRejectedValueOnce({ response: { status: 429, data: { code: "still_ringing" } } })
    render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    declined(MAYA)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Ring again" })))
    expect(screen.getByText("It's still ringing.")).toBeTruthy()
    // Rung again later (the server's own ring, with its own end).
    told({ state: "ringing", session: "s1", people: [MAYA], ring_until: new Date(NOW + 61_000).toISOString() })
    expect(screen.getByText("Ringing Maya…")).toBeTruthy()
    expect(screen.queryByText("It's still ringing.")).toBeNull()
  })

  it("draws nothing once someone is in the call with you", () => {
    const { container, rerender } = render(<Stage sessionId="s1" inCall={["jonas"]} />)
    ringing([MAYA])
    expect(container.innerHTML).not.toBe("")
    rerender(<Stage sessionId="s1" inCall={null} />)
    expect(container.innerHTML).toBe("")
  })

  it("draws nothing for another call's ring, or before any", () => {
    const { container } = render(<Stage sessionId="s1" inCall={["jonas"]} />)
    expect(container.innerHTML).toBe("")
    ringing([MAYA], "s2")
    expect(container.innerHTML).toBe("")
  })
})

describe("the ring's place in the strip, while a board or a share holds the stage (V-779)", () => {
  it("shows whom it rings and what it says: a button that puts the ring back on the stage", () => {
    const onShow = vi.fn()
    render(<Strip onShow={onShow} tile={{ w: 200, h: 112 }} />)
    ringing([MAYA])
    const place = screen.getByRole("button", { name: "Show the ring: Ringing Maya…" })
    expect(place.textContent).toContain("Ringing Maya…")
    expect(place.querySelectorAll("[data-face]")).toHaveLength(1)
    expect(place.querySelector(".ring-pulse")).toBeTruthy()
    fireEvent.click(place)
    expect(onShow).toHaveBeenCalledOnce()
    // Ring again is the stage's: the strip's place only shows the ring.
    expect(screen.queryByRole("button", { name: "Ring again" })).toBeNull()
  })

  it("says a decline, politely too, its face still; a group shows as many faces as its place holds and how many it rings", () => {
    render(<Strip onShow={() => {}} tile={{ w: 85, h: 85 }} />)
    ringing([MAYA])
    declined(MAYA)
    expect(screen.getByRole("button", { name: "Show the ring: Maya declined" })).toBeTruthy()
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Maya declined")
    expect(document.querySelector(".ring-pulse")).toBeNull()
    cleanup()
    render(<Strip onShow={() => {}} tile={{ w: 85, h: 85 }} />)
    ringing(["Sam Lee", "Ana Cruz", "Bo Lin", "Cy Park", "Di Wu"].map((name, i) => ({ uuid: `p${i}`, name })))
    // A phone's 85 px square holds two 28 px faces inside its padding (three overlapped made 72 px of its 69: the outer
    // ones clipped, DESIGN-BUILD-127 F1d); the headline counts them all.
    const place = screen.getByRole("button", { name: "Show the ring: Ringing 5 people…" })
    expect(place.querySelectorAll("[data-face]")).toHaveLength(2)
    cleanup()
    render(<Strip onShow={() => {}} tile={{ w: 200, h: 112 }} />)
    ringing(["Sam Lee", "Ana Cruz", "Bo Lin"].map((name, i) => ({ uuid: `p${i}`, name })))
    expect(screen.getByRole("button", { name: "Show the ring: Ringing 3 people…" }).querySelectorAll("[data-face]")).toHaveLength(3)
  })
})
