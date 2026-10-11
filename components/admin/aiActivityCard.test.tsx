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

  // Design v3 (admin §A23): the audit log's row anatomy. The actor is the
  // agent square (identity), the category a neutral chip; the row's icon sat
  // on the AI group's tinted tile, a category dressed as identity.
  it("leads each row with the agent square, and draws no tinted tile", () => {
    fetchState.value = {
      data: { data: [{ kind: "agent_run", title: "Release Captain", summary: "Posted the notes", at: new Date().toISOString(), status: "succeeded" }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<AIActivityCard />)
    expect(screen.getByText("Release Captain")).toBeTruthy()
    expect(document.querySelector("[data-ai-row] [data-agent-avatar]")).toBeTruthy()
    expect(document.querySelector(".hue-dusk")).toBeNull()
    expect(document.querySelector("[data-settings-card]")).toBeTruthy()
  })
})
