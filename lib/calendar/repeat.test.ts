import { describe, expect, it } from "vitest"
import { customFor, customRule, describeCustom, isInstanceId, parseCustom, presetOf, repeatPresets, seriesIdOf } from "./repeat"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// Tuesday 13 October 2026, 10:00: the second Tuesday of the month, as the
// server's own words test (business/Recurrence TestARuleInWords) starts.
const tue = new Date(2026, 9, 13, 10, 0)

describe("the repeat menu", () => {
  it("phrases its presets from the start (D-CAL-7), with the rules the server writes", () => {
    expect(repeatPresets(tue).map((p) => [p.label, p.rule])).toEqual([
      ["Doesn't repeat", ""],
      ["Daily", "FREQ=DAILY"],
      ["Weekly on Tuesday", "FREQ=WEEKLY;BYDAY=TU"],
      ["Monthly on the second Tuesday", "FREQ=MONTHLY;BYDAY=2TU"],
      ["Annually on 13 October", "FREQ=YEARLY"],
      ["Every weekday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    ])
  })

  it("says the last Tuesday for a fifth one", () => {
    const last = new Date(2026, 8, 29, 10, 0) // Tuesday 29 September
    expect(repeatPresets(last)[3]).toMatchObject({ label: "Monthly on the last Tuesday", rule: "FREQ=MONTHLY;BYDAY=-1TU" })
  })

  it("knows a preset when it comes back, and no other rule as one", () => {
    expect(presetOf("FREQ=WEEKLY;BYDAY=TU", tue)?.key).toBe("weekly")
    expect(presetOf("RRULE:freq=daily", tue)?.key).toBe("daily")
    expect(presetOf("", tue)?.key).toBe("none")
    expect(presetOf("FREQ=WEEKLY;BYDAY=WE", tue)).toBeUndefined()
    expect(presetOf("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", tue)).toBeUndefined()
  })
})

describe("the custom sheet", () => {
  it("starts weekly on the start's day, never ending", () => {
    const c = customFor(tue)
    expect(customRule(c, tue)).toBe("FREQ=WEEKLY;BYDAY=TU")
    expect(describeCustom(c, tue)).toBe("Weekly on Tuesday")
  })

  // The sentences the server says for the same rules (TestARuleInWords).
  it("says what it makes as the server will", () => {
    const cases: [Parameters<typeof customRule>[0], string, string][] = [
      [{ freq: "WEEKLY", interval: 2, days: ["TH", "TU"], monthly: "place", end: { kind: "on", date: "2026-12-18" } },
        "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261218", "Every 2 weeks on Tuesday and Thursday, until 18 December 2026"],
      [{ freq: "DAILY", interval: 3, days: [], monthly: "place", end: { kind: "never" } }, "FREQ=DAILY;INTERVAL=3", "Every 3 days"],
      [{ freq: "WEEKLY", interval: 1, days: ["MO", "TU", "WE", "TH", "FR"], monthly: "place", end: { kind: "never" } },
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
      [{ freq: "MONTHLY", interval: 1, days: [], monthly: "date", end: { kind: "never" } }, "FREQ=MONTHLY;BYMONTHDAY=13", "Monthly on day 13"],
      [{ freq: "MONTHLY", interval: 3, days: [], monthly: "place", end: { kind: "after", count: 6 } },
        "FREQ=MONTHLY;INTERVAL=3;BYDAY=2TU;COUNT=6", "Every 3 months on the second Tuesday, 6 times"],
      [{ freq: "YEARLY", interval: 1, days: [], monthly: "place", end: { kind: "after", count: 1 } }, "FREQ=YEARLY;COUNT=1", "Annually on 13 October, once"],
    ]
    for (const [c, rule, words] of cases) {
      expect(customRule(c, tue)).toBe(rule)
      expect(describeCustom(c, tue)).toBe(words)
      expect(parseCustom(rule, tue)).toEqual({ ...c, days: c.freq === "WEEKLY" ? ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].filter((d) => c.days.includes(d as never)) : [] })
    }
  })

  it("keeps a count and an interval in bounds", () => {
    expect(customRule({ freq: "DAILY", interval: 0, days: [], monthly: "place", end: { kind: "after", count: 5000 } }, tue)).toBe("FREQ=DAILY;COUNT=1000")
  })

  it("leaves a rule it can't edit to the server's words", () => {
    for (const rule of ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", "FREQ=YEARLY;BYMONTH=3;BYDAY=TH", "FREQ=HOURLY",
      "FREQ=WEEKLY;BYDAY=2TU", "FREQ=MONTHLY;BYMONTHDAY=1,15", "FREQ=WEEKLY;COUNT=2;UNTIL=20261218", "FREQ=DAILY;BYDAY=MO", "", "nonsense"]) {
      expect(parseCustom(rule, tue), rule).toBeNull()
    }
  })

  it("reads an end written as an instant as its date", () => {
    expect(parseCustom("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261218T235959Z", tue)?.end).toEqual({ kind: "on", date: "2026-12-18" })
  })
})

describe("an instance's id", () => {
  const series = "6f1c2a9e-3b7d-4c5e-9a1f-2b3c4d5e6f70"
  it("names its series and its start", () => {
    for (const id of [`${series}_20261020T081500Z`, `${series}_20261020`]) {
      expect(isInstanceId(id)).toBe(true)
      expect(seriesIdOf(id)).toBe(series)
    }
    for (const id of [series, `gcal-${series}`, `${series}_`, `${series}_tuesday`]) {
      expect(isInstanceId(id)).toBe(false)
      expect(seriesIdOf(id)).toBe(id)
    }
  })
})
