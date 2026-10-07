import { describe, expect, it } from "vitest"
import { addDays, isMonday } from "date-fns"
import { STATUS_COLORS, statusOptions, type ProjectStatuses } from "@/lib/taskStatus"
import {
  DAY_WIDTH,
  applyEdit,
  barBox,
  dayAt,
  datesAfter,
  datesForDrop,
  headerTicks,
  isLate,
  spanLabel,
  spanOf,
  taskDate,
  timelineRange,
  timelineRows,
  firstView,
  barColor,
  dotColor,
  dependencyLinks,
  type TimelineTask,
} from "@/lib/timeline"
import { isTimelineKey } from "@/lib/timelineKey"

// Local times throughout: the timeline works in the viewer's own days.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const iso = (y: number, m: number, d: number, h = 0, min = 0) => local(y, m, d, h, min).toISOString()
const day = (y: number, m: number, d: number) => local(y, m, d).getTime()
const ZERO = "0001-01-01T00:00:00Z"

const task = (id: string, o: Partial<TimelineTask> = {}): TimelineTask => ({ task_uuid: id, task_name: id, task_status: "todo", ...o })

describe("reading a task's days", () => {
  it("treats an empty, zero or unreadable date as none", () => {
    expect(taskDate("")).toBeNull()
    expect(taskDate(undefined)).toBeNull()
    expect(taskDate(ZERO)).toBeNull()
    expect(taskDate("1970-01-01T00:00:00Z")).toBeNull()
    expect(taskDate("soon")).toBeNull()
    expect(taskDate(iso(2026, 10, 8, 17))?.getTime()).toBe(local(2026, 10, 8, 17).getTime())
  })

  it("draws a task with one date as that day, and one with both from start to due", () => {
    expect(spanOf({ task_due_date: iso(2026, 10, 8, 17) })).toEqual({ start: local(2026, 10, 8), end: local(2026, 10, 8) })
    expect(spanOf({ task_start_date: iso(2026, 10, 8, 9), task_due_date: ZERO })).toEqual({ start: local(2026, 10, 8), end: local(2026, 10, 8) })
    expect(spanOf({ task_start_date: iso(2026, 10, 5, 9), task_due_date: iso(2026, 10, 8, 17) })).toEqual({ start: local(2026, 10, 5), end: local(2026, 10, 8) })
    expect(spanOf({ task_start_date: ZERO, task_due_date: "" })).toBeNull()
  })

  it("reads a start after the due date, which older versions allowed, as the due day", () => {
    expect(spanOf({ task_start_date: iso(2026, 10, 12), task_due_date: iso(2026, 10, 8, 17) })).toEqual({ start: local(2026, 10, 8), end: local(2026, 10, 8) })
  })

  it("calls an open task late once its due day has passed, never a finished one or one that isn't due", () => {
    const due = iso(2026, 10, 6, 17)
    expect(isLate({ task_status: "todo", task_due_date: due }, local(2026, 10, 7, 8))).toBe(true)
    expect(isLate({ task_status: "todo", task_due_date: due }, local(2026, 10, 6, 23))).toBe(false)
    expect(isLate({ task_status: "done", task_due_date: due }, local(2026, 10, 9))).toBe(false)
    expect(isLate({ task_status: "canceled", task_due_date: due }, local(2026, 10, 9))).toBe(false)
    // Started a week ago with no due date: under way, not late (the overview agrees).
    expect(isLate({ task_status: "todo", task_due_date: ZERO }, local(2026, 10, 9))).toBe(false)
  })

  it("labels a span the way people say it", () => {
    const today = local(2026, 10, 7)
    expect(spanLabel({ start: local(2026, 10, 8), end: local(2026, 10, 8) }, today)).toBe("8 Oct")
    expect(spanLabel({ start: local(2026, 10, 8), end: local(2026, 10, 12) }, today)).toBe("8 Oct to 12 Oct")
    expect(spanLabel({ start: local(2026, 12, 30), end: local(2027, 1, 4) }, today)).toBe("30 Dec to 4 Jan 2027")
  })
})

