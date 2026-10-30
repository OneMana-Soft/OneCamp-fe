import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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
})

describe("a board's tools", () => {
  it("on an empty canvas, offer the five templates drawn small on a pop card, the rest a press away, and the note key", async () => {
    const { api } = fakeApi()
    const more = vi.fn()
    render(<BoardTools api={api} editable boardId={BOARD} onMoreTemplates={more} />)
    expect(await screen.findByText("Start with a template")).toBeTruthy()
    const card = document.querySelector("[data-empty-canvas]")!
    expect(card.className).toMatch(/bg-pop/)
    expect(card.querySelectorAll("[data-template-preview]")).toHaveLength(5)
    fireEvent.click(screen.getByRole("button", { name: "See all templates" }))
    expect(more).toHaveBeenCalledTimes(1)
    expect(card.textContent).toMatch(/or press N for a note/)
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

  it("read the scene only when its shapes change, not on each frame of a pan", async () => {
    const { api, emit } = fakeApi([{ id: "a", type: "rectangle", isDeleted: false }])
    render(<BoardTools api={api} editable boardId={BOARD} />)
    const shapes: unknown[] = []
    // An empty scene, the same array 60 times: the card comes once.
    act(() => {
      for (let frame = 0; frame < 60; frame++) emit(shapes, {})
    })
    expect(await screen.findByText("Start with a template")).toBeTruthy()
    // A shape arrives: the card goes (after its fade).
    act(() => emit([{ id: "b", type: "rectangle", isDeleted: false }], {}))
    await waitFor(() => expect(screen.queryByText("Start with a template")).toBeNull())
  })
})
