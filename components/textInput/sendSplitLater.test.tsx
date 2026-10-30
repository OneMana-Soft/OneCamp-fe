import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { SendSplit } from "./composerTools"

const LOAD = { timeout: 8000 }

afterEach(cleanup)
// Thursday 15 Oct 2026, 10:00 on this machine's clock.
pinTestClock(new Date(2026, 9, 15, 10, 0))

async function customTime() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Send later" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: /Custom time/ }))
  return screen.findByRole("group", { name: "Custom time" }, LOAD)
}

// D14: the composer's Custom time… was the browser's datetime-local box, and
// took only a time more than a minute ahead where the server takes 30
// seconds, with no word of why, and any time past the server's 120 days.
describe("the composer's Send later, Custom time…", () => {
  it("swaps the menu for the app's date and time fields and schedules what they say", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={onSchedule} />)
    const group = await customTime()
    expect(document.querySelector("input[type='datetime-local']")).toBeNull()
    // Two hours ahead to begin with.
    expect(within(group).getByRole("button", { name: /^Time/ })).toHaveTextContent("12:00 PM")
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(onSchedule).toHaveBeenCalledWith(new Date(2026, 9, 15, 12, 0))
  })

  it("takes the server's window, and says why a time is out of it", { timeout: 20000 }, async () => {
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={() => {}} />)
    const group = await customTime()
    fireEvent.click(within(group).getByRole("button", { name: /^Time/ }))
    const box = await screen.findByLabelText("Type a time", {}, LOAD)
    fireEvent.change(box, { target: { value: "9:00" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(await screen.findByText("Pick a time at least 30 seconds from now.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Schedule" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps its keys from the menu, so Tab and typing stay in the form", { timeout: 20000 }, async () => {
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={() => {}} />)
    const group = await customTime()
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    within(group).getByRole("button", { name: /^Date/ }).dispatchEvent(tab)
    // The menu prevents Tab inside itself; the form's own keys never reach it.
    expect(tab.defaultPrevented).toBe(false)
  })
})
