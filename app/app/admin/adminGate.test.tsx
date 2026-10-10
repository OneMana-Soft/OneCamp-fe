import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The gate in front of Admin. While it asks who you are, it draws the page's
// frame, not a spinner in the middle of nothing. When it can't find out (the
// profile request failed), it says so and offers Try again: it used to tell an
// admin "Admins only", which is the answer to a different question. Someone
// who isn't an admin is still told so.

const profile = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => profile.value }))

const { default: AdminGate } = await import("./layout")

afterEach(() => {
  cleanup()
  profile.value = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

describe("the admin gate", () => {
  it("draws the admin page's frame while it checks", () => {
    profile.value = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    render(<AdminGate><p>Members</p></AdminGate>)
    const frame = screen.getByRole("status", { name: "Loading Admin" })
    expect(frame.querySelector(".animate-spin")).toBeNull()
    expect(screen.queryByText("Members")).toBeNull()
  })

  it("says it couldn't check, and tries again, when the profile request failed", () => {
    const mutate = vi.fn()
    profile.value = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<AdminGate><p>Members</p></AdminGate>)
    expect(screen.queryByText("Admins only")).toBeNull()
    expect(screen.getByText("Couldn't load this page")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("tells someone who isn't an admin, and lets an admin in", () => {
    profile.value = { data: { data: { user_is_admin: false } }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { unmount } = render(<AdminGate><p>Members</p></AdminGate>)
    expect(screen.getByText("Admins only")).toBeTruthy()
    unmount()
    profile.value = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<AdminGate><p>Members</p></AdminGate>)
    expect(screen.getByText("Members")).toBeTruthy()
  })
})
