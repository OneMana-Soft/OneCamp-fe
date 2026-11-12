import { describe, expect, it } from "vitest"
import { firstFree, nextFreeAsk, taskBlockMinutes } from "./nextFree"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// gcal-new-task-blocks: "Block time" from the Tasks list puts a task in your
// next free time in the next few days, as the Availability Engine finds it.
describe("your next free time", () => {
  const now = new Date(2026, 9, 21, 10, 7)
  const hours = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", tz: "Asia/Kolkata" }

  it("asks for your own time, from now to the end of the working day after tomorrow, as long as the block", () => {
    const ask = nextFreeAsk(now, 45, hours)
    expect(ask.apiEndpoint).toBe("/event/suggestTimes")
    expect(ask.payload).toEqual({ participants: [], duration_minutes: 45, from: now.toISOString(), to: new Date(2026, 9, 23, 23, 59, 59, 999).toISOString(), hours })
    expect([nextFreeAsk(now, 5, hours).payload.duration_minutes, nextFreeAsk(now, 900, hours).payload.duration_minutes]).toEqual([15, 480])
  })

  // V-775: on a Saturday, a Sunday or a Friday evening it asked only to the end
  // of tomorrow, a weekend, and always said there was no free time.
  it("asks past a weekend to the first working day after tomorrow", () => {
    const end = (d: number) => new Date(2026, 9, d, 23, 59, 59, 999).toISOString()
    const to = (d: Date) => nextFreeAsk(d, 30, hours).payload.to
    // Friday evening, Saturday: Monday. Sunday: Tuesday (Monday is tomorrow).
    expect([to(new Date(2026, 9, 23, 18)), to(new Date(2026, 9, 24, 10)), to(new Date(2026, 9, 25, 10))]).toEqual([end(26), end(26), end(27)])
  })

  it("takes the estimate as a block's length, snapped, else half an hour", () => {
    expect([taskBlockMinutes(), taskBlockMinutes(0), taskBlockMinutes(45), taskBlockMinutes(50), taskBlockMinutes(5), taskBlockMinutes(2400)]).toEqual([30, 30, 45, 60, 15, 480])
  })

  it("takes the earliest time offered, and none when there is none", () => {
    const at = (h: number) => new Date(2026, 9, 21, h).toISOString()
    expect(firstFree({ suggestions: [{ start: at(15), end: at(16) }, { start: at(11), end: at(12) }] })).toEqual({ start: new Date(at(11)), end: new Date(at(12)) })
    expect([firstFree({ suggestions: [] }), firstFree(undefined)]).toEqual([null, null])
  })
})
