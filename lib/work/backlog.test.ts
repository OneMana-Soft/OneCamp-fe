import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { capacityMinutes, capacityOf, capacityPoints, hoursText, loadOf, measureOf, moveTask, moveTasks, totalsLine, type BacklogData } from "@/lib/work/backlog"
import { pointsText } from "@/lib/work/points"

pinTestClock()

const t = (id: string, minutes = 0, status = "todo") => ({ task_uuid: id, task_name: id, task_status: status, task_estimate_minutes: minutes }) as BacklogData["tasks"][number]

const data = (): BacklogData => ({
  cycles: [
    { id: "c3", project_uuid: "p", number: 3, name: "", starts_at: "2026-10-12T00:00:00Z", ends_at: "2026-10-26T00:00:00Z", state: "current", progress: { total: 2, started: 1, done: 0 }, tasks: [t("a", 60), t("b", 120, "inProgress")], estimate_minutes: 180 },
    { id: "c4", project_uuid: "p", number: 4, name: "Launch", starts_at: "2026-10-26T00:00:00Z", ends_at: "2026-11-09T00:00:00Z", state: "upcoming", progress: { total: 0, started: 0, done: 0 }, tasks: [], estimate_minutes: 0 },
  ],
  tasks: [t("x", 30), t("y")],
  count: 14,
  estimate_minutes: 600,
  capacity_minutes: 240,
})

// STEP4 #9 / spec F: a cycle's totals read "12 tasks · 18 h of 24 h" with a
// capacity, "12 tasks · 34 h" with estimates alone, "12 tasks" otherwise.
describe("the backlog's words", () => {
  it("says hours to a tenth, without a trailing .0", () => {
    expect(hoursText(0)).toBe("0 h")
    expect(hoursText(90)).toBe("1.5 h")
    expect(hoursText(1080)).toBe("18 h")
  })

  it("says a container's totals as the spec has them", () => {
    expect(totalsLine(12, 1080, 1440)).toBe("12 tasks · 18 h of 24 h")
    expect(totalsLine(12, 6, 8, pointsText)).toBe("12 tasks · 6 of 8 points")
    expect(totalsLine(1, 1, 8, pointsText)).toBe("1 task · 1 of 8 points")
    expect(totalsLine(12, 2040)).toBe("12 tasks · 34 h")
    expect(totalsLine(12, 0)).toBe("12 tasks")
    expect(totalsLine(1, 0)).toBe("1 task")
  })

  it("says how full a cycle is against capacity: under, at (within a tenth) or over", () => {
    expect(loadOf(100, 240)).toBe("under")
    expect(loadOf(230, 240)).toBe("at")
    expect(loadOf(300, 240)).toBe("over")
    expect(loadOf(300, undefined)).toBe(undefined)
  })
})

// A move paints at once: the task leaves where it was, joins where it went,
// and every total follows; the backlog's count is the server's, moved by one.
describe("moving a task", () => {
  it("from the backlog into a cycle", () => {
    const next = moveTask(data(), "x", "c4")!
    expect(next.tasks.map((x) => x.task_uuid)).toEqual(["y"])
    expect(next.count).toBe(13)
    expect(next.estimate_minutes).toBe(570)
    expect(next.cycles[1].tasks.map((x) => x.task_uuid)).toEqual(["x"])
    expect(next.cycles[1].estimate_minutes).toBe(30)
    expect(next.cycles[1].progress.total).toBe(1)
  })

  it("from a cycle back to the backlog, and between cycles", () => {
    const back = moveTask(data(), "b", "backlog")!
    expect(back.cycles[0].tasks.map((x) => x.task_uuid)).toEqual(["a"])
    expect(back.cycles[0].estimate_minutes).toBe(60)
    expect(back.cycles[0].progress).toEqual({ total: 1, started: 0, done: 0 })
    expect(back.tasks[0].task_uuid).toBe("b")
    expect(back.count).toBe(15)
    const across = moveTask(data(), "a", "c4")!
    expect(across.cycles[0].tasks.map((x) => x.task_uuid)).toEqual(["b"])
    expect(across.cycles[1].tasks.map((x) => x.task_uuid)).toEqual(["a"])
  })

  it("does nothing where it already is, or for a task it can't find", () => {
    expect(moveTask(data(), "x", "backlog")).toBeNull()
    expect(moveTask(data(), "a", "c3")).toBeNull()
    expect(moveTask(data(), "nope", "c3")).toBeNull()
  })

  it("moves a selection at once, every total following, and skips the ones already there", () => {
    const next = moveTasks(data(), ["x", "a", "y"], "c4")!
    expect(next.cycles[1].tasks.map((x) => x.task_uuid)).toEqual(["x", "a", "y"])
    expect(next.cycles[1].estimate_minutes).toBe(90)
    expect(next.cycles[0].tasks.map((x) => x.task_uuid)).toEqual(["b"])
    expect(next.tasks).toEqual([])
    expect(next.count).toBe(12)
    expect(moveTasks(data(), ["x", "y"], "backlog")).toBeNull()
  })
})

