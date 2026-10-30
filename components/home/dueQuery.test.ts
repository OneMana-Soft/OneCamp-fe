import { describe, expect, it } from "vitest"
import { dueRangeQuery } from "@/components/home/useHomeNeeds"
import { pinTestClock } from "@/lib/testing/testClock"

// PR1 (Home's due_by): "needs me" asks for what is due by the end of today,
// open only, rather than 60 days of every task (done ones included, overdue
// ones cut off past 100).
describe("Home's due list", () => {
  pinTestClock()
  it("asks for what is due by the end of today", () => {
    const q = new URLSearchParams(dueRangeQuery(new Date(2026, 9, 19, 15, 0)))
    expect(q.get("dueBy")).toBe(new Date(2026, 9, 20).toISOString())
    expect(q.has("startDate")).toBe(false)
    expect(q.get("pageSize")).toBe("100")
  })
})
