import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Report } from "@/lib/reports"

const report: Report = {
  weeks: ["2026-09-28", "2026-10-05"],
  done: [3, 1],
  added: [2, 4],
  hours: [1.5, 2],
  open: 6,
  overdue: 2,
  due_this_week: 1,
  done_total: 4,
  on_time_percent: 75,
  projects: [{ project_uuid: "q4", project_name: "Q4 launch", to_do: 3, in_progress: 2, in_review: 1, overdue: 2, done: 4 }],
  people: [
    { user_uuid: "maya", user_name: "Maya Chen", to_do: 1, in_progress: 1, in_review: 0, overdue: 1, done: 3 },
    { to_do: 2, in_progress: 0, in_review: 0, overdue: 0, done: 0 },
  ],
  priorities: [{ priority: "high", open: 2, overdue: 1 }],
  all_projects: [
    { project_uuid: "q4", project_name: "Q4 launch" },
    { project_uuid: "site", project_name: "Website" },
  ],
  truncated: false,
}

let answer: { data?: { data: Report }; isLoading?: boolean; isError?: unknown } = { data: { data: report } }
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { ...answer, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
const download = vi.fn(() => true)
vi.mock("@/lib/utils/file/downloadTextFile", () => ({ downloadTextFile: (...a: unknown[]) => download(...(a as [])) }))

const { ReportsView } = await import("@/components/reports/ReportsView")

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  asked.length = 0
  answer = { data: { data: report } }
})

describe("ReportsView", () => {
  it("answers the weekly review: what's open and overdue, what got done and on time, the hours", () => {
    render(<ReportsView />)
    expect(screen.getByText("2 overdue")).toBeTruthy()
    expect(screen.getByText("75% by their due date")).toBeTruthy()
    expect(screen.getByText("3.5")).toBeTruthy()
    expect(screen.getByText("Done and added each week")).toBeTruthy()
    expect(screen.getByText("Hours logged each week")).toBeTruthy()
  })

  it("breaks open work down by project, person and priority", () => {
    render(<ReportsView />)
    expect(screen.getByRole("link", { name: "Q4 launch" }).getAttribute("href")).toContain("/q4")
    expect(screen.getByText("Maya Chen")).toBeTruthy()
    expect(screen.getByText("Nobody")).toBeTruthy()
    expect(screen.getByRole("img", { name: "3 to do, 2 in progress, 1 in review" })).toBeTruthy()
    expect(screen.getByText("High")).toBeTruthy()
  })

  it("asks for the weeks and zone it shows, and downloads what it shows", () => {
    render(<ReportsView />)
    // Once, after the remembered choices are read: nothing asked before them.
    expect(asked.filter(Boolean)[0]).toBe("/project/report?tz=Asia%2FKolkata&weeks=12")
    expect(new Set(asked.filter(Boolean)).size).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }))
    expect(download).toHaveBeenCalledWith("onecamp-report-2026-10-05.csv", expect.stringContaining("Q4 launch"), "text/csv")
  })

  it("says what to do when there are no projects to report on", () => {
    answer = { data: { data: { ...report, all_projects: [], projects: [], people: [] } } }
    render(<ReportsView />)
    expect(screen.getByText("No report yet")).toBeTruthy()
  })

  it("says so when the chosen weeks hold nothing", () => {
    answer = { data: { data: { ...report, open: 0, done_total: 0 } } }
    render(<ReportsView />)
    expect(screen.getByText("Nothing open or done in these weeks")).toBeTruthy()
  })

  it("keeps its controls while a report loads or fails, so a choice can be changed", () => {
    answer = { data: undefined, isLoading: false, isError: new Error("no") }
    render(<ReportsView />)
    expect(screen.getByText(/couldn.t load/i)).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Weeks" })).toBeTruthy()
  })

  it("forgets a remembered project that's gone instead of showing an empty report", () => {
    localStorage.setItem("oc_report_projects", JSON.stringify(["gone"]))
    render(<ReportsView />)
    expect(screen.getByRole("button", { name: /Projects: All projects/ })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem("oc_report_projects") || "null")).toEqual([])
  })
})
