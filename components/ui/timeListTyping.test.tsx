import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"

// The time list's type-ahead (content.md C16, CA-31): typing "9" or "930"
// jumps to the first time that starts so. On a 24-hour clock its labels start
// with a zero ("09:00"), so "9" found nothing (REVIEW-FE-SHELL db2 F4). A
// British reader's clock is given to the real clockTime here: vitest's own
// runs are pinned to en-US.
vi.mock("@/lib/utils/date/clock", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/date/clock")>()
  return { ...real, clockTime: (v: Parameters<typeof real.clockTime>[0], o: Parameters<typeof real.clockTime>[1] = {}) => real.clockTime(v, { locale: "en-GB", ...o }) }
})

const { clockTime } = await import("@/lib/utils/date/clock")
const { TimeList, typedKeys } = await import("@/components/ui/date-time-picker")

afterEach(cleanup)
pinTestClock()

function typeInList(...keys: string[]) {
  render(<TimeList value={null} onPick={vi.fn()} />)
  const list = screen.getByRole("listbox", { name: "Time" })
  list.querySelector<HTMLElement>("[role='option']")!.focus()
  for (const key of keys) fireEvent.keyDown(list, { key })
  return document.activeElement?.textContent
}

describe("typing in the time list on a 24-hour clock", () => {
  it("is on a 24-hour clock here", () => {
    expect(clockTime(new Date(2000, 0, 1, 9, 0))).toBe("09:00")
  })

  it("finds 09:00 when 9 is typed", () => {
    expect(typeInList("9")).toBe("09:00")
  })

  it("finds 21:30 when 2, 1 and 3 are typed in a beat", () => {
    expect(typeInList("2", "1", "3")).toBe("21:30")
  })
})

describe("what a time answers to", () => {
  it("is its label on either clock and the 24-hour clock's, with and without its zero", () => {
    expect(typedKeys(570, "9:30 AM")).toEqual(["930am", "930", "0930"])
    expect(typedKeys(570, "09:30")).toEqual(["0930", "930", "0930"])
    expect(typedKeys(1290, "9:30 PM")).toEqual(["930pm", "2130", "2130"])
  })
})
