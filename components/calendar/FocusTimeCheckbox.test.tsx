import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { EventOptionCheckbox } from "@/components/calendar/FocusTimeCheckbox"

afterEach(cleanup)

// An event's option rows (focus time, away, Google, answers by email, its call's lobby): a screen reader says the name
// once and the hint once, and while a change is asked the switch waits for the answer.
describe("EventOptionCheckbox", () => {
  it("names its switch by the name alone, and describes it by the hint", () => {
    render(<EventOptionCheckbox label="Focus time" hint="Pause your notifications while this runs." checked={false} onChange={() => {}} />)
    const toggle = screen.getByRole("switch", { name: "Focus time" })
    expect(toggle).toHaveAccessibleDescription("Pause your notifications while this runs.")
  })

  it("turns on from a press on its hint, as on its name", () => {
    const onChange = vi.fn()
    render(<EventOptionCheckbox label="Away" hint="Time off." checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByText("Time off."))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("waits, busy, while its change is asked, and takes a press again once it's answered", () => {
    const onChange = vi.fn()
    const row = (pending: boolean) => <EventOptionCheckbox label="Invited guests skip the lobby" hint="They come straight in." checked={false} pending={pending} onChange={onChange} />
    const { rerender } = render(row(true))
    const toggle = screen.getByRole("switch")
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute("aria-busy", "true")
    fireEvent.click(toggle)
    expect(onChange).not.toHaveBeenCalled()
    rerender(row(false))
    expect(toggle).toBeEnabled()
    expect(toggle).not.toHaveAttribute("aria-busy")
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
