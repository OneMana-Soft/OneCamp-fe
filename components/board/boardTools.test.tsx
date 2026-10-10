import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

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
  it("on an empty canvas, offer the templates under a drawing in the board's own hue", () => {
    const { api } = fakeApi()
    render(<BoardTools api={api} editable boardId={BOARD} />)
    expect(screen.getAllByText("Start from a template").length).toBeGreaterThan(0)
    const svg = document.querySelector("svg.hue-" + hueFor(BOARD))
    expect(svg).toBeTruthy()
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
