// Joining by a room's name or a link from the page that starts a meeting
// (calls meet-01): Enter and Join both go, a room in this app at its member
// door and a call elsewhere in a tab of its own, and what can't be joined is
// said under the field, which a screen reader hears with it.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const router = { push: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { JoinByCode } = await import("./JoinByCode")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  router.push.mockReset()
})

const field = () => screen.getByRole("textbox", { name: "Or join with a room's name or a link" })
const join = () => screen.getByRole("button", { name: "Join" })

describe("JoinByCode", () => {
  it("joins a room by its name on Enter, at the door that lets a member in as themselves", () => {
    render(<JoinByCode />)
    expect(join()).toBeDisabled()
    fireEvent.change(field(), { target: { value: "Maya Chen" } })
    fireEvent.submit(field().closest("form")!)
    expect(router.push).toHaveBeenCalledWith("/app/meet/join/r/maya-chen")
  })

  it("opens a call somewhere else in a tab of its own, by Join", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    render(<JoinByCode />)
    fireEvent.change(field(), { target: { value: "https://zoom.us/j/123456" } })
    fireEvent.click(join())
    expect(open).toHaveBeenCalledWith("https://zoom.us/j/123456", "_blank", "noopener,noreferrer")
    expect(router.push).not.toHaveBeenCalled()
  })

  it("says what it can't join, under the field, until the field changes", () => {
    render(<JoinByCode />)
    fireEvent.change(field(), { target: { value: "javascript:alert(1)" } })
    fireEvent.click(join())
    expect(router.push).not.toHaveBeenCalled()
    expect(field()).toHaveAttribute("aria-invalid", "true")
    expect(field()).toHaveAccessibleDescription("Type a room's name, or paste a call's link.")
    fireEvent.change(field(), { target: { value: "maya-chen" } })
    expect(field()).not.toHaveAttribute("aria-invalid")
  })
})
