import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SchedulePicker } from "./scheduleSendButton"
import { toLocalInputValue } from "@/lib/messages/schedulePresets"

// MC-41: Schedule greyed out with no reason for any time under a minute
// ahead, though the server takes 30 seconds.
describe("send later's typed time", () => {
  afterEach(cleanup)

  it("says why Schedule can't be pressed, and takes a time the server would", () => {
    const onPick = vi.fn()
    render(<SchedulePicker onPick={onPick} />)
    const field = screen.getByLabelText("Custom time")
    fireEvent.change(field, { target: { value: toLocalInputValue(new Date(Date.now() - 60_000)) } })
    const schedule = screen.getByRole("button", { name: "Schedule" }) as HTMLButtonElement
    expect(schedule.disabled).toBe(true)
    expect(schedule.getAttribute("aria-describedby")).toBeTruthy()
    expect(screen.getByText("Pick a time at least 30 seconds from now.")).toBeTruthy()

    fireEvent.change(field, { target: { value: toLocalInputValue(new Date(Date.now() + 2 * 3600_000)) } })
    expect(schedule.disabled).toBe(false)
    expect(screen.queryByText(/Pick a time/)).toBeNull()
    fireEvent.click(schedule)
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})
