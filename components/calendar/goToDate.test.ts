import { describe, expect, it } from "vitest"
import { typedDay } from "./goToDate"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// Go to (G) reads a day the way quick create does, or as the address writes one.
describe("the day typed into Go to", () => {
  const now = new Date(2026, 9, 13, 9)
  const day = (text: string) => typedDay(text, now)?.toDateString()

  it("reads words, dates and the address's form", () => {
    expect(day("tomorrow")).toBe(new Date(2026, 9, 14).toDateString())
    expect(day("15 Nov")).toBe(new Date(2026, 10, 15).toDateString())
    expect(day(" 2026-11-05 ")).toBe(new Date(2026, 10, 5).toDateString())
    expect(typedDay("friday", now)?.getDay()).toBe(5)
  })

  it("reads nothing from words that name no day", () => {
    expect(typedDay("", now)).toBeUndefined()
    expect(typedDay("lunch with Maya", now)).toBeUndefined()
    expect(typedDay("2026-02-31", now)).toBeUndefined()
  })
})
