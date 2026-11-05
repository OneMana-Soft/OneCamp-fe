import { describe, expect, it } from "vitest"
import { hoursChart, openOf, reportCSV, reportView, reportViewName, throughputChart, totalHours, weekLabel, type Report } from "./reports"

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
    expect(reportViewName({ filters: "[1]", name: "High work" }, "Launch")).toBe("High work")
    expect(reportViewName({ filters: '[{"id":"task_priority"}]', name: "" }, "Launch")).toBe("Launch, filtered")
    expect(reportViewName({ filters: "", name: "" }, "Launch")).toBe("Launch")
    expect(reportViewName({ filters: "[]", name: "" }, undefined)).toBe("this project")
  })
})
