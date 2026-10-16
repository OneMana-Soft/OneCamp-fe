import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

const seen = vi.fn()
vi.mock("@/lib/board/notes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/board/notes")>()
  return {
    ...real,
    selectedNotes: (...args: Parameters<typeof real.selectedNotes>) => {
      seen()
      return real.selectedNotes(...args)
    },
  }
})
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import BoardTools from "./boardTools"

const BOARD = "b0a10000-0000-4000-8000-000000000001"
type Listener = (elements: readonly unknown[], appState: { selectedElementIds: Record<string, boolean> }) => void

function fakeApi(elements: readonly unknown[] = []) {
  const listeners: Listener[] = []
  const api = {
    getSceneElements: () => elements,
    getAppState: () => ({ selectedElementIds: {} }),
    onChange: (cb: Listener) => {
      listeners.push(cb)
      return () => {}
    },
  }
  return { api: api as never, emit: (els: readonly unknown[], sel: Record<string, boolean>) => listeners.forEach((l) => l(els, { selectedElementIds: sel })) }
}

afterEach(() => {
  cleanup()
  seen.mockReset()
})

describe("a board's tools", () => {
  it("on an empty canvas, offer the five templates drawn small on a pop card", async () => {
    const { api } = fakeApi()
    render(<BoardTools api={api} editable boardId={BOARD} />)
    expect(await screen.findByText("Start with a template")).toBeTruthy()
    const card = document.querySelector("[data-empty-canvas]")!
    expect(card.className).toMatch(/bg-pop/)
    expect(card.querySelectorAll("[data-template-preview]")).toHaveLength(5)
    expect(screen.getByText("or just start drawing")).toBeTruthy()
  })

  // A full board opened on "Start with a template" for as long as its
  // drawing took to arrive: the card waits for the sync.
  it("wait for the board's drawing before calling it empty", async () => {
    const { api } = fakeApi()
    const view = render(<BoardTools api={api} editable boardId={BOARD} synced={false} />)
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(screen.queryByText("Start with a template")).toBeNull()
    view.rerender(<BoardTools api={api} editable boardId={BOARD} synced />)
    expect(await screen.findByText("Start with a template")).toBeTruthy()
  })

  it("step the empty card aside while the AI composer is open", async () => {
    const { api } = fakeApi()
    render(<BoardTools api={api} editable boardId={BOARD} quiet />)
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(screen.queryByText("Start with a template")).toBeNull()
  })

  it("offer selected notes as tasks on a floating bar", () => {
    const { api, emit } = fakeApi()
    render(<BoardTools api={api} editable boardId={BOARD} />)
    const note = { id: "n1", type: "rectangle", isDeleted: false, boundElements: [{ id: "t1", type: "text" }] }
    const text = { id: "t1", type: "text", isDeleted: false, containerId: "n1", text: "Ship the SSO fix", originalText: "Ship the SSO fix" }
    act(() => emit([note, text], { n1: true }))
    expect(screen.getByRole("toolbar", { name: "Selected notes" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Make a task" })).toBeTruthy()
  })

  it("skip the frames of a pan, where the shapes and the selection are the same", () => {
    const { api, emit } = fakeApi()
    render(<BoardTools api={api} editable boardId={BOARD} />)
    const shapes = [{ id: "a", type: "rectangle", isDeleted: false }]
    const selection = {}
    seen.mockReset()
    act(() => {
      for (let frame = 0; frame < 60; frame++) emit(shapes, selection)
    })
    expect(seen).toHaveBeenCalledTimes(1)
    // A new selection is read.
    act(() => emit(shapes, { a: true }))
    expect(seen).toHaveBeenCalledTimes(2)
  })
})
