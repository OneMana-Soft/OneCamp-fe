import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetchState.value }))

import AIActivityCard from "@/components/admin/AIActivityCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("AI activity", () => {
  // A failed read said "No AI activity yet.": on the governance record, the
  // claim that nothing happened is the one that must not be made by accident.
  it("says the activity could not be loaded, with Try again, instead of claiming there was none", () => {
    const mutate = vi.fn()
    fetchState.value = { data: undefined, isLoading: false, isError: new Error("Network Error"), mutate }
    render(<AIActivityCard />)
    expect(screen.getByText(/Couldn't load the AI activity/)).toBeTruthy()
    expect(screen.queryByText(/No AI activity yet/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("is a section with a heading, without the extra margin that broke the tab's rhythm", () => {
    fetchState.value = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { container } = render(<AIActivityCard />)
    expect(screen.getByRole("heading", { name: "AI activity" })).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/\bmt-6\b/)
  })

  // Each row's icon sat in a grey tinted tile; the playful layer puts it on
  // the AI and automation group's tile.
  it("puts each row's icon on the AI group's dusk tile", () => {
    fetchState.value = {
      data: { data: [{ kind: "agent_run", title: "Release Captain", summary: "Posted the notes", at: new Date().toISOString(), status: "succeeded" }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<AIActivityCard />)
    expect(screen.getByText("Release Captain")).toBeTruthy()
    expect(document.querySelector(".hue-dusk")).toBeTruthy()
  })
})
