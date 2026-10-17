import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { Label } from "@/components/ui/label"

import { DateField, TimeField } from "./date-field"
import { typedDate } from "./date-field-panels"
import { DateProperty } from "@/components/task/taskDateField"

// D14 (PG2-06): one date field and one time field in place of the browser's
// boxes. Their panels are chunks of their own, loaded on first open.
const LOAD = { timeout: 8000 }

afterEach(cleanup)
// The fields open on the month of their value, or of today.
pinTestClock()

describe("the date field", () => {
  it("reads the date written out, or its placeholder, as the app's own field", () => {
    const { rerender } = render(<DateField value="" onChange={() => {}} aria-label="Due" />)
    const field = screen.getByRole("button", { name: "Due" })
    expect(field).toHaveTextContent("Pick a date")
    expect(field.className).toContain("field-surface")
    rerender(<DateField value="2026-10-15" onChange={() => {}} aria-label="Due" />)
    expect(field).toHaveTextContent("Thu 15 Oct 2026")
  })

  it("gives the day picked as yyyy-MM-dd, the string a date box gave", { timeout: 20000 }, async () => {
    const change = vi.fn()
    render(<DateField value="2026-10-15" onChange={change} aria-label="Due" />)
    fireEvent.click(screen.getByRole("button", { name: /^Due/ }))
    const grid = await screen.findByRole("grid", {}, LOAD)
    const day = Array.from(grid.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "20")
    expect(day).toBeTruthy()
    fireEvent.click(day!)
    expect(change).toHaveBeenCalledWith("2026-10-20")
  })

  it("stops a form's submit when it is required and empty, and opens itself", { timeout: 20000 }, async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={submit}>
        <DateField value="" onChange={() => {}} aria-label="Starts on" required />
        <button type="submit">Create</button>
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(submit).not.toHaveBeenCalled()
    // Open, with the keyboard in the month (the picker's own first focus).
    const grid = await screen.findByRole("grid", {}, LOAD)
    expect(grid.contains(document.activeElement)).toBe(true)
  })
})

describe("the time field", () => {
  it("takes a typed time and gives HH:mm on a 24-hour clock", { timeout: 20000 }, async () => {
    const change = vi.fn()
    render(<TimeField value="" onChange={change} aria-label="At" />)
    expect(screen.getByRole("button", { name: "At" })).toHaveTextContent("Pick a time")
    fireEvent.click(screen.getByRole("button", { name: "At" }))
    const box = await screen.findByLabelText("Type a time", {}, LOAD)
    fireEvent.change(box, { target: { value: "9:30" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(change).toHaveBeenCalledWith("09:30")
  })

  it("lists the quarter hours after a start, each with how long it makes", { timeout: 20000 }, async () => {
    render(<TimeField value="10:00" onChange={() => {}} aria-label="Until" since="09:00" />)
    fireEvent.click(screen.getByRole("button", { name: /^Until/ }))
    const list = await screen.findByRole("listbox", { name: "Time" }, LOAD)
    const options = Array.from(list.querySelectorAll("[role='option']"))
    expect(options[0]).toHaveTextContent("15 min")
    expect(list.querySelector("[aria-selected='true']")).toHaveTextContent("1 h")
  })
})

// REVIEW-FE-SHELL db2 F1: the browser fires `invalid` at every empty required
// field of a form, and each field opened itself over the last.
describe("a form with two empty required dates", () => {
  it("opens the first, as the browser's bubble goes to the first, and leaves the second", { timeout: 20000 }, async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={submit}>
        <DateField id="first" value="" onChange={() => {}} aria-label="Starts" required />
        <DateField id="second" value="" onChange={() => {}} aria-label="Ends" required />
        <button type="submit">Send</button>
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(submit).not.toHaveBeenCalled()
    const grid = await screen.findByRole("grid", {}, LOAD)
    expect(document.getElementById("first")!.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById("second")!.getAttribute("aria-expanded")).toBe("false")
    expect(grid.contains(document.activeElement)).toBe(true)
  })
})

// REVIEW-FE-SHELL db2 F3: named by its label alone, a screen reader never
// heard the date or time the field showed, as it did a date box's.
describe("a field's name", () => {
  it("says its label and its date, labelled by a <label>", async () => {
    render(
      <>
        <Label htmlFor="d">Starts on</Label>
        <DateField id="d" value="2026-10-15" onChange={() => {}} />
      </>,
    )
    const field = document.getElementById("d")!
    expect(field).toHaveTextContent("Thu 15 Oct 2026")
    await vi.waitFor(() => expect(field).toHaveAccessibleName("Starts on Thu 15 Oct 2026"))
  })

  it("says its label and its time, labelled by aria-label, and its label alone while empty", () => {
    const { rerender } = render(<TimeField aria-label="From" value="" onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "From" })).toBeTruthy()
    rerender(<TimeField aria-label="From" value="09:30" onChange={() => {}} />)
    const field = screen.getByRole("button", { name: /^From, / })
    expect(field).toHaveAccessibleName(`From, ${field.textContent}`)
  })
})

