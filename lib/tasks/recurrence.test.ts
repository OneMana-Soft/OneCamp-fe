import { describe, expect, it } from "vitest"
import { buildRule, describeRepeat, parseRule } from "./recurrence"

describe("task repeat rules", () => {
  it("round-trips a rule through the form", () => {
    for (const rule of ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,TH", "FREQ=MONTHLY;INTERVAL=3", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"]) {
      expect(buildRule(parseRule(rule)!)).toBe(rule)
    }
  })

  it("orders weekdays and drops them when counting from completion", () => {
    expect(buildRule({ freq: "WEEKLY", interval: 1, days: ["FR", "MO"], mode: "schedule" })).toBe("FREQ=WEEKLY;BYDAY=MO,FR")
    expect(buildRule({ freq: "WEEKLY", interval: 2, days: ["MO"], mode: "completion" })).toBe("FREQ=WEEKLY;INTERVAL=2")
    expect(buildRule({ freq: "DAILY", interval: 0, days: [], mode: "schedule" })).toBe("FREQ=DAILY")
  })

  it("rejects what the server would", () => {
    expect(parseRule("FREQ=HOURLY")).toBeNull()
    expect(parseRule("")).toBeNull()
  })

  it("reads back as a sentence", () => {
    expect(describeRepeat(parseRule("FREQ=WEEKLY;BYDAY=MO,TH")!)).toBe("Every week on Mon, Thu")
    expect(describeRepeat(parseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")!)).toBe("Every week on weekdays")
    expect(describeRepeat(parseRule("FREQ=MONTHLY;INTERVAL=2")!)).toBe("Every 2 months")
    expect(describeRepeat(parseRule("FREQ=DAILY;INTERVAL=3", "completion")!)).toBe("3 days after it's done")
    expect(describeRepeat(parseRule("FREQ=WEEKLY", "completion")!)).toBe("1 week after it's done")
  })
})
