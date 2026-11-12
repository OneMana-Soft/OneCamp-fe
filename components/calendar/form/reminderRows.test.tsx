import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ReminderRows } from "./reminderRows"

// The default's note ("· your default") never shows cut (DESIGN-BUILD-114 F5):
// with no room on the row it drops out whole, and the open menu says it.

afterEach(cleanup)

const openMenu = (name: string) =>
  act(() => {
    fireEvent.keyDown(screen.getByRole("combobox", { name }), { key: "ArrowDown" })
  })

describe("a reminder's default note", () => {
  it("is its own piece on one line that can only drop out whole, and the open menu says it", () => {
    render(<ReminderRows reminders={null} email={[]} defaults={{ minutes: [30], email: [30] }} allDay={false} onChange={() => {}} />)
    const first = screen.getByRole("combobox", { name: "Reminder 1" })
    expect(first.textContent).toBe("30 minutes before · your default")
    // One line high, clipped: a note with no room wraps under the value and is hidden, never cut mid-word.
    const line = first.querySelector("[data-reminder-value]")
    expect(line?.className).toMatch(/\bflex-wrap\b/)
    expect(line?.className).toMatch(/\boverflow-hidden\b/)
    expect(line?.className).toMatch(/h-\[1lh\]/)
    expect(line?.querySelector("[data-reminder-note]")?.textContent).toBe(" · your default")
    openMenu("Reminder 1")
    expect(screen.getByText("Your default: 30 minutes before")).toBeTruthy()
  })

  it("is not there once the reminders are the reader's own, nor where the rows set a default", () => {
    const { unmount } = render(<ReminderRows reminders={[30]} email={[]} allDay={false} onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("30 minutes before")
    openMenu("Reminder 1")
    expect(screen.queryByText(/^Your default:/)).toBeNull()
    unmount()
    render(<ReminderRows reminders={null} email={[]} defaults={{ minutes: [30], email: [] }} allDay={false} onChange={() => {}} note="" />)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("30 minutes before")
    openMenu("Reminder 1")
    expect(screen.queryByText(/^Your default:/)).toBeNull()
  })
})
