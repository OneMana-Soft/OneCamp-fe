import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"
import { useBoardGrid, useBoardSnap, useBoardStyle } from "./boardStyle"

// A board's grid (miro-02 1) is the board's, like its style: kept in its
// document for everyone, put on each canvas once Excalidraw has loaded its own
// scene, and set by Excalidraw's own toggle too.

type Switches = { gridModeEnabled: boolean; objectsSnapModeEnabled: boolean }
type Listener = (elements: readonly unknown[], appState: Switches) => void

/** Excalidraw as the hook sees it: its app state, its scene updates, and its change listeners. */
function canvas({ loading = false } = {}) {
  const state = { gridModeEnabled: false, objectsSnapModeEnabled: false, isLoading: loading }
  const listeners = new Set<Listener>()
  const tell = () => listeners.forEach((l) => l([], { ...state }))
  return {
    state,
    getAppState: () => state,
    updateScene: vi.fn(({ appState }: { appState: Partial<Switches> }) => {
      Object.assign(state, appState)
      tell()
    }),
    onChange: (l: Listener) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    /** Excalidraw's own key (Ctrl+' for the grid, Alt+S for snapping), or its own scene loading over what was there. */
    set(on: boolean, key: keyof Switches = "gridModeEnabled") {
      state[key] = on
      tell()
    },
  }
}

const board = () => {
  const doc = new Y.Doc()
  return { doc, meta: doc.getMap<unknown>("boardMeta"), provider: { document: doc } as never }
}
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

describe("a board's grid", () => {
  it("is off on a board that never said, and turning it on is the board's, on the canvas", async () => {
    const b = board()
    const api = canvas()
    const { result } = renderHook(() => useBoardGrid(api, b.provider, true, true))
    await frame()
    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    expect(b.meta.get("grid")).toBe(true)
    await frame()
    expect(api.state.gridModeEnabled).toBe(true)
  })

  it("comes onto this canvas when a teammate turns it on", async () => {
    const b = board()
    const api = canvas()
    renderHook(() => useBoardGrid(api, b.provider, true, false))
    await frame()
    act(() => b.meta.set("grid", true))
    await frame()
    expect(api.state.gridModeEnabled).toBe(true)
  })

  it("is the board's when someone who can edit uses Excalidraw's own toggle", async () => {
    const b = board()
    const api = canvas()
    renderHook(() => useBoardGrid(api, b.provider, true, true))
    await frame()
    act(() => api.set(true))
    expect(b.meta.get("grid")).toBe(true)
  })

  it("goes back to the board's when someone who can't edit uses that toggle", async () => {
    const b = board()
    const api = canvas()
    renderHook(() => useBoardGrid(api, b.provider, true, false))
    await frame()
    act(() => api.set(true))
    expect(api.state.gridModeEnabled).toBe(false)
    expect(b.meta.get("grid")).toBeUndefined()
  })

  it("waits for Excalidraw's own scene, so its load can't switch the board's grid off for everyone", async () => {
    const b = board()
    b.meta.set("grid", true)
    const api = canvas({ loading: true })
    renderHook(() => useBoardGrid(api, b.provider, true, true))
    await frame()
    expect(api.updateScene).not.toHaveBeenCalled()
    // Excalidraw's own scene loads, its grid off.
    act(() => {
      api.state.isLoading = false
      api.set(false)
    })
    await frame()
    expect(b.meta.get("grid")).toBe(true)
    expect(api.state.gridModeEnabled).toBe(true)
  })

  it("sends the board one change for a toggle that Excalidraw reports twice before the screen catches up", async () => {
    const b = board()
    const api = canvas()
    renderHook(() => useBoardGrid(api, b.provider, true, true))
    await frame()
    const updates = vi.fn()
    b.doc.on("update", updates)
    act(() => {
      api.set(true)
      api.set(true)
    })
    expect(b.meta.get("grid")).toBe(true)
    expect(updates).toHaveBeenCalledTimes(1)
  })
})

// Snapping to shapes and equal gaps (miro-02 3) is the person's own choice,
// on until they turn it off, kept in this browser.
describe("snapping to shapes", () => {
  afterEach(() => localStorage.clear())

  it("is on until the person turns it off, and stays off in this browser", async () => {
    const api = canvas()
    const { result } = renderHook(() => useBoardSnap(api))
    await frame()
    expect(api.state.objectsSnapModeEnabled).toBe(true)
    act(() => result.current[1](false))
    expect(api.state.objectsSnapModeEnabled).toBe(false)

    const next = canvas()
    const again = renderHook(() => useBoardSnap(next))
    await frame()
    expect(again.result.current[0]).toBe(false)
    expect(next.state.objectsSnapModeEnabled).toBe(false)
  })

  it("follows Excalidraw's own key for it", async () => {
    const api = canvas()
    const { result } = renderHook(() => useBoardSnap(api))
    await frame()
    act(() => api.set(false, "objectsSnapModeEnabled"))
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem("onecamp:board:snap")).toBe("off")
  })

  it("waits for Excalidraw's own scene, whose load would switch it off", async () => {
    const api = canvas({ loading: true })
    renderHook(() => useBoardSnap(api))
    await frame()
    expect(api.updateScene).not.toHaveBeenCalled()
    act(() => {
      api.state.isLoading = false
      api.set(false, "objectsSnapModeEnabled")
    })
    await frame()
    expect(api.state.objectsSnapModeEnabled).toBe(true)
  })
})

describe("a board's style", () => {
  it("is clean on a board that opened empty, and hand-drawn on one that has a drawing, until someone chooses", async () => {
    const empty = board()
    const { result } = renderHook(() => useBoardStyle(empty.provider, true))
    expect(result.current[0]).toBe("clean")
    const drawn = board()
    drawn.doc.getMap("elements").set("n1", { id: "n1" })
    const second = renderHook(() => useBoardStyle(drawn.provider, true))
    expect(second.result.current[0]).toBe("sketch")
    act(() => second.result.current[1]("clean"))
    expect(second.result.current[0]).toBe("clean")
  })
})
