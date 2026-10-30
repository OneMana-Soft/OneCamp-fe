import { describe, expect, it } from "vitest"
import { offHours, workSpan } from "./weekView"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Calendar A3: your working hours drawn in place of 9 to 18.
describe("the week's working hours", () => {
  it("shades outside 9 to 18 until you keep hours, then outside yours, a day off whole", () => {
    const monday = new Date(2026, 9, 19)
    expect(offHours(monday)).toEqual([[0, 540], [1080, 1440]])
    const week = { "1": [{ start: "13:30", end: "17:00" }, { start: "08:00", end: "12:30" }] }
    expect(offHours(monday, week)).toEqual([[0, 480], [750, 810], [1020, 1440]])
    expect(offHours(new Date(2026, 9, 20), week)).toEqual([[0, 1440]])
  })

  // Density's Fit fills the screen with your working day, not a fixed 9 to 6.
  it("fits the day from the earliest of the drawn days' hours to the latest, else 9 to 18", () => {
    const monday = new Date(2026, 9, 19)
    const tuesday = new Date(2026, 9, 20)
    const week = { "1": [{ start: "13:30", end: "17:00" }, { start: "08:00", end: "12:30" }], "2": [{ start: "10:00", end: "19:15" }] }
    expect(workSpan([monday, tuesday])).toEqual([540, 1080])
    expect(workSpan([monday, tuesday], week)).toEqual([480, 1155])
    expect(workSpan([monday], week)).toEqual([480, 1020])
    // Days with no hours kept (a weekend) fit as before.
    expect(workSpan([new Date(2026, 9, 24)], week)).toEqual([540, 1080])
  })
})
