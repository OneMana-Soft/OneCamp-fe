import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { forecastDay, heldUp, holdWords, landsAfter, landsWords, openCutWords, paceWords, rangeWords, type ProjectForecast } from "@/lib/work/forecast"

pinTestClock()

const lands = (over: Partial<ProjectForecast> = {}): ProjectForecast => ({
  project_uuid: "p1",
  state: "forecast",
  date: "2026-11-18",
  optimistic: "2026-11-12",
  pessimistic: "2026-11-27",
  by_pace: "2026-11-18",
  by_links: "2026-11-02",
  open: 12,
  unit: "points",
  per_week: 4.5,
  weeks: 4,
  held_by: [],
  held_count: 0,
  ...over,
})

// linear-20: when a project's open work lands, from its pace and from what it waits on.
describe("a project's forecast, in words", () => {
  it("says its day only when it has one: a project done, or with nothing to go on yet, says nothing", () => {
    expect(forecastDay(lands())).toBe("2026-11-18")
    expect(landsWords("2026-11-18")).toBe("Lands ~18 Nov")
    expect(landsWords("2027-01-08")).toBe("Lands ~8 Jan 2027")
    expect(forecastDay(lands({ state: "done", date: null }))).toBeNull()
    expect(forecastDay(lands({ state: "starting", date: null }))).toBeNull()
    expect(forecastDay(undefined)).toBeNull()
  })

  it("gives the pace's range and the pace, in the unit it was counted in", () => {
    expect(rangeWords(lands())).toBe("12 Nov – 27 Nov")
    expect(rangeWords(lands({ optimistic: null }))).toBeNull()
    expect(rangeWords(lands({ optimistic: "2026-11-18", pessimistic: "2026-11-18" }))).toBeNull()
    expect(paceWords(lands())).toBe("4.5 points a week over the last 4 weeks, 12 points open")
    expect(paceWords(lands({ unit: "tasks", per_week: 1, open: 1 }))).toBe("1 task a week over the last 4 weeks, 1 task open")
    expect(paceWords(lands({ unit: "tasks", per_week: 2.25, open: 7 }))).toBe("2.3 tasks a week over the last 4 weeks, 7 tasks open")
    // A very large project's numbers read as the card's sentence does (lib/utils/count): 10,000, not 10000.
    expect(paceWords(lands({ unit: "tasks", per_week: 1500, open: 10000 }))).toBe("1,500 tasks a week over the last 4 weeks, 10,000 tasks open")
    expect(paceWords(lands({ per_week: 150, open: 6200.5 }))).toBe("150 points a week over the last 4 weeks, 6,200.5 points open")
  })

  it("names what holds it up: a late task here, or another project's by that project", () => {
    expect(holdWords({ task_uuid: "t1", task_name: "Design review", external: false, days_late: 3 })).toBe("Design review, 3 days late")
    expect(holdWords({ task_uuid: "t2", task_name: "Legal sign-off", external: true, project_name: "Marketing", days_late: 1 })).toBe("Legal sign-off in Marketing, 1 day late")
  })

  it("is held up only when the late work it waits on lands after the pace", () => {
    const late = [{ task_uuid: "t1", task_name: "Design review", external: false, days_late: 3 }]
    expect(heldUp(lands({ held_by: late, by_links: "2026-11-25", date: "2026-11-25" }))).toBe(true)
    // The pace lands later anyway: the late task isn't what sets the date.
    expect(heldUp(lands({ held_by: late, by_links: "2026-11-10" }))).toBe(false)
    expect(heldUp(lands({ held_by: late, by_pace: null, by_links: "2026-11-20", date: "2026-11-20" }))).toBe(true)
    expect(heldUp(lands())).toBe(false)
  })

  // Main's call (29 Oct 15:3x): one sentence, only when the plan read kept some
  // of the project's open tasks, with the server's numbers and the order the
  // read keeps them in; the pace and open work still count every one.
  it("says how many open tasks the date follows only when the server says it counted some of them", () => {
    expect(openCutWords(lands({ open: 10000, unit: "tasks", per_week: 150, open_cut: { total: 10000, counted: 1000 } }))).toBe(
      "This project has 10,000 open tasks, so the date follows what 1,000 of them wait on, the soonest due first; its pace and open work count them all.",
    )
    expect(openCutWords(lands({ open_cut: { total: 7, counted: 3 } }))).toBe(
      "This project has 7 open tasks, so the date follows what 3 of them wait on, the soonest due first; its pace and open work count them all.",
    )
    // One counted: the verb agrees.
    expect(openCutWords(lands({ open_cut: { total: 2, counted: 1 } }))).toBe(
      "This project has 2 open tasks, so the date follows what 1 of them waits on, the soonest due first; its pace and open work count them all.",
    )
    expect(openCutWords(lands())).toBeNull()
    expect(openCutWords(lands({ open: 6200, per_week: 150 }))).toBeNull()
  })
})

describe("a project landing after a day", () => {
  it("lands after its goal's date only with a day of its own past that date", () => {
    expect(landsAfter(lands({ date: "2026-11-25" }), "2026-11-20")).toBe(true)
    expect(landsAfter(lands({ date: "2026-11-20" }), "2026-11-20")).toBe(false)
    expect(landsAfter(lands({ date: "2026-11-18" }), "2026-11-20")).toBe(false)
    expect(landsAfter(lands({ state: "starting", date: null }), "2026-11-20")).toBe(false)
    expect(landsAfter(undefined, "2026-11-20")).toBe(false)
    expect(landsAfter(lands({ date: "2026-11-25" }), undefined)).toBe(false)
  })
})
