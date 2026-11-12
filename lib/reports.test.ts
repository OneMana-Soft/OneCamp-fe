import { describe, expect, it } from "vitest"
import { reportCSV } from "./reportCSV"
import { hoursChart, openOf, throughputChart, totalHours, weekLabel, type Report } from "./reports"
import { reportFilters, reportView, reportViewName } from "./reportView"

const report: Report = {
  weeks: ["2026-09-28", "2026-10-05"],
  done: [3, 1],
  added: [2, 4],
  hours: [1.5, 0],
  open: 6,
  overdue: 2,
  due_this_week: 1,
  done_total: 4,
  on_time_percent: 75,
  projects: [{ project_uuid: "p", project_name: "Q4 launch, phase 2", to_do: 3, in_progress: 2, in_review: 1, overdue: 2, done: 4 }],
  people: [
    { user_uuid: "maya", user_name: "Maya", to_do: 1, in_progress: 1, in_review: 0, overdue: 1, done: 3 },
    { to_do: 2, in_progress: 0, in_review: 0, overdue: 0, done: 0 },
  ],
  priorities: [],
  all_projects: [],
  truncated: false,
}

describe("reports", () => {
  it("labels a week by its Monday, as a calendar day in any zone", () => {
    expect(weekLabel("2026-10-05")).toBe("5 Oct")
    expect(weekLabel("nonsense")).toBe("nonsense")
  })

  it("charts done and added side by side, week by week", () => {
    const c = throughputChart(report)
    // "Sep" or "Sept", as the browser's en-GB has it.
    expect(c.labels[0]).toMatch(/^28 Sept?$/)
    expect(c.labels[1]).toBe("5 Oct")
    expect(c.series.map((s) => s.name)).toEqual(["Done", "Added"])
    expect(c.series[0].values).toEqual([3, 1])
  })

  it("charts hours only when some were logged", () => {
    expect(hoursChart(report)?.series[0].values).toEqual([1.5, 0])
    expect(hoursChart({ ...report, hours: [0, 0] })).toBeNull()
    expect(hoursChart({ ...report, hours: null })).toBeNull()
    expect(totalHours(report)).toBe(1.5)
  })

  it("counts a row's open tasks", () => {
    expect(openOf(report.projects[0])).toBe(6)
  })

  it("writes a CSV a spreadsheet opens as it is", () => {
    const csv = reportCSV(report, (p) => p.user_name ?? "Nobody")
    expect(csv).toContain("Week starting,Done,Added,Hours\n2026-09-28,3,2,1.5\n2026-10-05,1,4,0\n")
    expect(csv).toContain('"Q4 launch, phase 2",3,2,1,2,4')
    expect(csv).toContain("Maya,1,1,0,1,3\nNobody,2,0,0,0,0\n")
    // A name that looks like a formula stays text.
    const risky = reportCSV({ ...report, people: [{ ...report.people[0], user_name: "=HYPERLINK()" }] }, (p) => p.user_name ?? "")
    expect(risky).toContain("'=HYPERLINK()")
    const tabbed = reportCSV({ ...report, people: [{ ...report.people[0], user_name: "\t=1+1" }] }, (p) => p.user_name ?? "")
    expect(tabbed).toContain("'\t=1+1")
  })

  // B9-b4 (linear-32): a CSV from every chart. The report's own CSV gains its
  // flow chart's rows; a chart elsewhere (a dashboard's widget) asks for its
  // own tables alone, and a table it doesn't have is never written.
  it("writes the flow of work after the weeks, and only the tables asked for", () => {
    const name = (p: { user_name?: string }) => p.user_name ?? "Nobody"
    expect(reportCSV(report, name)).not.toContain("Week starting,To do")
    const flow = [
      { to_do: 4, in_progress: 2, in_review: 1, done: 0 },
      { to_do: 3, in_progress: 2, in_review: 0, done: 3 },
    ]
    const withFlow = reportCSV({ ...report, flow }, name)
    expect(withFlow).toContain("2026-10-05,1,4,0\n\nWeek starting,To do,In progress,In review,Done\n2026-09-28,4,2,1,0\n2026-10-05,3,2,0,3\n\nProject,")
    expect(reportCSV({ weeks: report.weeks, done: report.done, added: report.added }, name, ["weeks"])).toBe("Week starting,Done,Added\n2026-09-28,3,2\n2026-10-05,1,4\n")
    expect(reportCSV({ weeks: report.weeks, flow }, name, ["flow"])).toBe("Week starting,To do,In progress,In review,Done\n2026-09-28,4,2,1,0\n2026-10-05,3,2,0,3\n")
    const priorities = [
      { priority: "high", open: 2, overdue: 1 },
      { priority: "", open: 1, overdue: 0 },
    ]
    expect(reportCSV({ priorities }, name, ["priorities"])).toBe("Priority,Open,Overdue\nHigh,2,1\nNo priority,1,0\n")
    expect(reportCSV({ people: report.people }, name, ["people"])).toBe("Person,To do,In progress,In review,Overdue,Done\nMaya,1,1,0,1,3\nNobody,2,0,0,0,0\n")
  })
})

