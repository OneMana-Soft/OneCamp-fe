import { describe, expect, it } from "vitest"
import { dueText, ordinal, repeatOf, ruleOf, scheduleText } from "@/lib/rules/schedule"

describe("a rule's schedule", () => {
  it("writes the repeat rules the server reads, and reads them back", () => {
    for (const rule of ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "FREQ=WEEKLY;BYDAY=MO,FR", "FREQ=MONTHLY;BYMONTHDAY=15", "FREQ=MONTHLY;BYMONTHDAY=-1"]) {
      expect(ruleOf(repeatOf(rule))).toBe(rule)
    }
    expect(repeatOf("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR").kind).toBe("weekdays")
    expect(ruleOf({ kind: "weekly", days: ["FR", "MO"], monthDay: 1 })).toBe("FREQ=WEEKLY;BYDAY=MO,FR")
    expect(ruleOf({ kind: "weekly", days: [], monthDay: 1 })).toBe("FREQ=WEEKLY;BYDAY=MO")
  })

  it("reads a rule the builder doesn't make as every Monday, never as nothing", () => {
    expect(repeatOf("FREQ=YEARLY")).toEqual({ kind: "weekly", days: ["MO"], monthDay: 1 })
    expect(repeatOf(undefined).kind).toBe("weekly")
  })

  it("says when it runs as people say it", () => {
    expect(scheduleText("FREQ=WEEKLY;BYDAY=MO", "09:00")).toMatch(/^every Monday at 9:00\s?AM$/i)
    expect(scheduleText("FREQ=WEEKLY;BYDAY=MO,WE,FR", "17:00")).toMatch(/^every Monday, Wednesday and Friday at 5:00\s?PM$/i)
    expect(scheduleText("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "17:30")).toMatch(/^every weekday at 5:30\s?PM$/i)
    expect(scheduleText("FREQ=DAILY", "07:05")).toMatch(/^every day at 7:05\s?AM$/i)
    expect(scheduleText("FREQ=MONTHLY;BYMONTHDAY=1", "09:00")).toMatch(/^on the 1st of every month at 9:00\s?AM$/i)
    expect(scheduleText("FREQ=MONTHLY;BYMONTHDAY=-1", "18:00")).toMatch(/^on the last day of every month at 6:00\s?PM$/i)
  })

  it("counts places in a month", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"])
  })

  it("says a due trigger", () => {
    expect(dueText("task_due_soon", 0)).toBe("a task is due today")
    expect(dueText("task_due_soon", 1)).toBe("a task is due tomorrow")
    expect(dueText("task_due_soon", 3)).toBe("a task is due in 3 days")
    expect(dueText("task_overdue", 5)).toBe("a task becomes overdue")
  })
})