describe("what a drag does to a task's dates", () => {
  const both = { task_start_date: iso(2026, 10, 5, 9, 30), task_due_date: iso(2026, 10, 8, 17) }

  it("moves both dates by whole days and keeps their times of day", () => {
    expect(datesAfter(both, { kind: "move", days: 3 })).toEqual({ task_start_date: iso(2026, 10, 8, 9, 30), task_due_date: iso(2026, 10, 11, 17) })
    expect(datesAfter(both, { kind: "move", days: -7 })).toEqual({ task_start_date: iso(2026, 9, 28, 9, 30), task_due_date: iso(2026, 10, 1, 17) })
  })

  it("changes nothing for a drag that ends where it began", () => {
    expect(datesAfter(both, { kind: "move", days: 0 })).toBeNull()
    expect(datesAfter({ task_due_date: iso(2026, 10, 8) }, { kind: "start", days: 2 })).toBeNull()
  })

  it("pulls one end at a time, and never past the other", () => {
    expect(datesAfter(both, { kind: "end", days: 2 })).toEqual({ task_start_date: both.task_start_date, task_due_date: iso(2026, 10, 10, 17) })
    expect(datesAfter(both, { kind: "start", days: -1 })).toEqual({ task_start_date: iso(2026, 10, 4, 9, 30), task_due_date: both.task_due_date })
    // Past the due day: it starts on the due day, so it's still a day long.
    expect(datesAfter(both, { kind: "start", days: 10 })).toEqual({ task_start_date: iso(2026, 10, 8, 9, 30), task_due_date: both.task_due_date })
    expect(datesAfter(both, { kind: "end", days: -10 })).toEqual({ task_start_date: both.task_start_date, task_due_date: iso(2026, 10, 5, 17) })
    expect(applyEdit({ start: local(2026, 10, 5), end: local(2026, 10, 8) }, { kind: "end", days: -10 })).toEqual({ start: local(2026, 10, 5), end: local(2026, 10, 5) })
  })

  it("keeps a task with only a due date that way while it's one day, and gives it a start when stretched", () => {
    const due = { task_start_date: ZERO, task_due_date: iso(2026, 10, 8, 17) }
    expect(datesAfter(due, { kind: "move", days: 1 })).toEqual({ task_start_date: "", task_due_date: iso(2026, 10, 9, 17) })
    expect(datesAfter(due, { kind: "end", days: 2 })).toEqual({ task_start_date: iso(2026, 10, 8, 9), task_due_date: iso(2026, 10, 10, 17) })
    expect(datesAfter(due, { kind: "start", days: -2 })).toEqual({ task_start_date: iso(2026, 10, 6, 9), task_due_date: iso(2026, 10, 8, 17) })
  })

  it("keeps a task with only a start that way while it's one day, and gives it a due date when stretched", () => {
    const start = { task_start_date: iso(2026, 10, 8, 10), task_due_date: "" }
    expect(datesAfter(start, { kind: "move", days: -1 })).toEqual({ task_start_date: iso(2026, 10, 7, 10), task_due_date: "" })
    expect(datesAfter(start, { kind: "end", days: 3 })).toEqual({ task_start_date: iso(2026, 10, 8, 10), task_due_date: iso(2026, 10, 11, 17) })
  })

  it("never sends a start after the due time, which the server refuses", () => {
    // Due at 08:00, start pulled onto the due day: the start's 09:00 would be after it.
    const early = { task_start_date: iso(2026, 10, 5, 9), task_due_date: iso(2026, 10, 8, 8) }
    expect(datesAfter(early, { kind: "start", days: 3 })).toEqual({ task_start_date: iso(2026, 10, 8, 8), task_due_date: iso(2026, 10, 8, 8) })
  })

  it("keeps the time of day across a clock change", () => {
    // The US and Europe change clocks around these days; a day is not always 24 hours.
    for (const [y, m, d] of [[2026, 11, 1], [2026, 10, 25], [2026, 3, 8], [2026, 3, 29]] as const) {
      const next = datesAfter({ task_due_date: iso(y, m, d - 1, 17) }, { kind: "move", days: 2 })!
      const due = new Date(next.task_due_date)
      expect([due.getDate(), due.getHours()]).toEqual([addDays(local(y, m, d - 1), 2).getDate(), 17])
    }
  })

  it("gives a task dropped on a day a due date at the end of that working day", () => {
    expect(datesForDrop(local(2026, 10, 9, 13, 45))).toEqual({ task_start_date: "", task_due_date: iso(2026, 10, 9, 17) })
  })
})

