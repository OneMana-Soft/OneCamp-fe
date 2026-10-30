import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import * as Y from "yjs"
import { PHONE_DOCK } from "./phoneDock"
import { FacilitationFailed, facilitationOf, missingFromBar, presentersIn, roundIn, timerIn, useFacilitationOn } from "./facilitationDock"

let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

afterEach(() => {
  cleanup()
  mobile = false
})

/** A board's live connection as the bar reads it: the shared facilitation map, and each screen's awareness state by client (this one is 1). */
function aBoard() {
  const document = new Y.Doc()
  const states = new Map<number, Record<string, unknown>>([[1, {}]])
  const listeners = new Set<() => void>()
  const awareness = {
    clientID: 1,
    getStates: () => states,
    on: (_: "change", listener: () => void) => void listeners.add(listener),
    off: (_: "change", listener: () => void) => void listeners.delete(listener),
  }
  return {
    provider: { document, awareness } as never,
    set: (key: string, value: unknown) => act(() => void document.getMap("facilitation").set(key, value)),
    state: (clientId: number, state: Record<string, unknown>) =>
      act(() => {
        states.set(clientId, state)
        listeners.forEach((listener) => listener())
      }),
  }
}

const OFF = { presenting: false, voting: false, timer: false }
const VIEW = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 }

describe("what a screen whose facilitation bar couldn't come is missing", () => {
  it("an editor misses the bar's own tools, whatever is on", () => {
    expect(missingFromBar(OFF, true)).toBe("Timer, Vote and Present")
    expect(missingFromBar({ presenting: true, voting: true, timer: true }, true)).toBe("Timer, Vote and Present")
  })

  it("a viewer misses only what's on, in the bar's order, and nothing while nothing is", () => {
    expect(missingFromBar(OFF, false)).toBeNull()
    expect(missingFromBar({ ...OFF, voting: true }, false)).toBe("the vote")
    expect(missingFromBar({ ...OFF, timer: true }, false)).toBe("the timer")
    expect(missingFromBar({ ...OFF, presenting: true }, false)).toBe("who's presenting")
    expect(missingFromBar({ ...OFF, voting: true, timer: true }, false)).toBe("the vote and the timer")
    expect(missingFromBar({ presenting: true, voting: true, timer: true }, false)).toBe("who's presenting, the vote and the timer")
  })
})

describe("the facilitation bar's place when its code couldn't come", () => {
  it("tells an editor at once, in PartRetry's words, and Try again tries again", () => {
    const board = aBoard()
    const retry = vi.fn()
    render(<FacilitationFailed provider={board.provider} editable retry={retry} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load Timer, Vote and Present.")
    fireEvent.click(screen.getByRole("button", { name: "Couldn't load Timer, Vote and Present. Try again" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("tells a viewer nothing while nothing is on, then what is, as it changes", () => {
    const board = aBoard()
    const { container } = render(<FacilitationFailed provider={board.provider} editable={false} retry={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    board.set("voting", { id: "r1", perPerson: 3, byId: "lee", byName: "Lee" })
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the vote.")
    board.set("timer", { endsAt: Date.now() + 60_000, durationMs: 60_000, byName: "Lee" })
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the vote and the timer.")
    board.set("voting", null)
    board.set("timer", null)
    expect(container).toBeEmptyDOMElement()
  })

  it("tells a viewer who's presenting from another screen, and never from its own", () => {
    const board = aBoard()
    const { container } = render(<FacilitationFailed provider={board.provider} editable={false} retry={() => {}} />)
    board.state(1, { presenting: { view: VIEW, name: "Vic" } })
    expect(container).toBeEmptyDOMElement()
    board.state(2, { presenting: { view: VIEW, name: "Ann" } })
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load who's presenting.")
    board.state(2, { presenting: null })
    expect(container).toBeEmptyDOMElement()
  })

  it("docks where the bar docks: above the footer on a phone, above the tool bar on a computer", () => {
    const board = aBoard()
    mobile = true
    const phone = render(<FacilitationFailed provider={board.provider} editable retry={() => {}} />)
    expect(screen.getByRole("alert")).toHaveClass(PHONE_DOCK.facilitation)
    expect(screen.getByRole("alert")).toHaveAttribute("data-phone-foot")
    phone.unmount()
    mobile = false
    render(<FacilitationFailed provider={board.provider} editable retry={() => {}} />)
    expect(screen.getByRole("alert")).not.toHaveClass(PHONE_DOCK.facilitation)
  })
})

// One reader of what's on (code review, 29 Oct): the bar and its place when its code couldn't come read the
// round, the timer and who's presenting the same way, so they never disagree.
describe("the one reader of what's on", () => {
  it("counts another screen presenting, never this screen's own, and only with a view", () => {
    const b = aBoard()
    const { awareness, document } = b.provider as unknown as { awareness: Parameters<typeof presentersIn>[0]; document: Y.Doc }
    expect(presentersIn(awareness)).toEqual([])
    b.state(1, { presenting: { userId: "me", name: "Me", view: VIEW } })
    expect(presentersIn(awareness), "this screen's own presenting").toEqual([])
    b.state(2, { presenting: null })
    b.state(3, { presenting: { userId: "lee", name: "Lee" } })
    expect(presentersIn(awareness), "no view, so not presenting").toEqual([])
    b.state(4, { presenting: { userId: "ann", name: "Ann", view: VIEW } })
    expect(presentersIn(awareness)).toEqual([{ clientId: 4, userId: "ann", name: "Ann", view: VIEW }])
    expect(presentersIn(null)).toEqual([])
    expect(roundIn(facilitationOf(document))).toBeNull()
  })

  it("reads a round, an ended round (on until cleared, as the bar shows its Results) and a timer from the shared map", () => {
    const b = aBoard()
    const shared = facilitationOf((b.provider as unknown as { document: Y.Doc }).document)
    const round = { id: "r1", perPerson: 3, byId: "lee", byName: "Lee" }
    const timer = { endsAt: 1_000, durationMs: 60_000, byName: "Lee" }
    expect([roundIn(shared), timerIn(shared)]).toEqual([null, null])
    b.set("voting", round)
    expect(roundIn(shared)).toEqual(round)
    b.set("voting", { ...round, closedAt: 5 })
    expect(roundIn(shared)).toEqual({ ...round, closedAt: 5 })
    b.set("timer", timer)
    expect(timerIn(shared)).toEqual(timer)
  })

  it("is what useFacilitationOn says, live: presenting, a round (ended too) and a timer, and nothing once they're gone", () => {
    const b = aBoard()
    const { result } = renderHook(() => useFacilitationOn(b.provider))
    expect(result.current).toEqual(OFF)
    b.state(1, { presenting: { userId: "me", name: "Me", view: VIEW } })
    expect(result.current, "this screen presenting is not something it misses").toEqual(OFF)
    b.state(4, { presenting: { userId: "ann", name: "Ann", view: VIEW } })
    b.set("voting", { id: "r1", perPerson: 3, byId: "lee", byName: "Lee", closedAt: 5 })
    b.set("timer", { endsAt: 1_000, durationMs: 60_000, byName: "Lee" })
    expect(result.current).toEqual({ presenting: true, voting: true, timer: true })
    b.state(4, { presenting: null })
    b.set("voting", null)
    b.set("timer", null)
    expect(result.current).toEqual(OFF)
  })
})