describe("reportView (B9-b1)", () => {
  const q = (s: string) => new URLSearchParams(s)
  it("reads the view a report was opened from: one project, its filters and its name", () => {
    expect(reportView(q("view=reports&projects=p1&filters=%5B%5D&name=High"))).toEqual({ project: "p1", filters: "[]", name: "High" })
    expect(reportView(q("projects=p1&name=Board"))).toEqual({ project: "p1", filters: "", name: "Board" })
    expect(reportView(q("projects=p1&filters=x"))).toEqual({ project: "p1", filters: "x", name: "" })
    expect(reportView(q("view=reports&projects=p1"))).toEqual({ project: "p1", filters: "", name: "" })
  })
  it("is none for the report's own choices: no project, or several", () => {
    expect(reportView(q("view=reports"))).toBeNull()
    expect(reportView(q("projects=p1,p2&filters=x"))).toBeNull()
    expect(reportView(q("projects=%20"))).toBeNull()
  })
  it("names a view by its saved name, or by its project, filtered when it was", () => {
    expect(reportViewName({ project: "p1", filters: "[1]", name: "High work" }, "Launch")).toBe("High work")
    expect(reportViewName({ project: "p1", filters: '[{"id":"task_priority"}]', name: "" }, "Launch")).toBe("Launch, filtered")
    expect(reportViewName({ project: "p1", filters: "", name: "" }, "Launch")).toBe("Launch")
    expect(reportViewName({ project: "p1", filters: "[]", name: "" }, undefined)).toBe("this project")
  })
})

describe("a view of no project: My tasks (L32)", () => {
  const q = (s: string) => new URLSearchParams(s)
  it("is read from mine=1, named My tasks, and keeps to the reader's own work once they are known", () => {
    expect(reportView(q("view=reports&mine=1&filters=x&name=Low"))).toEqual({ project: "", filters: "x", name: "Low" })
    expect(reportView(q("view=reports&mine=0"))).toBeNull()
    expect(reportViewName({ project: "", filters: "", name: "" }, undefined)).toBe("My tasks")
    expect(reportViewName({ project: "", filters: '[{"id":"task_priority"}]', name: "" }, undefined)).toBe("My tasks, filtered")
    const mine = { project: "", filters: '[{"id":"task_priority","value":["low"]},{"id":"task_assignee_name","value":["0x9"]}]', name: "" }
    expect(reportFilters(mine, undefined)).toBeNull()
    expect(JSON.parse(reportFilters(mine, "0x5a")!)).toEqual([
      { id: "task_priority", value: ["low"] },
      { id: "task_assignee_name", value: ["0x5a"] },
    ])
    expect(reportFilters({ project: "p1", filters: "f", name: "" }, undefined)).toBe("f")
  })
})
