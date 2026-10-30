import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { localDay } from "@/lib/utils/timeZone"
import { alsoIn, finished, milestoneDays, progressWords, targetWords, type Milestone } from "@/lib/work/milestones"
import { milestonesByProject, nextMilestone } from "@/lib/work/myMilestones"

pinTestClock()

// linear-16: a milestone's words, as its list says them.
describe("a milestone's words", () => {
  it("is finished when it has tasks and every one is closed", () => {
    expect(finished({ total: 3, started: 0, done: 3 })).toBe(true)
    expect(finished({ total: 3, started: 1, done: 2 })).toBe(false)
    // None yet is a stage still to fill, not a finished one.
    expect(finished({ total: 0, started: 0, done: 0 })).toBe(false)
  })

  it("says its progress, and that it has no tasks yet", () => {
    expect(progressWords({ total: 8, started: 0, done: 3 })).toBe("3 of 8 done")
    expect(progressWords({ total: 8, started: 3, done: 2 })).toBe("2 of 8 done · 3 started")
    expect(progressWords({ total: 0, started: 0, done: 0 })).toBe("No tasks yet")
  })

  it("names its day as a day where the person is, late once it has passed unfinished", () => {
    const now = new Date(2026, 10, 30, 23, 30)
    const open = { total: 2, started: 0, done: 1 }
    expect(targetWords({ target_date: "2026-11-30", progress: open }, now)).toEqual({ text: expect.stringMatching(/30/), late: false })
    expect(targetWords({ target_date: "2026-11-29", progress: open }, now)?.late).toBe(true)
    expect(targetWords({ target_date: "2026-11-29", progress: { total: 2, started: 0, done: 2 } }, now)?.late).toBe(false)
    expect(targetWords({ target_date: null, progress: open }, now)).toBeNull()
  })

  it("names the other projects it shows in, and counts those its reader can't open", () => {
    const here = "P-1"
    const m = (names: string[], hidden: number) => ({ projects: names.map((n, i) => ({ project_uuid: i === 0 ? "p-1" : `q-${i}`, project_name: n })), hidden_projects: hidden })
    expect(alsoIn(m(["Site"], 0), here)).toBeNull()
    expect(alsoIn(m(["Site", "Shop"], 0), here)).toBe("Also in Shop")
    expect(alsoIn(m(["Site", "Shop", "App"], 1), here)).toBe("Also in Shop, App and 1 project you can't open")
    expect(alsoIn(m(["Site"], 2), here)).toBe("Also in 2 projects you can't open")
  })

  it("finds each project's milestones whatever the case of its id, and its next one", () => {
    const m = (id: string, next: boolean) => ({ id, next }) as Milestone
    const by = milestonesByProject({ data: { projects: { "AB-1": [m("one", false), m("two", true)] } } })
    expect(nextMilestone(by.get("ab-1"))?.id).toBe("two")
    expect(nextMilestone(by.get("cd-2"))).toBeUndefined()
    expect(milestonesByProject(undefined).size).toBe(0)
  })

  it("sits on a timeline over its tasks' days and its target day, and nowhere without either", () => {
    const days = (d: ReturnType<typeof milestoneDays>) =>
      d && { start: localDay(d.start), end: localDay(d.end), tasks: d.tasks && [localDay(d.tasks.start), localDay(d.tasks.end)], target: d.target && localDay(d.target) }
    expect(milestoneDays({ target_date: null })).toBeNull()
    expect(days(milestoneDays({ starts: "2026-11-02T12:00:00Z", ends: "2026-11-20T12:00:00Z", target_date: "2026-11-30" }))).toEqual({
      start: "2026-11-02",
      end: "2026-11-30",
      tasks: ["2026-11-02", "2026-11-20"],
      target: "2026-11-30",
    })
    // A target day alone is the diamond alone; one dated end covers that one day, and a target before it widens the span back.
    expect(days(milestoneDays({ target_date: "2026-12-01" }))).toEqual({ start: "2026-12-01", end: "2026-12-01", tasks: undefined, target: "2026-12-01" })
    expect(days(milestoneDays({ ends: "2026-11-10T12:00:00Z", target_date: "2026-11-05" }))).toEqual({
      start: "2026-11-05",
      end: "2026-11-10",
      tasks: ["2026-11-10", "2026-11-10"],
      target: "2026-11-05",
    })
  })
})