describe("the grid", () => {
  const now = local(2026, 10, 7, 15)

  it("covers today and every task, with room either side, from a Monday", () => {
    const r = timelineRange([{ start: local(2026, 11, 2), end: local(2026, 12, 18) }], now, "day")
    expect(isMonday(r.from)).toBe(true)
    expect(r.from.getTime()).toBeLessThanOrEqual(addDays(local(2026, 10, 7), -7).getTime())
    expect(addDays(r.from, r.days - 1).getTime()).toBeGreaterThanOrEqual(local(2026, 12, 18).getTime())
  })

  it("starts on a month's first day by month, and fills a wide screen even when empty", () => {
    const r = timelineRange([], now, "month")
    expect(r.from.getDate()).toBe(1)
    expect(r.days * DAY_WIDTH.month).toBeGreaterThan(1500)
    expect(timelineRange([], now, "day").days * DAY_WIDTH.day).toBeGreaterThan(1500)
  })

  it("stops a few years from today, so a mistyped year can't make it endless", () => {
    const r = timelineRange([{ start: local(2096, 1, 1), end: local(2096, 1, 1) }], now, "day")
    expect(r.days).toBeLessThan(4 * 366)
    // That task still shows, as a sliver at the edge.
    const box = barBox({ start: local(2096, 1, 1), end: local(2096, 1, 1) }, r, DAY_WIDTH.day)
    expect(box.left + box.width).toBe(r.days * DAY_WIDTH.day)
    expect(box.width).toBeGreaterThan(0)
  })

  it("opens on the whole plan and today when they fit, else on today, else on the nearest task", () => {
    const today = local(2026, 10, 7, 10)
    const span = (a: [number, number], b: [number, number]) => ({ start: local(2026, a[0], a[1]), end: local(2026, b[0], b[1]) })
    expect(firstView([], today, 40)).toEqual({ day: local(2026, 10, 7), at: 1 / 3 })
    // Today and the plan fit: both in view, centred.
    expect(firstView([span([10, 5], [10, 9])], today, 40)).toEqual({ day: local(2026, 10, 7), at: 0.5 })
    expect(firstView([span([11, 16], [11, 20]), span([11, 2], [11, 6])], today, 60)).toEqual({ day: local(2026, 10, 29), at: 0.5 })
    // A long plan running now: today a third of the way in.
    expect(firstView([span([9, 1], [12, 31])], today, 40)).toEqual({ day: local(2026, 10, 7), at: 1 / 3 })
    // Everything starts next month and won't fit with today: the first of it, near the left edge.
    expect(firstView([span([11, 16], [11, 20]), span([11, 2], [11, 6])], today, 20)).toEqual({ day: local(2026, 11, 2), at: 0.1 })
    // Long finished: its last day, near the right edge.
    expect(firstView([span([3, 2], [3, 9]), span([5, 1], [5, 30])], today, 20)).toEqual({ day: local(2026, 5, 30), at: 0.9 })
  })

  it("puts a bar on its days and finds the day under a point", () => {
    const r = { from: local(2026, 10, 5), days: 60 }
    expect(barBox({ start: local(2026, 10, 7), end: local(2026, 10, 9) }, r, 10)).toEqual({ left: 20, width: 30 })
    expect(dayAt(25, r, 10).getTime()).toBe(day(2026, 10, 7))
    expect(dayAt(-40, r, 10).getTime()).toBe(day(2026, 10, 5))
    expect(dayAt(10_000, r, 10).getTime()).toBe(addDays(r.from, 59).getTime())
  })

  it("labels days under their months, weeks by the day they start, and months under years", () => {
    const r = { from: local(2026, 9, 28), days: 14 }
    const days = headerTicks(r, "day", 10)
    expect(days.bottom).toHaveLength(14)
    expect(days.bottom.slice(0, 5).map((t) => `${t.sub}${t.label}`)).toEqual(["M28", "T29", "W30", "T1", "F2"])
    expect(days.top.map((t) => [t.label, t.width])).toEqual([["September 2026", 30], ["October 2026", 110]])
    expect(headerTicks(r, "week", 10).bottom.map((t) => t.label)).toEqual(["28 Sep", "5 Oct"])
    const months = headerTicks({ from: local(2026, 11, 1), days: 120 }, "month", 2)
    expect(months.bottom.map((t) => t.label)).toEqual(["Nov", "Dec", "Jan", "Feb"])
    expect(months.top.map((t) => t.label)).toEqual(["2026", "2027"])
  })
})

