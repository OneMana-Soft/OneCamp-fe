import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A board's version history says when its versions couldn't be read, with Try
// again, rather than "No versions yet" over a board that has them.

const mutate = vi.fn()
let fetched: { data?: unknown; isLoading: boolean; isError?: unknown } = { isLoading: false }
let fetchedWith: unknown[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (...args: unknown[]) => {
    fetchedWith = args
    return { ...fetched, mutate }
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))

import { OWN_ERRORS } from "@/lib/axiosInstance"
import { BoardVersionHistoryDialog } from "./boardVersionHistoryDialog"

const dialog = () => render(<BoardVersionHistoryDialog open onOpenChange={() => {}} boardId="b1" />)
const refused = (status: number, msg?: string) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data: msg ? { msg } : {} } })

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  fetchedWith = []
  mutate.mockReset()
})

describe("a board's version history", () => {
  it("says the versions couldn't be read, and tries again, instead of saying there are none", () => {
    fetched = { isLoading: false, isError: refused(500) }
    dialog()
    expect(screen.getByText("Couldn't load this board's history")).toBeTruthy()
    expect(screen.queryByText("No versions yet")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  it("raises no toast for a failed read, which it says in the list's place", () => {
    dialog()
    expect(fetchedWith[3]).toBe(OWN_ERRORS)
  })

  it("gives the server's own reason when it refused", () => {
    fetched = { isLoading: false, isError: refused(403, "You can't see this board's history.") }
    dialog()
    expect(screen.getByText("You can't see this board's history.")).toBeTruthy()
  })

  it("keeps the versions it has when a later read fails", () => {
    fetched = { isLoading: false, isError: refused(500), data: { data: [{ id: "s1", reason: "interval", created_at: new Date().toISOString(), element_count: 3 }] } }
    dialog()
    expect(screen.queryByText("Couldn't load this board's history")).toBeNull()
    expect(screen.getByText("Auto-saved")).toBeTruthy()
  })

  it("still says there are none when the read worked and found none", () => {
    fetched = { isLoading: false, data: { data: [] } }
    dialog()
    expect(screen.getByText("No versions yet")).toBeTruthy()
  })
})
