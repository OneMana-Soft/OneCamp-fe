import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { INK_SEND_MS, INK_STROKE_MAX, LASER_MS } from "@/lib/calls/ink"
import { cursorColours } from "./boardColours"
import { BoardCursors } from "./boardCursors"
import { type PointerUpdate, useBoardPresence } from "./boardPresence"

// A laser everyone sees on a board (miro-28, miro-10).
// Sent (useBoardPresence): while Excalidraw's laser is held down, where it points goes out on the board's awareness
// as Excalidraw's own collaboration sends it (pointer.tool "laser", button "down"), not throttled as a hover is but in
// at most one update every INK_SEND_MS, the newest place each time, with nothing kept, so a hold of any length goes
// on; let go, or another tool mid-stroke, "up" goes at once.
// Seen (BoardCursors): handed to Excalidraw's own trail for a collaborator, below. It never sticks: it goes at once
// when its person's state leaves (they left, or this screen went offline), and a laser with nothing new for LASER_MS
// ends as if let go (its person went still, or offline without a word). A share link's guest sees the lasers and no
// one's name.

type State = Record<string, unknown>
/** The board's awareness as two tabs share it, in y-protocols' shape as far as presence reads it. */
function board() {
  const states = new Map<number, State>()
  const tabs: Tab[] = []
  class Tab {
    fns = { change: new Set<() => void>(), update: new Set<() => void>() }
    constructor(public clientID: number) {
      states.set(clientID, {})
      tabs.push(this)
    }
    getStates = () => states
    getLocalState = () => states.get(this.clientID) ?? null
    setLocalState(s: State | null) {
      if (s) states.set(this.clientID, s)
      else states.delete(this.clientID)
      for (const t of tabs) t.fns.change.forEach((fn) => fn())
      this.fns.update.forEach((fn) => fn())
    }
    setLocalStateField(k: string, v: unknown) {
      const s = this.getLocalState()
      if (s) this.setLocalState({ ...s, [k]: v })
    }
    on = (e: "change" | "update", fn: () => void) => this.fns[e].add(fn)
    off = (e: "change" | "update", fn: () => void) => this.fns[e].delete(fn)
  }
  return { a: new Tab(1), b: new Tab(2), join: (clientID: number) => new Tab(clientID) }
}

const ANN = { id: "u-ann", name: "Ann Lee" }
const laser = (x: number, y: number, button: "down" | "up" = "down"): PointerUpdate => ({ pointer: { x, y, tool: "laser" }, button })
const API = { getAppState: () => ({ scrollX: 10, scrollY: 20, zoom: { value: 2 } }), onScrollChange: () => () => {} }

let a: ReturnType<typeof board>["a"]
let b: ReturnType<typeof board>["b"]
let join: ReturnType<typeof board>["join"]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] })
  ;({ a, b, join } = board())
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useBoardPresence's laser", () => {
  let sent: State[]
  const publisher = (publish = true) => {
    const hook = renderHook(({ publish }) => useBoardPresence({ awareness: a as never, user: ANN, publish }), { initialProps: { publish } })
    sent = []
    a.on("update", () => sent.push({ ...a.getLocalState() }))
    return hook
  }

  it("sends where a held laser points, one update at most every INK_SEND_MS with the newest place, and lets it go at once", () => {
    const { result } = publisher()
    act(() => result.current(laser(0, 0)))
    // A fast drag: ten moves in 40 ms. Each went out at once as a drag; the laser's wait their turn.
    for (let i = 1; i <= 10; i++) {
      act(() => vi.advanceTimersByTime(4))
      act(() => result.current(laser(i * 10, i * 5)))
    }
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ pointer: { x: 0, y: 0, tool: "laser" }, button: "down" })
    act(() => vi.advanceTimersByTime(INK_SEND_MS))
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ pointer: { x: 100, y: 50, tool: "laser" }, button: "down" })
    act(() => result.current(laser(120, 60, "up")))
    expect(sent).toHaveLength(3)
    expect(sent[2]).toMatchObject({ pointer: { x: 120, y: 60, tool: "laser" }, button: "up" })
    // Nothing of it waits: no word comes after the let-go.
    act(() => vi.advanceTimersByTime(LASER_MS * 2))
    expect(sent).toHaveLength(3)
  })

  it("sends a hover or a drag with the pointer and the button in one update, as before", () => {
    const { result } = publisher()
    act(() => result.current({ pointer: { x: 5, y: 6, tool: "pointer" }, button: "down" }))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ pointer: { x: 5, y: 6 }, button: "down" })
  })

  it("publishes no laser for a guest who may not draw, and takes a held one back when drawing is switched off", () => {
    const { result, rerender } = publisher(false)
    act(() => result.current(laser(1, 1)))
    expect(sent).toHaveLength(0)
    rerender({ publish: true })
    act(() => result.current(laser(2, 2)))
    act(() => result.current(laser(3, 3)))
    expect(sent.at(-1)).toMatchObject({ pointer: { x: 2, y: 2, tool: "laser" }, button: "down" })
    rerender({ publish: false })
    expect(a.getLocalState()).toMatchObject({ user: null, pointer: null, button: null })
    // The move that waited its turn never goes.
    act(() => vi.advanceTimersByTime(INK_SEND_MS * 4))
    expect(a.getLocalState()).toMatchObject({ user: null, pointer: null, button: null })
  })
})

