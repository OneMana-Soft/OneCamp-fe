import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { RoomEvent, Track } from "livekit-client"
import { CALL_SIGNAL_TOPIC } from "@/lib/calls/signals"
import { LASER_MS } from "@/lib/calls/ink"
import { personHue } from "@/lib/utils/getAvatarColor"
import { heldReason } from "./callHolds"
import { listenForEscape } from "@/lib/keys/escape"
import { fakeCallRoom } from "@/lib/testing/callRoom"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { CallInkContext, ShareInk, useCallInk } from "./callInk"
import { callHues } from "./callHues"

// callHues as it is, and counted: the ink works out the call's colours once for who is in it (V-190).
vi.mock("./callHues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./callHues")>()
  return { ...actual, callHues: vi.fn(actual.callHues) }
})

// Annotation on Call Signals (meet-14, zoom-03): ink over a shared screen, sent
// to the call as it is drawn, in each person's own hue.

const SHARE = "ana|screen_share"
function Harness({ room, share = SHARE, name = "Ana" }: { room: unknown; share?: string; name?: string }) {
  const ink = useCallInk(room as never)
  return (
    <CallInkContext.Provider value={ink}>
      <ShareInk share={share} name={name} frame={{ w: 1920, h: 1080 }} />
    </CallInkContext.Provider>
  )
}

// The one Escape, as the root providers start it for every page.
let stopEscape: () => void = () => {}
beforeAll(() => {
  installPointerEvent()
  stopEscape = listenForEscape()
})
afterAll(() => stopEscape())