describe("the rows", () => {
  const statuses = statusOptions({
    built_in: [],
    custom: [{ id: "qa", project_id: "p", name: "QA", category: "inReview", color: "violet", position: 0 }],
    colors: [],
    max: 10,
  } as ProjectStatuses)
  const tasks = [
    task("late", { task_due_date: iso(2026, 10, 1, 17), task_status: "inProgress", task_assignee: { user_uuid: "s", user_name: "Sam Rivera" } }),
    task("early", { task_start_date: iso(2026, 9, 20, 9), task_due_date: iso(2026, 10, 12, 17), task_assignee: { user_uuid: "m", user_name: "Maya Chen" } }),
    task("qa", { task_due_date: iso(2026, 10, 9, 17), task_status: "inReview", task_custom_status: "qa", task_custom_status_name: "QA" }),
    task("gone", { task_due_date: iso(2026, 10, 9, 17), task_status: "inReview", task_custom_status: "deleted", task_custom_status_name: "Legal" }),
    task("shipped", { task_due_date: iso(2026, 9, 30, 17), task_status: "done" }),
    task("dropped", { task_due_date: iso(2026, 10, 2, 17), task_status: "canceled" }),
    task("someday"),
    task("finished-undated", { task_status: "done" }),
  ]
  const base = { grouping: "none" as const, statuses, showDone: true, collapsed: new Set<string>() }
  const ids = (rows: ReturnType<typeof timelineRows>["rows"]) => rows.map((r) => (r.kind === "task" ? r.task.task_uuid : `[${r.label} ${r.count}]`))

  it("draws dated tasks earliest first, leaves out cancelled ones, and lists open undated ones apart", () => {
    const { rows, unscheduled, spans } = timelineRows(tasks, base)
    expect(ids(rows)).toEqual(["early", "shipped", "late", "gone", "qa"])
    expect(unscheduled.map((t) => t.task_uuid)).toEqual(["someday"])
    expect(spans).toHaveLength(5)
  })

  it("hides done tasks when asked", () => {
    expect(ids(timelineRows(tasks, { ...base, showDone: false }).rows)).toEqual(["early", "late", "gone", "qa"])
  })

  it("groups by status in board order, a project's own statuses with their category, and keeps a status it no longer has", () => {
    const { rows } = timelineRows(tasks, { ...base, grouping: "status" })
    expect(ids(rows)).toEqual(["[To do 1]", "early", "[In progress 1]", "late", "[QA 1]", "qa", "[Done 1]", "shipped", "[Legal 1]", "gone"])
  })

  it("groups by assignee, No assignee first, then people by name", () => {
    const { rows } = timelineRows(tasks, { ...base, grouping: "assignee", showDone: false })
    expect(ids(rows)).toEqual(["[No assignee 2]", "gone", "qa", "[Maya Chen 1]", "early", "[Sam Rivera 1]", "late"])
  })

  it("folds a group to its heading", () => {
    const { rows } = timelineRows(tasks, { ...base, grouping: "status", collapsed: new Set(["todo", "done"]) })
    expect(ids(rows)).toEqual(["[To do 1]", "[In progress 1]", "late", "[QA 1]", "qa", "[Done 1]", "[Legal 1]", "gone"])
    expect(rows[0]).toMatchObject({ kind: "group", id: "todo", collapsed: true })
  })
})