describe("useBoardPresence's laser, held long and pointed twice", () => {
  let sent: State[]
  const publisher = () => {
    const hook = renderHook(() => useBoardPresence({ awareness: a as never, user: ANN, publish: true }))
    sent = []
    a.on("update", () => sent.push({ ...a.getLocalState() }))
    return hook
  }
  const at = (s: State) => s.pointer as { x: number; y: number; tool?: string }

  it("keeps a hold past the old cap going: the newest point still goes out, held down", () => {
    const { result } = publisher()
    act(() => result.current(laser(0, 0)))
    for (let n = 1; n <= INK_STROKE_MAX + 300; n++) {
      if (n % 3 === 0) act(() => vi.advanceTimersByTime(INK_SEND_MS))
      result.current(laser(n % 500, n))
    }
    act(() => vi.advanceTimersByTime(INK_SEND_MS))
    expect(sent.at(-1)).toMatchObject({ pointer: { x: (INK_STROKE_MAX + 300) % 500, y: INK_STROKE_MAX + 300, tool: "laser" }, button: "down" })
  })

  it("pointing twice inside LASER_MS: the first let-go is its last word, and the second stroke stays held past LASER_MS", () => {
    const { result } = publisher()
    act(() => result.current(laser(0, 0)))
    act(() => result.current(laser(5, 5)))
    act(() => result.current(laser(6, 6, "up")))
    act(() => vi.advanceTimersByTime(INK_SEND_MS * 2))
    expect(sent.at(-1)).toMatchObject({ button: "up" })
    const second = sent.length
    act(() => result.current(laser(100, 100)))
    for (let t = 0; t <= LASER_MS * 2; t += 40) {
      act(() => vi.advanceTimersByTime(40))
      act(() => result.current(laser(100 + t / 10, 100)))
    }
    const held = sent.slice(second)
    expect(held.length).toBeGreaterThan(LASER_MS / INK_SEND_MS)
    for (const s of held) expect(s).toMatchObject({ pointer: { tool: "laser" }, button: "down" })
    act(() => result.current(laser(300, 100, "up")))
    const end = sent.length
    act(() => vi.advanceTimersByTime(LASER_MS * 2))
    expect(sent.slice(end).filter((s) => s.button === "down")).toHaveLength(0)
  })

  it("another tool mid-stroke ends the stroke as a let-go does, and the next press starts afresh", () => {
    const { result } = publisher()
    act(() => result.current(laser(10, 10)))
    act(() => vi.advanceTimersByTime(INK_SEND_MS))
    act(() => result.current(laser(20, 10)))
    act(() => vi.advanceTimersByTime(INK_SEND_MS))
    const before = sent.length
    act(() => result.current({ pointer: { x: 30, y: 10, tool: "pointer" }, button: "up" }))
    const ended = sent.slice(before)
    expect(ended[0]).toMatchObject({ pointer: { x: 20, y: 10, tool: "laser" }, button: "up" })
    act(() => vi.advanceTimersByTime(LASER_MS * 2))
    expect(sent.slice(before).filter((s) => s.button === "down")).toHaveLength(0)
    act(() => result.current(laser(50, 50)))
    expect(sent.at(-1)).toMatchObject({ pointer: { x: 50, y: 50, tool: "laser" }, button: "down" })
    expect(at(sent.at(-1)!)).toMatchObject({ x: 50, y: 50 })
  })
})

