import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"

import { ReportInsights } from "@/components/reports/ReportInsights"
import type { Insights, InsightSlice, Spread } from "@/lib/reports"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

afterEach(cleanup)
pinTestClock()

const spread = (n: number, p50: number): Spread => ({ n, p25: p50 / 2, p50, p85: p50 * 2, p95: p50 * 3 })
const none: Spread = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const slice = (by: InsightSlice["by"], key: string, name: string, cycle: Spread, lead: Spread, age = none): InsightSlice => ({ by, key, name, cycle, lead, age })

const insights: Insights = {
  cycle: spread(2, 30),
  lead: spread(3, 60),
  triage: spread(1, 5),
  age: spread(4, 100),
  in_status: [
    { status: "backlog", ...none },
    { status: "todo", ...spread(2, 10) },
    { status: "inProgress", ...spread(2, 20) },
    { status: "inReview", ...spread(1, 4) },
  ],
  points: [
    { task_uuid: "t1", task_name: "Ship the page", done_at: "2026-10-06T10:00:00Z", cycle: 30, lead: 60, project_uuid: "q4", person_uuid: "maya", type_id: "bug" },
    { task_uuid: "t2", task_name: "Fix the form", done_at: "2026-10-01T10:00:00Z", cycle: 20, lead: 40, project_uuid: "site" },
    { task_uuid: "t3", task_name: "Never started", done_at: "2026-09-30T10:00:00Z", lead: 80, project_uuid: "q4", priority: "high" },
  ],
  points_capped: false,
  slices: [
    slice("project", "q4", "Q4 launch", spread(1, 30), spread(2, 70), spread(3, 120)),
    slice("project", "site", "Website", spread(1, 20), spread(1, 40)),
    slice("person", "maya", "Maya Chen", spread(1, 30), spread(1, 60)),
    slice("person", "", "", spread(1, 20), spread(2, 60), spread(4, 100)),
    slice("type", "bug", "Bug", spread(1, 30), spread(1, 60)),
  ],
}
const weeks = ["2026-09-21", "2026-09-28", "2026-10-05"]
const now = Date.parse("2026-10-08T12:00:00Z")

describe("ReportInsights", () => {
  it("gives cycle, lead and triage time and the age of open work as medians, each with its 85th percentile", () => {
    render(<ReportInsights insights={insights} weeks={weeks} now={now} />)
    const tiles = screen.getAllByRole("definition").map((d) => d.textContent)
    expect(tiles).toEqual([
      "30 h",
      "median · 85% within 2.5 d · 2 tasks",
      "2.5 d",
      "median · 85% within 5 d · 3 tasks",
      "5 h",
      "median · 85% within 10 h · 1 task",
      "4.2 d",
      "median · 85% within 8.3 d · 4 tasks",
    ])
  })

  it("plots each task done by its cycle time, or its lead time, against the median and 85th percentile", () => {
    const { container } = render(<ReportInsights insights={insights} weeks={weeks} now={now} />)
    // Cycle: the task never started has none, so two dots.
    expect(container.querySelectorAll("[data-scatter-point]")).toHaveLength(2)
    expect(screen.getByText("Median 30 h")).toBeTruthy()
    expect(screen.getByText("85% within 2.5 d")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Lead time" }))
    expect(container.querySelectorAll("[data-scatter-point]")).toHaveLength(3)
    expect(screen.getByRole("img", { name: /^Lead time of 3 tasks done: median 2.5 d, 85% within 5 d/ })).toBeTruthy()
    fireEvent.click(container.querySelectorAll('[data-scatter-point] circle:last-child')[0])
    expect(screen.getByRole("link", { name: "Open task" }).getAttribute("href")).toMatch(/^\/app\/task\/t[123]$/)
  })

  it("dates a dot's tip the way the axis under it and the rest of the app write a day, not by the browser's locale", () => {
    const { container } = render(<ReportInsights insights={insights} weeks={weeks} now={now} />)
    const details = [...container.querySelectorAll("[data-scatter-point] circle:last-child")].map((dot) => {
      fireEvent.click(dot)
      return within(screen.getByRole("tooltip")).getByText(/ · done /).textContent
    })
    expect(details.sort()).toEqual(["Cycle 20 h · done 1 Oct", "Cycle 30 h · done 6 Oct"])
  })

  it("shows how long the tasks done spent at each step, the median as a bar and the 85th percentile past it", () => {
    const { container } = render(<ReportInsights insights={insights} weeks={weeks} now={now} />)
    const steps = within(screen.getByRole("region", { name: "Time in status" }))
    expect(steps.getByRole("img", { name: "In progress: 20 h median · 85% within 40 h" })).toBeTruthy()
    expect(steps.getByRole("img", { name: "Backlog: None" })).toBeTruthy()
    const bar = container.querySelector('[data-in-status="inProgress"] [role=img] > div') as HTMLElement
    expect(bar.style.width).toBe("100%")
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%")
    expect((container.querySelector('[data-in-status="todo"] [role=img] > div') as HTMLElement).style.width).toBe("50%")
  })

  it("slices by project, person, priority or type, and a slice picked shows its own numbers and dots", () => {
    const { container } = render(<ReportInsights insights={insights} weeks={weeks} now={now} />)
    const table = () => container.querySelector("[data-insight-slices]") as HTMLElement
    // The busiest first.
    expect([...table().querySelectorAll("tbody th")].map((th) => th.textContent)).toEqual(["Q4 launch", "Website"])
    fireEvent.click(within(table()).getByRole("button", { name: "Q4 launch" }))
    expect(within(table()).getByRole("button", { name: "Q4 launch" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText(/Q4 launch alone/)).toBeTruthy()
    expect(screen.getAllByRole("definition")[0].textContent).toBe("30 h")
    expect(screen.getAllByRole("definition")[2].textContent).toBe("2.9 d")
    // The other project's dot is faint; the Q4 launch's stays.
    expect(container.querySelectorAll('[data-scatter-point="muted"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Show all work" }))
    expect(container.querySelectorAll('[data-scatter-point="muted"]')).toHaveLength(0)
  })

  it("names the work with nobody on it, and says so when a span holds nothing to measure", () => {
    const empty: Insights = { cycle: none, lead: none, triage: none, age: none, in_status: insights.in_status.map((s) => ({ ...s, ...none })), points: [], points_capped: false, slices: [] }
    render(<ReportInsights insights={empty} weeks={weeks} now={now} />)
    expect(screen.getByText("No task was started and done in these weeks.")).toBeTruthy()
    expect(screen.getByText("No task done in these weeks spent time at a step.")).toBeTruthy()
    expect(screen.getByText("Nothing done or open to slice in these weeks.")).toBeTruthy()
    expect(screen.getAllByText("None")).toHaveLength(4)
  })
})