beforeEach(() => {
  // A 1000 x 1000 tile: the 16:9 frame in it is 562.5 tall, from y 218.75 (lib/calls/ink's toFrame).
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const surface = (c: HTMLElement) => c.querySelector("[data-ink-surface]") as SVGSVGElement
const strokes = (c: HTMLElement) => Array.from(c.querySelectorAll("[data-ink-stroke]"))
function draw(c: HTMLElement, from: [number, number], to: [number, number]) {
  const s = surface(c)
  fireEvent.pointerDown(s, { clientX: from[0], clientY: from[1], pointerId: 1, button: 0 })
  fireEvent.pointerMove(s, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(s, { clientX: to[0], clientY: to[1], pointerId: 1 })
}

describe("annotation on a shared screen", () => {
  it("draws a stroke over the share and sends it to the call as it goes", () => {
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    const tools = screen.getByRole("toolbar", { name: "Drawing" })
    expect(within(tools).getByRole("button", { name: "Pen" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(tools).getByRole("button", { name: "Laser pointer" }).getAttribute("aria-pressed")).toBe("false")
    within(tools).getByRole("button", { name: "Undo" })
    within(tools).getByRole("button", { name: "Clear my drawings" })
    draw(container, [500, 500], [600, 500])
    const ink = f.sent().filter((m) => m.kind === "ink")
    expect(ink.flatMap((m) => m.payload.p as number[])).toEqual([2048, 2048, 2458, 2048])
    expect(ink.at(-1)).toMatchObject({ payload: { share: SHARE, tool: "pen", end: true }, opts: { reliable: true, topic: CALL_SIGNAL_TOPIC } })
    expect(strokes(container).map((s) => s.getAttribute("data-by"))).toEqual(["sam"])
  })

  it("draws two people whose names share a hue in two colours, the first to join keeping theirs (V-190)", () => {
    // Sam Rivera (you) and Lena Ortiz both hash to lake; you joined first.
    expect(personHue("Lena Ortiz")).toBe(personHue("Sam Rivera"))
    const f = fakeCallRoom()
    Object.assign(f.room.localParticipant, { sid: "PA_sam", joinedAt: new Date(10_000) })
    Object.assign(f.room.remoteParticipants.get("ben")!, { sid: "PA_ben", name: "Lena Ortiz", joinedAt: new Date(20_000) })
    const { container } = render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    draw(container, [500, 500], [600, 500])
    f.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 4096, 4096], end: true }, "ben")
    const hue = Object.fromEntries(strokes(container).map((s) => [s.getAttribute("data-by"), s.getAttribute("data-hue")]))
    expect(hue.sam).toBe(personHue("Sam Rivera"))
    expect(hue.ben).toBeTruthy()
    expect(hue.ben, "Lena's strokes aren't yours").not.toBe(hue.sam)
  })

  it("works out the call's colours once for who is in it, not once a stroke, and again when someone is renamed (V-190)", () => {
    expect(personHue("Maya Chen"), "a name with another hue than ben's").not.toBe(personHue("ben"))
    expect(personHue("Maya Chen")).not.toBe(personHue("Sam Rivera"))
    const f = fakeCallRoom()
    Object.assign(f.room.localParticipant, { sid: "PA_sam", joinedAt: new Date(10_000) })
    const ben = Object.assign(f.room.remoteParticipants.get("ben")!, { sid: "PA_ben", joinedAt: new Date(20_000) })
    const { container } = render(<Harness room={f.room} />)
    vi.mocked(callHues).mockClear()
    for (const id of ["b1", "b2", "b3", "b4"]) f.receive("ink", { share: SHARE, id, at: 0, p: [0, 0, 4096, 4096], end: true }, "ben")
    expect(strokes(container)).toHaveLength(4)
    expect(vi.mocked(callHues), "four strokes, the layer drawn again with each: no new sheet").not.toHaveBeenCalled()
    Object.assign(ben, { name: "Maya Chen" })
    f.emit(RoomEvent.ParticipantNameChanged, "Maya Chen", ben)
    expect(vi.mocked(callHues), "a new name, a new sheet").toHaveBeenCalledTimes(1)
    expect(strokes(container).map((s) => s.getAttribute("data-hue"))).toEqual(Array(4).fill(personHue("Maya Chen")))
  })

  it("draws someone else's stroke in their own hue, and none while the call holds sharing for them", () => {
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    f.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 4096, 4096], end: true }, "ben")
    expect(strokes(container).map((s) => [s.getAttribute("data-by"), s.getAttribute("data-hue")])).toEqual([["ben", personHue("ben")]])
    cleanup()
    const held = fakeCallRoom({ metadata: JSON.stringify({ held: ["share"] }) })
    const second = render(<Harness room={held.room} />)
    held.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 4096, 4096], end: true }, "ben")
    expect(strokes(second.container)).toHaveLength(0)
  })

  it("draws its bar with the dock's own controls: the way out first, set apart, then the tools", () => {
    const f = fakeCallRoom()
    render(<Harness room={f.room} />)
    const annotate = screen.getByRole("button", { name: "Annotate Ana's screen" })
    expect(annotate.getAttribute("data-dock-state")).toBe("on")
    fireEvent.click(annotate)
    const tools = screen.getByRole("toolbar", { name: "Drawing" })
    // DESIGN-BUILD-57 MUST 2: drawing, the bar leads with Stop drawing, and a divider sets it apart from the tools.
    const [first, divider] = Array.from(tools.querySelectorAll("button, [role=separator]"))
    expect(first.getAttribute("aria-label")).toBe("Stop drawing")
    expect(divider.getAttribute("role")).toBe("separator")
    // MUST 3: each is the dock's own control (DockButton), its state as shape and colour.
    for (const b of within(tools).getAllByRole("button")) expect(b.getAttribute("data-dock-state"), b.getAttribute("aria-label")!).toMatch(/^(on|active)$/)
    expect(within(tools).getByRole("button", { name: "Pen" }).getAttribute("data-dock-state")).toBe("active")
    expect(within(tools).getByRole("button", { name: "Laser pointer" }).getAttribute("data-dock-state")).toBe("on")
    fireEvent.click(within(tools).getByRole("button", { name: "Stop drawing" }))
    expect(screen.queryByRole("button", { name: "Pen" })).toBeNull()
    screen.getByRole("button", { name: "Annotate Ana's screen" })
  })

  it("gives Clear all to the sharer and to whoever runs the call, in Clear's menu, and it clears everyone's", async () => {
    const f = fakeCallRoom()
    render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    // Only yours to clear: one press, and no menu.
    screen.getByRole("button", { name: "Clear my drawings" })
    expect(screen.queryByRole("button", { name: "Clear drawings" })).toBeNull()
    cleanup()

    const host = fakeCallRoom({ me: { "oc.role": "host" } })
    const { container } = render(<Harness room={host.room} />)
    host.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 9, 9], end: true }, "ben")
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    expect(screen.queryByRole("button", { name: "Clear my drawings" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "Clear drawings" }), { key: "Enter" })
    await screen.findByRole("menuitem", { name: "Clear my drawings" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear all drawings" }))
    expect(strokes(container)).toHaveLength(0)
    expect(host.sent().find((m) => m.kind === "ink-clear")).toMatchObject({ payload: { share: SHARE, whose: "all" }, opts: { reliable: true, topic: CALL_SIGNAL_TOPIC } })
    cleanup()

    const mine = fakeCallRoom()
    render(<Harness room={mine.room} share="sam|screen_share" name="Sam Rivera" />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate your screen" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "Clear drawings" }), { key: "Enter" })
    await screen.findByRole("menuitem", { name: "Clear all drawings" })
  })

  it("is dimmed and says why while the call holds sharing for you", async () => {
    const f = fakeCallRoom({ metadata: JSON.stringify({ held: ["share"] }) })
    render(<Harness room={f.room} />)
    const annotate = screen.getByRole("button", { name: "Annotate Ana's screen" })
    expect(annotate.getAttribute("aria-disabled")).toBe("true")
    // Why, in the shared tooltip that every call control uses, never a native title.
    expect(annotate.getAttribute("title")).toBeNull()
    fireEvent.focus(annotate)
    expect((await screen.findByRole("tooltip")).textContent).toBe(heldReason("share"))
    fireEvent.click(annotate)
    expect(screen.queryByRole("button", { name: "Pen" })).toBeNull()
  })

  it("undoes your last stroke, and Escape puts the pen down", () => {
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    draw(container, [100, 300], [200, 300])
    draw(container, [100, 400], [200, 400])
    const second = f.sent().filter((m) => m.kind === "ink").at(-1)!.payload.id
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(strokes(container)).toHaveLength(1)
    expect(f.sent().find((m) => m.kind === "ink-undo")).toMatchObject({ payload: { share: SHARE, id: second } })
    fireEvent.keyDown(surface(container), { key: "Escape" })
    screen.getByRole("button", { name: "Annotate Ana's screen" })
    expect(screen.queryByRole("button", { name: "Stop drawing" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Pen" })).toBeNull()
  })

  it("sends your own strokes, and no one else's, to someone who joins mid-share, and to them alone", () => {
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    draw(container, [500, 500], [600, 500])
    f.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 9, 9], end: true }, "ben")
    f.publishData.mockClear()
    f.emit(RoomEvent.ParticipantConnected, { identity: "dee", name: "Dee", attributes: {} })
    const sent = f.sent()
    expect(sent.length).toBeGreaterThan(0)
    for (const m of sent) expect(m).toMatchObject({ kind: "ink", opts: { reliable: true, topic: CALL_SIGNAL_TOPIC, destinationIdentities: ["dee"] } })
    expect(sent.flatMap((m) => m.payload.p as number[])).toEqual([2048, 2048, 2458, 2048])
  })

  it("forgets a share's ink when the share ends", () => {
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    f.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 9, 9], end: true }, "ben")
    expect(strokes(container)).toHaveLength(1)
    f.emit(RoomEvent.TrackUnpublished, { source: Track.Source.ScreenShare }, { identity: "ana" })
    expect(strokes(container)).toHaveLength(0)
  })

  it("forgets your own screen's ink when you stop sharing: your next share starts clean, and a newcomer is sent none of it", () => {
    const mine = "sam|screen_share"
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} share={mine} name="Sam" />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate your screen" }))
    draw(container, [500, 500], [600, 500])
    expect(strokes(container)).toHaveLength(1)
    f.emit(RoomEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare }, f.room.localParticipant)
    expect(strokes(container)).toHaveLength(0)
    f.publishData.mockClear()
    f.emit(RoomEvent.ParticipantConnected, { identity: "cy" })
    expect(f.sent().filter((m) => m.kind === "ink")).toHaveLength(0)
  })

  it("lets a laser stroke fade once it ends", () => {
    vi.useFakeTimers()
    const f = fakeCallRoom()
    const { container } = render(<Harness room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    fireEvent.click(screen.getByRole("button", { name: "Laser pointer" }))
    draw(container, [500, 500], [600, 500])
    expect(strokes(container)).toHaveLength(1)
    expect(f.sent().filter((m) => m.kind === "ink").at(-1)).toMatchObject({ payload: { tool: "laser", end: true } })
    act(() => vi.advanceTimersByTime(LASER_MS + 50))
    expect(strokes(container)).toHaveLength(0)
  })
})
