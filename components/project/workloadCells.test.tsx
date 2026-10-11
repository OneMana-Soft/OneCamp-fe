import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import type { WorkloadData, WorkloadPerson, WorkloadTask } from "@/lib/workload"
import type { ProjectOverview } from "@/lib/projectsOverview"
import { resetGrowForTests } from "@/hooks/useGrow"

let data: WorkloadData
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useWorkload", () => ({
  useWorkload: () => ({ data, isLoading: false, isError: false, mutate: vi.fn(), moveLater: vi.fn(), giveTo: vi.fn(), setCapacity: vi.fn() }),
}))

import { ProjectsWorkload } from "@/components/project/ProjectsWorkload"

const person = (id: string): WorkloadPerson => ({ user_uuid: id, user_name: id, capacity: 4, capacity_set: true, hours: 40, hours_set: false, can_edit_capacity: false, project_uuids: ["p1"] })
// Tasks running across this week only: from today to today.
const now = new Date()
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString()
const task = (id: string, who: string): WorkloadTask => ({
  task_uuid: id,
  task_name: id,
  task_status: "todo",
  task_start_date: day(now),
  task_due_date: day(now),
  assignee_uuid: who,
  project_uuid: "p1",
  project_name: "Q4 launch",
  can_edit: true,
})
const projects = [{ project_uuid: "p1", project_name: "Q4 launch", is_admin: 1, open: 1, done: 0, overdue: 0, due_soon: 0 }] as ProjectOverview[]

beforeEach(() => {
  resetGrowForTests()
  window.localStorage.clear()
})
afterEach(cleanup)

/** Workload cells are capacity columns (design v3, work.md W41). */
describe("workload cells", () => {
  it("fills each week's column in proportion to the load, by transform", () => {
    data = { people: [person("maya")], tasks: [task("a", "maya"), task("b", "maya"), task("c", "maya")], undated: [], default_capacity: 5, default_hours: 40, truncated: false }
    const { container } = render(<ProjectsWorkload projects={projects} />)
    const fill = container.querySelector<HTMLElement>("[data-capacity-fill]")!
    expect(fill.style.transform).toBe("scaleY(0.75)")
    expect(fill.style.height).toBe("")
    expect(container.querySelector("[data-load='room']")).not.toBeNull()
    expect(container.querySelector("[data-over-cap]")).toBeNull()
    expect(container.querySelector("[data-workload-summary]")!.getAttribute("data-workload-summary")).toBe("room")
  })

  it("draws over capacity with a danger cap, the one place colour is used, and says who in words", () => {
    data = {
      people: [person("jonas")],
      tasks: ["a", "b", "c", "d", "e"].map((id) => task(id, "jonas")),
      undated: [],
      default_capacity: 5,
      default_hours: 40,
      truncated: false,
    }
    const { container } = render(<ProjectsWorkload projects={projects} />)
    const over = container.querySelector<HTMLElement>("[data-load='over']")!
    expect(over.querySelector("[data-over-cap]")).not.toBeNull()
    expect(over.querySelector<HTMLElement>("[data-capacity-fill]")!.style.background).toContain("--destructive")
    const room = container.querySelectorAll("[data-capacity-fill]")
    for (const f of room) if (!over.contains(f)) expect((f as HTMLElement).style.background).not.toContain("--destructive")
    expect(container.querySelector("[data-workload-summary='over']")!.textContent).toContain("jonas is over capacity this week (5 of 4)")
  })

  it("marks this week's header and draws no box round the grid", () => {
    data = { people: [person("maya")], tasks: [task("a", "maya")], undated: [], default_capacity: 5, default_hours: 40, truncated: false }
    const { container } = render(<ProjectsWorkload projects={projects} />)
    expect(container.querySelector("[data-this-week]")).not.toBeNull()
    expect(container.querySelector(".rounded-lg.border")).toBeNull()
  })
})