// Seen: everyone else's laser goes to Excalidraw's own trail for a collaborator (LaserTrails, dist/dev/index.js
// :23905-23990), the very trail the drawer sees of their own: about the last second and 50 points, decaying from its
// tail while held, the rest gone as it's let go. Each as a collaborator with no cursor and no name of Excalidraw's
// (renderCursor false, no username), in its person's colour, keyed by its awareness client and that colour, never a name.
describe("BoardCursors' lasers, on Excalidraw's own trail", () => {
  // The viewer's motion setting, as the app's one check (lib/reducedMotion) reads it.
  let reduce = false
  beforeEach(() => {
    reduce = false
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("prefers-reduced-motion: reduce"), media: q }))
    a.setLocalState({ user: { id: "u-ann", name: "Ann Lee" }, pointer: { x: 0, y: 0 }, button: "up" })
  })
  afterEach(() => vi.unstubAllGlobals())
  const say = (fields: State) => act(() => a.setLocalState({ ...a.getLocalState(), ...fields }))
  let api: typeof API & { updateScene: ReturnType<typeof vi.fn> }
  const show = (dark = false, cursors?: boolean) => {
    api = { ...API, updateScene: vi.fn() }
    return render(<BoardCursors api={api as never} awareness={b as never} dark={dark} cursors={cursors} />)
  }
  /** What Excalidraw was last told of its collaborators. */
  const collaborators = () => (api.updateScene.mock.calls.at(-1)?.[0] as { collaborators?: Map<string, State> } | undefined)?.collaborators
  const drawn = () => [...(collaborators() ?? new Map()).entries()].filter(([, c]) => c.pointer)
  const held = (x: number, y: number) => ({ pointer: { x, y, tool: "laser" }, button: "down" })

  it("hands a held laser to Excalidraw's own trail where it points, in its person's colour, with no cursor or name of Excalidraw's", () => {
    const { container } = show()
    expect(drawn()).toHaveLength(0)
    say(held(40, 10))
    const fill = cursorColours("Ann Lee", false).fill
    expect(drawn()).toEqual([[expect.any(String), { pointer: { x: 40, y: 10, tool: "laser", renderCursor: false, laserColor: fill }, button: "down" }]])
    say(held(80, 30))
    expect(drawn()[0][1]).toEqual({ pointer: { x: 80, y: 30, tool: "laser", renderCursor: false, laserColor: fill }, button: "down" })
    // One trail, Excalidraw's: none of ours.
    expect(container.querySelector("[data-board-cursors] > svg")).toBeNull()
  })

  it("lets go as the drawer does: the trail ends, and its collaborator goes LASER_MS on", () => {
    show()
    say(held(0, 0))
    say({ pointer: { x: 5, y: 5, tool: "laser" }, button: "up" })
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 5, y: 5 }, button: "up" })
    act(() => vi.advanceTimersByTime(LASER_MS + 20))
    expect(collaborators()?.size).toBe(0)
  })

  it("keeps a hold past the old cap going on everyone else's board", () => {
    show()
    for (let n = 0; n <= INK_STROKE_MAX + 300; n += 50) say(held(n, n))
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: INK_STROKE_MAX + 300, y: INK_STROKE_MAX + 300 }, button: "down" })
  })

  it("ends a still laser with nothing new for LASER_MS, then takes up its next move", () => {
    show()
    say(held(0, 0))
    act(() => vi.advanceTimersByTime(LASER_MS + 20))
    expect(drawn()[0][1]).toMatchObject({ button: "up" })
    act(() => vi.advanceTimersByTime(LASER_MS + 20))
    expect(collaborators()?.size).toBe(0)
    say(held(9, 9))
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 9, y: 9 }, button: "down" })
  })

  it("ends a held laser at once when its person's pointer goes (they stop publishing, with no let-go) or takes another tool", () => {
    show()
    say(held(0, 0))
    say({ pointer: null })
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 0, y: 0 }, button: "up" })
    say(held(5, 5))
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 5, y: 5 }, button: "down" })
    say({ pointer: { x: 6, y: 6, tool: "selection" }, button: "down" })
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 5, y: 5 }, button: "up" })
  })

  it("ends a held laser gone quiet (offline without a word) after LASER_MS while someone else's state keeps changing", () => {
    show()
    const cy = join(3)
    say(held(0, 0))
    for (let t = 0; t <= LASER_MS + 20; t += 50) {
      act(() => cy.setLocalState({ user: { id: "u-cy", name: "Cy Ott" }, pointer: { x: t, y: 0 }, button: "up" }))
      act(() => vi.advanceTimersByTime(50))
    }
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 0, y: 0 }, button: "up" })
  })

  it("takes the trail away at once when its person leaves mid-stroke, as Excalidraw stops a trail whose collaborator went", () => {
    show()
    say(held(0, 0))
    const [[key]] = drawn()
    act(() => a.setLocalState(null))
    // Excalidraw stops the trails of collaborators no longer there only while some are: a stand-in, with no pointer.
    expect(collaborators()?.has(key)).toBe(false)
    expect(collaborators()?.size).toBeGreaterThan(0)
    expect(drawn()).toHaveLength(0)
    act(() => vi.advanceTimersByTime(LASER_MS + 20))
    expect(collaborators()?.size).toBe(0)
  })

  it("puts no one's name in a share link's guest's markup, nor in what Excalidraw is told", () => {
    const { container } = show(false, false)
    say(held(1, 1))
    expect(drawn()).toHaveLength(1)
    expect(container.innerHTML).not.toContain("Ann")
    expect(JSON.stringify([...collaborators()!.entries()])).not.toContain("Ann")
    expect(container.querySelector("[data-cursor]")).toBeNull()
  })

  it("colours by the board's theme: a dark board's trail is a new one, in its dark colour", () => {
    const { rerender } = show(false)
    say(held(1, 1))
    const [[light]] = drawn()
    rerender(<BoardCursors api={api as never} awareness={b as never} dark />)
    expect(drawn()).toHaveLength(1)
    expect(drawn()[0][0]).not.toBe(light)
    expect(drawn()[0][1]).toMatchObject({ pointer: { laserColor: cursorColours("Ann Lee", true).fill } })
  })

  it("with reduced motion, shows the pointer and no moving trail: Excalidraw starts none, and a still dot is where it points", () => {
    reduce = true
    const { container } = show(false, false)
    say(held(40, 10))
    const fill = cursorColours("Ann Lee", false).fill
    // Handed over let go: Excalidraw starts no trail for it.
    expect(drawn()).toEqual([[expect.any(String), { pointer: { x: 40, y: 10, tool: "laser", renderCursor: false, laserColor: fill }, button: "up" }]])
    const dots = () => [...container.querySelectorAll<SVGElement>("[data-laser-dot]")]
    expect(dots()).toHaveLength(1)
    // On the board's coordinates as Excalidraw places them (scroll 10, 20; zoom 2), in its person's colour, no name.
    expect(dots()[0].style.transform).toBe("translate(100px, 60px)")
    expect(dots()[0].querySelector("circle")?.getAttribute("fill")).toBe(fill)
    expect(container.innerHTML).not.toContain("Ann")
    say(held(50, 10))
    expect(dots()[0].style.transform).toBe("translate(120px, 60px)")
    // Let go: it stays whole, and goes at once when its time is up, as a call's laser does with reduced motion.
    say({ pointer: { x: 50, y: 10, tool: "laser" }, button: "up" })
    expect(dots()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(LASER_MS + 20))
    expect(dots()).toHaveLength(0)
  })

  it("draws no still dot with motion on, and ends a live trail when reduced motion comes on mid-stroke", () => {
    const { container, rerender } = show()
    say(held(1, 1))
    expect(container.querySelector("[data-laser-dot]")).toBeNull()
    expect(drawn()[0][1]).toMatchObject({ button: "down" })
    reduce = true
    rerender(<BoardCursors api={api as never} awareness={b as never} dark={false} />)
    // The same collaborator, let go: Excalidraw ends the trail it drew (a trail whose collaborator just went quiet would stay).
    expect(drawn()[0][1]).toMatchObject({ pointer: { x: 1, y: 1 }, button: "up" })
    expect(container.querySelectorAll("[data-laser-dot]")).toHaveLength(1)
  })

  it("hands over nothing for what isn't a laser: a hover with it, a pointer that isn't a place, no name", () => {
    show()
    say({ pointer: { x: 1, y: 1, tool: "laser" }, button: "up" })
    say({ pointer: { x: "1", y: 2, tool: "laser" }, button: "down" })
    act(() => a.setLocalState({ pointer: { x: 1, y: 2, tool: "laser" }, button: "down" }))
    expect(drawn()).toHaveLength(0)
  })
})
