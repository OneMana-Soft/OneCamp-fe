import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { SchedulePicker } from "./scheduleSendButton"

const LOAD = { timeout: 8000 }

/** The custom moment's fields, once they have loaded (they load as the picker shows). */
const fields = () => screen.findByRole("group", { name: "Custom time" }, LOAD)

/** Types a time into the custom moment's time field and takes it. */
async function typeTime(text: string) {
  fireEvent.click(within(await fields()).getByRole("button", { name: /^Time/ }))
  const box = await screen.findByLabelText("Type a time", {}, LOAD)
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: "Enter" })
}

// MC-41: Schedule greyed out with no reason for any time under a minute
// ahead, though the server takes 30 seconds. D14: the time was the browser's
// datetime-local box, mm/dd/yyyy with a clock of its own.
describe("send later's custom time", () => {
  afterEach(cleanup)
  // Thursday 15 Oct 2026, 10:00 on this machine's clock.
  pinTestClock(new Date(2026, 9, 15, 10, 0))

  it("is the app's date and time fields, never the browser's box (D14)", async () => {
    render(<SchedulePicker onPick={() => {}} />)
    const group = await fields()
    expect(document.querySelector("input[type='datetime-local']")).toBeNull()
    // An hour ahead to begin with.
    expect(within(group).getByRole("button", { name: /^Date/ })).toHaveTextContent("Thu 15 Oct 2026")
    expect(within(group).getByRole("button", { name: /^Time/ })).toHaveTextContent("11:00 AM")
  })

  it("says why Schedule can't be pressed, and takes a time the server would", { timeout: 20000 }, async () => {
    const onPick = vi.fn()
    render(<SchedulePicker onPick={onPick} />)
    const schedule = screen.getByRole("button", { name: "Schedule" }) as HTMLButtonElement
    expect(schedule.disabled).toBe(false)

    await typeTime("9:00")
    expect(schedule.disabled).toBe(true)
    expect(schedule.getAttribute("aria-describedby")).toBeTruthy()
    expect(screen.getByText("Pick a time at least 30 seconds from now.")).toBeTruthy()

    await typeTime("14:00")
    expect(schedule.disabled).toBe(false)
    expect(screen.queryByText(/Pick a time/)).toBeNull()
    fireEvent.click(schedule)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toEqual(new Date(2026, 9, 15, 14, 0))
  })

  it("offers only the times still to come today", { timeout: 20000 }, async () => {
    render(<SchedulePicker onPick={() => {}} />)
    fireEvent.click(within(await fields()).getByRole("button", { name: /^Time/ }))
    const list = await screen.findByRole("listbox", { name: "Time" }, LOAD)
    expect(list.querySelector("[role='option']")).toHaveTextContent("10:15 AM")
  })
})
