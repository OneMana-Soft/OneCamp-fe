import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ScopePrompt } from "./scopePromptDialog"

// D-CAL-6: a change to one instance of a repeating event asks what it is for,
// with "This event" picked, so a quick confirm keeps the change to the one.
afterEach(cleanup)

describe("the scope prompt", () => {
  it("offers this event, this and following, and all events, with this event picked", () => {
    render(<ScopePrompt action="change" onDone={() => {}} />)
    const choices = screen.getAllByRole("radio")
    expect(choices.map((c) => c.closest("div")?.textContent)).toEqual(["This event", "This and following events", "All events"])
    expect(screen.getByRole("radio", { name: "This event" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("heading", { name: "Change a repeating event" })).toBeTruthy()
  })

  it("answers the scope picked", () => {
    const done = vi.fn()
    render(<ScopePrompt action="change" onDone={done} />)
    fireEvent.click(screen.getByRole("radio", { name: "All events" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(done).toHaveBeenCalledWith("all")
  })

  it("keeps the change to the one instance on a plain confirm", () => {
    const done = vi.fn()
    render(<ScopePrompt action="delete" onDone={done} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(done).toHaveBeenCalledWith("this")
  })

  it("changes nothing when it is closed", () => {
    const done = vi.fn()
    render(<ScopePrompt action="delete" onDone={done} />)
    expect(screen.getByRole("heading", { name: "Delete a repeating event" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(done).toHaveBeenCalledWith(null)
  })
})
