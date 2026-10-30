import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import type { ProjectForecast } from "@/lib/work/forecast"
import type { ForecastPages } from "@/lib/work/forecastsRead"
import { ForecastWhenOf, GoalLandsLate, GoalProjectLands } from "./ForecastLines"

// The lines are handed what the page's read brought (hooks/useProjectForecasts): each page's forecasts by project id
// in lower case. A line finds its own project's, in whichever page it came.
pinTestClock()
afterEach(cleanup)

const A = "aaaaaaaa-0000-4000-8000-00000000000a"
const B = "bbbbbbbb-0000-4000-8000-00000000000b"
const C = "cccccccc-0000-4000-8000-00000000000c"
const lands = (id: string, date: string | null, state: ProjectForecast["state"] = "forecast"): ProjectForecast => ({
  project_uuid: id,
  state,
  date,
  optimistic: null,
  pessimistic: null,
  by_pace: date,
  by_links: null,
  open: 4,
  unit: "tasks",
  per_week: 2,
  weeks: 2,
  held_by: [],
  held_count: 0,
})
// Two pages, as a list of more than FORECASTS_PAGE projects is read.
const pages: ForecastPages = [{ [A]: lands(A, "2026-11-25") }, { [B]: lands(B, "2026-11-18"), [C]: lands(C, null, "starting") }]

describe("a list's forecast lines, from what the page read", () => {
  it("say a project's forecast whichever page it came in, its id in any case, and nothing before the read has come", () => {
    const { container, rerender } = render(<ForecastWhenOf forecasts={undefined} projectId={B.toUpperCase()} />)
    expect(container.textContent).toBe("")
    rerender(<ForecastWhenOf forecasts={pages} projectId={B.toUpperCase()} />)
    expect(container.textContent).toMatch(/^Lands ~/)
    rerender(<ForecastWhenOf forecasts={pages} projectId={C} />)
    expect(container.textContent).toBe("")
  })

  it("join what comes before them only when they say something (a phone row's \" · \")", () => {
    const sep = <span data-sep="">·</span>
    const { container, rerender } = render(<ForecastWhenOf forecasts={pages} projectId={B} before={sep} />)
    expect(container.textContent).toMatch(/^·Lands ~18 Nov$/)
    rerender(<ForecastWhenOf forecasts={pages} projectId={C} before={sep} />)
    expect(container.querySelector("[data-sep]")).toBeNull()
    rerender(<ForecastWhenOf forecasts={undefined} projectId={B} before={sep} />)
    expect(container.querySelector("[data-sep]")).toBeNull()
  })

  it("on a goal's project row, say when it lands, and when that's after the goal's date", () => {
    const late = render(<GoalProjectLands forecasts={pages} projectId={A} due="2026-11-20" />)
    expect(late.container.textContent).toMatch(/^Lands ~.*, after the goal's date$/)
    cleanup()
    const inTime = render(<GoalProjectLands forecasts={pages} projectId={B} due="2026-11-20" />)
    expect(inTime.container.textContent).toMatch(/^Lands ~/)
    expect(inTime.container.querySelector("[data-lands-after-goal]")).toBeNull()
    cleanup()
    expect(render(<GoalProjectLands forecasts={pages} projectId={C} due="2026-11-20" />).container.textContent).toBe("")
  })

  it("count the goal's projects that land after its date, across the pages, and say nothing when none does", () => {
    const { container, rerender } = render(<GoalLandsLate forecasts={pages} ids={[A, B, C]} due="2026-11-17" />)
    expect(container.textContent).toBe("2 projects land late")
    rerender(<GoalLandsLate forecasts={pages} ids={[A, B, C]} due="2026-11-20" />)
    expect(container.textContent).toBe("1 project lands late")
    rerender(<GoalLandsLate forecasts={pages} ids={[A, B, C]} due="2026-11-30" />)
    expect(container.textContent).toBe("")
    rerender(<GoalLandsLate forecasts={undefined} ids={[A, B, C]} due="2026-11-17" />)
    expect(container.textContent).toBe("")
  })
})