describe("a cycle's capacity", () => {
  it("is its own when set, else its project's", () => {
    const d = data()
    expect(capacityOf(d.cycles[0], d)).toBe(240)
    expect(capacityOf({ ...d.cycles[0], capacity_minutes: 600 }, d)).toBe(600)
    expect(capacityOf(d.cycles[0], { ...d, capacity_minutes: undefined })).toBeUndefined()
  })

  it("is typed in hours, as an estimate is, up to the server's 100,000 hours", () => {
    expect(capacityMinutes("40")).toBe(2400)
    expect(capacityMinutes(" 37.5 ")).toBe(2250)
    expect(capacityMinutes("2h 30m")).toBe(150)
    expect(capacityMinutes("90m")).toBe(90)
    expect(capacityMinutes("100000")).toBe(6_000_000)
    expect(capacityMinutes("100001")).toBeNull()
    expect(capacityMinutes("0")).toBeNull()
    expect(capacityMinutes("-4")).toBeNull()
    expect(capacityMinutes("lots")).toBeNull()
    expect(capacityMinutes("")).toBeNull()
  })
})

// linear-05: a project that estimates in points counts the backlog in them,
// a task with none as its scale says, and a cycle's capacity is in points.
describe("a backlog in points", () => {
  const scale = { kind: "fibonacci" as const, extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }
  const pointed = (): BacklogData => {
    const d = data()
    d.cycles[0] = { ...d.cycles[0], tasks: [{ ...t("a", 60), task_estimate_points: 3 }, t("b", 120, "inProgress")], estimate_points: 4, capacity_points: 10 }
    d.cycles[1] = { ...d.cycles[1], estimate_points: 0 }
    return { ...d, tasks: [{ ...t("x", 30), task_estimate_points: 5 }, t("y")], estimate_points: 20, capacity_points: 8 }
  }

  it("is counted in points when its answer counts them on a scale, else in hours", () => {
    const m = measureOf({ ...pointed(), scale })
    expect(m.points).toBe(true)
    expect(m.cycle(pointed().cycles[0])).toBe(4)
    expect(m.backlog(pointed())).toBe(20)
    expect(capacityOf(pointed().cycles[0], pointed(), m)).toBe(10)
    expect(capacityOf(pointed().cycles[1], pointed(), m)).toBe(8)
    expect(totalsLine(2, 4, 10, m.text)).toBe("2 tasks · 4 of 10 points")
    expect(measureOf(pointed()).points).toBe(false)
    expect(measureOf({ ...data(), scale }).points).toBe(false)
  })

  it("moves a task's points with it, one for a task with none when the scale counts them", () => {
    const m = measureOf({ ...pointed(), scale })
    const next = moveTask(pointed(), "x", "c4", m)!
    expect([next.estimate_points, next.cycles[1].estimate_points]).toEqual([15, 5])
    const unestimated = moveTask(pointed(), "y", "c4", m)!
    expect([unestimated.estimate_points, unestimated.cycles[1].estimate_points]).toEqual([19, 1])
    const nothing = measureOf({ ...pointed(), scale: { ...scale, count_unestimated: false } })
    expect(moveTask(pointed(), "y", "c4", nothing)!.cycles[1].estimate_points).toBe(0)
    // Hours keep moving beside them.
    expect(next.estimate_minutes).toBe(570)
  })

  it("takes a capacity in points as a whole number a cycle can hold", () => {
    expect(capacityPoints("20")).toBe(20)
    expect(capacityPoints(" 7 ")).toBe(7)
    for (const wrong of ["0", "2.5", "-3", "abc", "", "100001"]) expect(capacityPoints(wrong)).toBeNull()
  })
})
