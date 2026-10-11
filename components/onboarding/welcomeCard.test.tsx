import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { WelcomeCard } from "./WelcomeCard"

// The new member's first landing (design v3, E5): a welcome card once per
// browser, chips that fill the message box, and gone after the first message.

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const people = [
  { id: "u1", name: "Priya Raman" },
  { id: "u2", name: "Arjun Mehta" },
  { id: "u3", name: "Hana Sato" },
]

describe("the welcome card", () => {
  it("welcomes the new member by name and says who is here", () => {
    render(<WelcomeCard channelName="general" me="Priya Raman" people={people} total={15} onSuggest={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Welcome to #general, Priya" })).toBeTruthy()
    expect(screen.getByText("Say hello. Arjun, Hana and 12 others are here.")).toBeTruthy()
  })

  it("fills the message box from a chip", () => {
    const onSuggest = vi.fn()
    render(<WelcomeCard channelName="general" me="Priya Raman" people={people} onSuggest={onSuggest} />)
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }))
    expect(onSuggest).toHaveBeenCalledWith("Quick question: ")
  })

  it("shows once per browser", () => {
    const { unmount } = render(<WelcomeCard channelName="general" me="Priya" people={people} onSuggest={vi.fn()} />)
    expect(screen.queryByRole("region", { name: "Welcome" })).toBeTruthy()
    unmount()
    render(<WelcomeCard channelName="general" me="Priya" people={people} onSuggest={vi.fn()} />)
    expect(screen.queryByRole("region", { name: "Welcome" })).toBeNull()
  })

  it("collapses after the first message", async () => {
    vi.useFakeTimers()
    const { rerender } = render(<WelcomeCard channelName="general" me="Priya" people={people} onSuggest={vi.fn()} />)
    rerender(<WelcomeCard channelName="general" me="Priya" people={people} onSuggest={vi.fn()} sent />)
    expect(document.querySelector("[data-welcome-card]")?.hasAttribute("data-leaving")).toBe(true)
    await act(async () => void vi.advanceTimersByTime(200))
    expect(document.querySelector("[data-welcome-card]")).toBeNull()
    vi.useRealTimers()
  })
})
