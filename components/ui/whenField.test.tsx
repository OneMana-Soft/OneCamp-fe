import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { sendLaterProblem } from "@/lib/messages/schedulePresets"
import type { WhenWindow } from "@/lib/time/whenWords"
import { WhenField } from "@/components/ui/when-field"

// When, in words (H3; linear-45 #1): the time typed as it is said, its
// moment said back under it as it is typed, Enter to pick it, and the app's
// date and time fields under that for the moment picked by hand.

// Thursday 15 Oct 2026, 10:00 on this machine's clock.
pinTestClock(new Date(2026, 9, 15, 10, 0))

afterEach(async () => {
  cleanup()
  await new Promise((r) => setTimeout(r, 10))
})

/** A picker's own state around the field, as Remind me holds it. */
function Picker({ onPick, within, initial = "2026-10-16T09:00" }: { onPick: (at: Date) => void; within?: WhenWindow; initial?: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <>
      <WhenField value={value} onChange={setValue} onPick={onPick} within={within} messageId="why" />
      <output data-testid="value">{value}</output>
    </>
  )
}

const box = () => screen.getByRole("textbox", { name: "When" })
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const said = () => document.getElementById("why")?.textContent?.replace(/\s/g, " ")

describe("When, in words", () => {
  it("takes the focus as it opens, its fields under it as the other way to pick", () => {
    render(<Picker onPick={() => {}} />)
    expect(document.activeElement).toBe(box())
    // Short enough for Send later's w-64 popover, whole (DB-115 F1).
    expect(box()).toHaveAttribute("placeholder", "tomorrow 9, in 2 hours")
    const fields = screen.getByRole("group", { name: "Pick a date and time" })
    expect(within(fields).getByRole("button", { name: /^Date/ })).toHaveTextContent("Fri 16 Oct 2026")
  })

  it('says "tomorrow 9" back as it is typed, and Enter picks that time', () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} initial="2026-10-20T14:30" />)
    type("tomorrow 9")
    expect(said()).toBe("tomorrow at 9:00 AM")
    expect(document.getElementById("why")?.getAttribute("aria-live")).toBe("polite")
    expect(box().getAttribute("aria-describedby")).toContain("why")
    // The fields follow the words: the moment picked is one, whichever way.
    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-16T09:00")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(onPick).toHaveBeenCalledWith(new Date(2026, 9, 16, 9, 0))
  })

  it("says why a passed time can't be used, and Enter picks nothing", () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    type("today 9am")
    expect(said()).toBe("That time has passed.")
    expect(box().getAttribute("aria-invalid")).toBe("true")
    // Nothing to pick while the words can't be used: the picker's action waits.
    expect(screen.getByTestId("value")).toHaveTextContent(/^$/)
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(onPick).not.toHaveBeenCalled()
  })

  it("asks for the month in words, and keeps the caller's own window in its own words", () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} within={{ problem: sendLaterProblem }} />)
    type("12/3")
    expect(said()).toBe("Write the month as a word, like Dec 3.")
    type("in 5 months")
    expect(said()).toBe("Pick a time within the next 120 days.")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(onPick).not.toHaveBeenCalled()
  })

  it("gives the moment picked before back when the words are cleared", () => {
    render(<Picker onPick={() => {}} />)
    type("banana")
    expect(screen.getByTestId("value")).toHaveTextContent(/^$/)
    type("")
    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-16T09:00")
    expect(box().getAttribute("aria-invalid")).toBeNull()
  })

  it("clears the words when a day is picked in the fields, so the line and Enter name no other moment", { timeout: 20000 }, async () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    type("tomorrow 9")
    expect(said()).toBe("tomorrow at 9:00 AM")
    fireEvent.click(within(screen.getByRole("group", { name: "Pick a date and time" })).getByRole("button", { name: /^Date/ }))
    const grid = await screen.findByRole("grid", {}, { timeout: 15000 })
    const day = Array.from(grid.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "20")
    fireEvent.click(day!)
    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-20T09:00")
    expect(box()).toHaveValue("")
    expect(said()).toBe("")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(onPick).not.toHaveBeenCalled()
  })

  it("leaves Enter to an input method choosing a word", () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    type("tomorrow 9")
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true })
    expect(onPick).not.toHaveBeenCalled()
  })
})
