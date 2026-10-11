import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ProjectOverview } from "@/lib/projectsOverview"
import { hueFor } from "@/lib/campHue"
import { resetGrowForTests } from "@/hooks/useGrow"

let projects: ProjectOverview[] = []
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects, isLoading: false, isError: false, mutate: vi.fn() }) }))
vi.mock("@/components/goals/GoalsView", () => ({ GoalsView: () => null }))
vi.mock("@/components/reports/ReportsView", () => ({ ReportsView: () => null }))
vi.mock("@/components/project/ProjectsTimeline", () => ({ ProjectsTimeline: () => null }))
vi.mock("@/components/project/ProjectsWorkload", () => ({ ProjectsWorkload: () => null }))

import { ProjectsOverview, attentionOf } from "@/components/project/ProjectsOverview"

const project = (id: string, over: Partial<ProjectOverview> = {}): ProjectOverview => ({
  project_uuid: id,
  project_name: id,
  is_admin: 1,
  open: 6,
  done: 4,
  overdue: 0,
  due_soon: 0,
  project_team: { team_uuid: "t1", team_name: "Launch" },
  ...over,
})

beforeEach(() => {
  window.localStorage.clear()
  resetGrowForTests()
})
afterEach(cleanup)

/** The projects table (design v3, work.md W39). */
describe("the projects table", () => {
  it("leads each row with the project's 20 px tile in its own hue, and says health in words", () => {
    projects = [project("q4-launch", { health: "on_track" }), project("onboarding")]
    render(<ProjectsOverview />)
    const rows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-project-row"))
    expect(rows).toHaveLength(2)
    // Ordered by name: onboarding, then q4-launch.
    rows.reverse()
    const tile = rows[0].querySelector("[data-project-tile]")!
    expect(tile.getAttribute("data-project-tile")).toBe("20")
    expect(tile.getAttribute("data-hue")).toBe(hueFor("q4-launch"))
    expect(within(rows[0]).getByText("On track")).toBeInTheDocument()
    expect(within(rows[1]).getByText("No update yet")).toBeInTheDocument()
  })

  it("fills progress by transform, not width", () => {
    projects = [project("q4", { open: 1, done: 3 })]
    const { container } = render(<ProjectsOverview />)
    const fill = container.querySelector<HTMLElement>("[data-project-row] [data-bar-fill]")!
    expect(fill.style.transform).toBe("scaleX(0.75)")
    expect(fill.style.width).toBe("")
  })

  it("draws no box round the list and no pagination", () => {
    projects = [project("q4")]
    const { container } = render(<ProjectsOverview />)
    expect(container.querySelector("table")).toBeNull()
    expect(container.querySelector("[data-projects-list]")!.className).not.toMatch(/\bborder\b|rounded/)
    expect(screen.queryByText(/Rows per page/)).toBeNull()
  })

  it("shows the needs-attention dot only with a reason", () => {
    projects = [project("late", { overdue: 2 }), project("risky", { health: "at_risk" }), project("fine", { health: "on_track" })]
    const { container } = render(<ProjectsOverview />)
    const dots = [...container.querySelectorAll("[data-attention]")]
    expect(dots).toHaveLength(2)
    expect(dots.map((d) => d.getAttribute("data-tip"))).toEqual(["2 tasks overdue", "At risk"])
    expect(attentionOf(project("fine", { health: "on_track" }))).toBeNull()
    expect(attentionOf(project("quiet", { updated_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }))?.reason).toBe("No update for 20 days")
  })

  it("groups by team when there is more than one, and not otherwise", () => {
    projects = [project("a"), project("b", { project_team: { team_uuid: "t2", team_name: "Support" } })]
    const { container, unmount } = render(<ProjectsOverview />)
    expect([...container.querySelectorAll("[data-group-header]")].map((h) => h.textContent)).toEqual(["Launch1", "Support1"])
    unmount()
    projects = [project("a"), project("b")]
    const flat = render(<ProjectsOverview />)
    expect(flat.container.querySelector("[data-group-header]")).toBeNull()
  })
})