// REVIEW-FE-SHELL db2 F5: the form's date field and the task's had two
// pickers; there is one, with a typed date, the quick days and Clear.
describe("the one date picker", () => {
  it("is what a form's date field and a task's date open", { timeout: 20000 }, async () => {
    render(<DateField value="2026-10-15" onChange={() => {}} aria-label="Starts" />)
    fireEvent.click(screen.getByRole("button", { name: /^Starts/ }))
    expect(await screen.findByLabelText("Type a date", {}, LOAD)).toBeTruthy()
    expect(document.querySelectorAll("[data-date-panel]")).toHaveLength(1)
    cleanup()
    render(<DateProperty isAdmin label="Due" value={new Date(2026, 9, 15)} onSelect={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Due/ }))
    expect(await screen.findByLabelText("Type a date", {}, LOAD)).toBeTruthy()
    expect(document.querySelectorAll("[data-date-panel]")).toHaveLength(1)
  })

  it("takes a typed date with Enter, and a quick day with a press", { timeout: 20000 }, async () => {
    const change = vi.fn()
    render(<DateField value="" onChange={change} aria-label="Starts" />)
    fireEvent.click(screen.getByRole("button", { name: "Starts" }))
    const box = await screen.findByLabelText("Type a date", {}, LOAD)
    fireEvent.change(box, { target: { value: "20/10/2026" } })
    expect(screen.getByText(/Tue 20 Oct 2026 · press Enter/)).toBeTruthy()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(change).toHaveBeenLastCalledWith("2026-10-20")
    // Held by its caller, the field still says nothing picked: open it again.
    fireEvent.click(screen.getByRole("button", { name: "Starts" }))
    // Today is the pinned day (lib/testing/testClock), Tomorrow the next.
    fireEvent.click(await screen.findByRole("button", { name: "Tomorrow" }, LOAD))
    expect(change).toHaveBeenLastCalledWith("2026-10-16")
  })

  it("offers Clear only where a date may be empty and has one, and only the quick days in bounds", { timeout: 20000 }, async () => {
    render(<DateField value="2026-10-20" onChange={() => {}} aria-label="Ends" min="2026-10-16" />)
    fireEvent.click(screen.getByRole("button", { name: /^Ends/ }))
    const quick = await screen.findByRole("group", { name: "Quick days" }, LOAD)
    expect(Array.from(quick.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Tomorrow", "Next week"])
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy()
    cleanup()
    render(<DateField value="2026-10-20" onChange={() => {}} aria-label="Due" required />)
    fireEvent.click(screen.getByRole("button", { name: /^Due/ }))
    await screen.findByRole("group", { name: "Quick days" }, LOAD)
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull()
  })

  it("is 44px under a finger, its quick days 16px apart (app/phone.css F3)", { timeout: 20000 }, async () => {
    render(<DateField value="2026-10-20" onChange={() => {}} aria-label="Due" />)
    fireEvent.click(screen.getByRole("button", { name: /^Due/ }))
    const quick = await screen.findByRole("group", { name: "Quick days" }, LOAD)
    expect(quick.className).toContain("pointer-coarse:gap-4")
    for (const b of [...Array.from(quick.querySelectorAll("button")), screen.getByRole("button", { name: "Clear" })]) expect(b.className).toContain("pointer-coarse:h-11")
    expect(screen.getByLabelText("Type a date").className).toContain("pointer-coarse:h-11")
  })

  it("opens in a sheet on a phone", { timeout: 20000 }, async () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
    try {
      render(<DateProperty isAdmin label="Due" value={new Date(2026, 9, 15)} onSelect={() => {}} />)
      fireEvent.click(screen.getByRole("button", { name: /^Due/ }))
      await screen.findByLabelText("Type a date", {}, LOAD)
      expect(document.querySelector("[data-vaul-drawer]")?.querySelector("[data-date-panel]")).not.toBeNull()
    } finally {
      window.matchMedia = real
    }
  })
})

describe("a date typed", () => {
  const now = new Date(2026, 9, 15, 12)
  it("is read day first, as the app writes dates, with a month first only where day first can't be", () => {
    expect(typedDate("20/10/2026", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("2026-10-20", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("20 Oct 2026", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("Oct 20, 2026", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("10/20/2026", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("3/4/2026", now)).toEqual(new Date(2026, 3, 3))
  })

  it("is this year without one, and reads the calendar's words", () => {
    expect(typedDate("20/10", now)).toEqual(new Date(2026, 9, 20))
    expect(typedDate("tomorrow", now)).toEqual(new Date(2026, 9, 16))
    expect(typedDate("", now)).toBeUndefined()
    expect(typedDate("soon", now)).toBeUndefined()
  })
})