describe("bar colours", () => {
  it("give every colour a project's status can have its own readable fill", () => {
    const project = {
      built_in: [],
      colors: [],
      max: 20,
      custom: STATUS_COLORS.map((c, i) => ({ id: c, project_id: "p", name: c, category: "todo" as const, color: c, position: i })),
    } as ProjectStatuses
    const options = statusOptions(project)
    for (const c of STATUS_COLORS) {
      const cls = barColor({ task_status: "todo", task_custom_status: c }, options)
      expect(cls, c).toMatch(new RegExp(`bg-${c}-\\d+ text-`))
    }
  })

  it("keep done work quiet without fading its name, and its dot in full colour", () => {
    expect(barColor({ task_status: "done" }, statusOptions(null))).not.toMatch(/opacity/)
    expect(dotColor({ task_status: "done" }, statusOptions(null))).toBe("bg-emerald-500")
    const { rows } = timelineRows([task("d", { task_status: "done", task_due_date: iso(2026, 10, 1, 17) })], { grouping: "status", statuses: statusOptions(null), showDone: true, collapsed: new Set() })
    expect(rows[0]).toMatchObject({ kind: "group", dot: "bg-emerald-500" })
  })
})

describe("dependency arrows", () => {
  const range = { from: local(2026, 10, 5), days: 30 }
  const rowsOf = (tasks: TimelineTask[]) => timelineRows(tasks, { grouping: "none", statuses: statusOptions(null), showDone: true, collapsed: new Set() }).rows
  const design = task("design", { task_start_date: iso(2026, 10, 5, 9), task_due_date: iso(2026, 10, 7, 17) })

  it("runs from the end of the task waited on to the start of the task waiting", () => {
    const build = task("build", { task_start_date: iso(2026, 10, 10, 9), task_due_date: iso(2026, 10, 12, 17), task_blocked_by: [{ task_uuid: "design" }] })
    const [link] = dependencyLinks(rowsOf([design, build]), range, 10, 36)
    // Design covers days 0-2 (x 0-30) in row 0; Build starts on day 5 (x 50) in row 1.
    expect(link).toEqual({ key: "design>build", from: "design", to: "build", path: "M30 18H38V54H50", broken: false })
  })

  it("goes round, and shows as broken, when the waiting task starts before the other is done", () => {
    const early = task("early", { task_due_date: iso(2026, 10, 6, 17), task_blocked_by: [{ task_uuid: "design" }] })
    const [link] = dependencyLinks(rowsOf([design, early]), range, 10, 36)
    expect(link.broken).toBe(true)
    expect(link.path).toBe("M30 18H38V36H2V54H10")
  })

  it("follows a bar being dragged, and leaves out a task with no row", () => {
    const build = task("build", { task_start_date: iso(2026, 10, 10, 9), task_due_date: iso(2026, 10, 12, 17), task_blocked_by: [{ task_uuid: "design" }, { task_uuid: "someday" }] })
    const rows = rowsOf([design, build, task("someday")])
    const dragged = new Map([["build", { start: local(2026, 10, 7), end: local(2026, 10, 9) }]])
    const links = dependencyLinks(rows, range, 10, 36, dragged)
    expect(links).toHaveLength(1)
    expect(links[0].broken).toBe(true)
  })
})

describe("the timeline's address", () => {
  it("is recognised for its project only when one is named", () => {
    expect(isTimelineKey("/project/p1/timeline")).toBe(true)
    expect(isTimelineKey("/project/p1/timeline", "p1")).toBe(true)
    expect(isTimelineKey("/project/p1/timeline", "p2")).toBe(false)
    expect(isTimelineKey("/project/taskList/p1")).toBe(false)
    expect(isTimelineKey("/project/p1/timeline/extra")).toBe(false)
  })
})
