import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { RepeatControl } from "./repeatControl"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// D-CAL-7: the repeat menu's presets are phrased from the event's start, a
// rule it can't phrase is shown in the server's words and kept, and Custom…
// opens the sheet, whose sentence says what the event will say.
afterEach(cleanup)

// Tuesday 13 October 2026, 10:00: the second Tuesday of the month.
const tue = new Date(2026, 9, 13, 10, 0)

function open() {
  const trigger = screen.getByRole("combobox", { name: "Repeat" })
  act(() => {
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
  })
  return trigger
}

function pick(name: string | RegExp) {
  const option = screen.getByRole("option", { name })
  act(() => {
    fireEvent.keyDown(option, { key: "Enter" })
  })
}

describe("the repeat control", () => {
  it("lists the presets phrased from the start, and Custom…", () => {
    render(<RepeatControl start={tue} rule="" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Repeat" }).textContent).toBe("Doesn't repeat")
    open()
    const options = screen.getAllByRole("option").map((o) => o.textContent)
    expect(options).toEqual(["Doesn't repeat", "Daily", "Weekly on Tuesday", "Monthly on the second Tuesday", "Annually on 13 October", "Every weekday", "Custom…"])
  })

  it("says a preset's rule when one is picked", () => {
    const changed = vi.fn()
    render(<RepeatControl start={tue} rule="" onChange={changed} />)
    open()
    pick("Weekly on Tuesday")
    expect(changed).toHaveBeenCalledWith("FREQ=WEEKLY;BYDAY=TU")
  })

  it("shows a rule it has no preset for in the server's words, and keeps it", () => {
    const changed = vi.fn()
    render(<RepeatControl start={tue} rule="FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1" text="Monthly on the last weekday" onChange={changed} />)
    expect(screen.getByRole("combobox", { name: "Repeat" }).textContent).toBe("Monthly on the last weekday")
    expect(changed).not.toHaveBeenCalled()
  })

  it("opens the custom sheet, whose sentence follows what is set", () => {
    const changed = vi.fn()
    render(<RepeatControl start={tue} rule="" onChange={changed} />)
    open()
    pick("Custom…")
    const sentence = document.querySelector("[data-repeat-sentence]")!
    expect(sentence.textContent).toBe("Weekly on Tuesday")
    fireEvent.change(screen.getByLabelText("Every"), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Thursday" }))
    expect(sentence.textContent).toBe("Every 2 weeks on Tuesday and Thursday")
    fireEvent.click(screen.getByRole("radio", { name: "After" }))
    fireEvent.change(screen.getByLabelText("How many times"), { target: { value: "6" } })
    expect(sentence.textContent).toBe("Every 2 weeks on Tuesday and Thursday, 6 times")
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(changed).toHaveBeenCalledWith("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6")
  })

  // D14: the last date is picked in the app's own date field (a sheet on a
  // phone), never the browser's date box. Its picker is a chunk of its own.
  it("ends on a day picked in the app's date field", { timeout: 20000 }, async () => {
    const changed = vi.fn()
    render(<RepeatControl start={tue} rule="" onChange={changed} />)
    open()
    pick("Custom…")
    // As a person finds it: the menu has closed and the sheet holds the focus.
    await waitFor(() => expect(document.activeElement?.closest("[data-custom-repeat]")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: "On" }))
    const sheet = document.querySelector("[data-custom-repeat]")!
    expect(sheet.querySelector("input[type='date']")).toBeNull()
    const field = screen.getByRole("button", { name: /^Last date/ })
    expect(field).toHaveTextContent("Tue 13 Oct 2026")
    fireEvent.click(field)
    const grid = await screen.findByRole("grid", {}, { timeout: 8000 })
    const day = Array.from(grid.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "27")!
    fireEvent.click(day)
    expect(document.querySelector("[data-repeat-sentence]")!.textContent).toBe("Weekly on Tuesday, until 27 October 2026")
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(changed).toHaveBeenCalledWith("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261027")
  })
})
