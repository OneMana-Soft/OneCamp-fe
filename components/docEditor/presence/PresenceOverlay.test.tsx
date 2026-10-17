import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Editor } from "@tiptap/core"

// Live presence over a doc's editor (B8): what this tab says about itself in
// awareness (idle, where it looks only while followed), and Follow and Jump by
// awareness client. Its edits, and the presence store, are
// presenceFromTheStart.test.ts's. Where things are on the page is the browser's
// (the e2e two-people specs); here the editor's geometry is a stand-in.

const live = vi.hoisted(() => ({
  awareness: null as unknown,
  scroller: null as unknown,
  posOf: vi.fn((_e: unknown, json: unknown) => (json ? 7 : null)),
  showPos: vi.fn(),
  showView: vi.fn(() => true),
  viewOf: vi.fn(() => ({ at: "top", dy: 0 })),
  flagCaret: vi.fn(),
}))
vi.mock("./live", () => ({
  awarenessOf: () => live.awareness,
  scrollerOf: () => live.scroller,
  posOf: live.posOf,
  showPos: live.showPos,
  showView: live.showView,
  viewOf: live.viewOf,
  flagCaret: live.flagCaret,
}))

import PresenceOverlay from "./PresenceOverlay"
import { createDocCommandBus, DocBusContext } from "@/components/docEditor/registry/commandBus"
import { usePresenceControl, type PresenceControl } from "./control"

type State = Record<string, unknown>
class FakeAwareness {
  clientID = 1
  states = new Map<number, State>([[1, { user: { id: "u-me", name: "Priya Shah" } }]])
  private handlers = new Set<() => void>()
  getStates = () => this.states
  getLocalState = () => this.states.get(this.clientID) ?? null
  setLocalStateField = (field: string, value: unknown) => {
    this.states.set(this.clientID, { ...this.getLocalState(), [field]: value })
    this.emit()
  }
  put(client: number, state: State | null) {
    if (state) this.states.set(client, state)
    else this.states.delete(client)
    this.emit()
  }
  on = (_: string, cb: () => void) => void this.handlers.add(cb)
  off = (_: string, cb: () => void) => void this.handlers.delete(cb)
  emit() {
    for (const h of [...this.handlers]) h()
  }
}

let awareness: FakeAwareness
let updates: Array<(e: unknown) => void>
let editor: Editor
const bus = createDocCommandBus("doc-1")
const maya = { user: { id: "u-maya", name: "Maya Chen" } }

let seen: { control?: PresenceControl } = {}
function Probe() {
  seen = { control: usePresenceControl(bus.key) }
  return null
}

const mount = () =>
  render(
    <DocBusContext.Provider value={bus}>
      <PresenceOverlay docId="doc-1" editor={editor} />
      <Probe />
    </DocBusContext.Provider>,
  )

beforeEach(() => {
  awareness = new FakeAwareness()
  updates = []
  live.awareness = awareness
  const scroller = document.createElement("div")
  document.body.append(scroller)
  live.scroller = scroller
  editor = {
    isDestroyed: false,
    on: (_: string, cb: (e: unknown) => void) => void updates.push(cb),
    off: () => {},
  } as unknown as Editor
  for (const f of [live.posOf, live.showPos, live.showView, live.viewOf, live.flagCaret]) f.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  ;(live.scroller as HTMLElement).remove()
})

const local = () => awareness.getLocalState() as State
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

describe("what this tab says about itself", () => {
  it("is active as it opens, idle after 2 minutes with no input, and active again on a key", () => {
    vi.useFakeTimers()
    mount()
    expect(local().idle).toBe(false)
    act(() => vi.advanceTimersByTime(2 * 60_000 + 10))
    expect(local().idle).toBe(true)
    fireEvent.keyDown(window, { key: "a" })
    expect(local().idle).toBe(false)
  })

  it("says where it is looking only while someone follows it", () => {
    mount()
    expect(local().view).toBeUndefined()
    act(() => awareness.put(2, { ...maya, following: 1 }))
    expect(local().view).toEqual({ at: "top", dy: 0 })
    act(() => awareness.put(2, { ...maya, following: null }))
    expect(local().view).toBeNull()
  })
})

describe("following someone", () => {
  it("frames the doc in their name, follows their caret, and stops on Esc", async () => {
    awareness.states.set(5, { ...maya, cursor: { head: "h1" } })
    mount()
    await act(frame)
    act(() => seen.control!.follow(5))
    expect(local().following).toBe(5)
    expect(screen.getByText("Following Maya Chen")).toBeTruthy()
    expect(live.showPos).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByText("Following Maya Chen")).toBeNull()
    expect(local().following).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("Stopped following Maya Chen")
  })

  it("stops when the reader moves the page themselves", () => {
    awareness.states.set(5, { ...maya, cursor: { head: "h1" } })
    mount()
    act(() => seen.control!.follow(5))
    fireEvent.wheel(live.scroller as HTMLElement)
    expect(screen.queryByText("Following Maya Chen")).toBeNull()
  })

  it("says so when the person followed leaves", () => {
    awareness.states.set(5, { ...maya, cursor: { head: "h1" } })
    vi.useFakeTimers()
    mount()
    act(() => seen.control!.follow(5))
    act(() => awareness.put(5, null))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByText("Following Maya Chen")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("Maya Chen left the doc, so you're no longer following them")
  })
})

describe("jumping to someone", () => {
  it("goes to their caret and plays their name flag", () => {
    awareness.states.set(5, { ...maya, cursor: { head: "h1" } })
    mount()
    act(() => void seen.control!.jump(5))
    expect(live.showPos).toHaveBeenCalledWith(editor, live.scroller, 7, true)
    expect(live.flagCaret).toHaveBeenCalledWith(editor, "u-maya", 7)
  })

  it("asks a reader with no caret where they are looking, then goes there and stops asking", () => {
    awareness.states.set(6, { user: { id: "u-sam", name: "Sam Rivera" }, mode: "viewing" })
    mount()
    act(() => void seen.control!.jump(6))
    expect(local().following).toBe(6)
    act(() => awareness.put(6, { user: { id: "u-sam", name: "Sam Rivera" }, mode: "viewing", view: { at: "x", dy: 4 } }))
    expect(live.showView).toHaveBeenCalledWith(editor, live.scroller, { at: "x", dy: 4 })
    expect(local().following).toBeNull()
  })
})
