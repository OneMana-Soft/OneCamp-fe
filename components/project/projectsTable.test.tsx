import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ProjectOverview } from "@/lib/projectsOverview"
import type { Milestone } from "@/lib/work/milestones"
import { hueFor } from "@/lib/campHue"
import { resetGrowForTests } from "@/hooks/useGrow"
import { pinTestClock } from "@/lib/testing/testClock"

let projects: ProjectOverview[] = []
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
const media = vi.hoisted(() => ({ desktop: true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: media.desktop, isMobile: !media.desktop }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects, isLoading: false, isError: false, mutate: vi.fn() }) }))
// Every project's milestones, read after the list (linear-16): none unless a test gives some.
const read = vi.hoisted(() => ({ milestones: new Map<string, Milestone[]>(), ready: [] as boolean[] }))
vi.mock("@/hooks/useMyMilestones", () => ({
  useMyMilestones: (ready: boolean) => {
    read.ready.push(ready)
    return read.milestones
  },
}))
// Each project's forecast (linear-20) is its own tests' (useProjectForecasts.test, projectsForecasts.spec): none here.
vi.mock("@/hooks/useProjectForecasts", () => ({ useProjectForecasts: () => undefined }))
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

pinTestClock()
beforeEach(() => {
  window.localStorage.clear()
  resetGrowForTests()
})
afterEach(() => {
  cleanup()
  media.desktop = true
  read.milestones = new Map()
  read.ready = []
})

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

  it("names each project's next milestone after its name, at a desk and on a phone, once the list is in", async () => {
    const m = (id: string, name: string, next: boolean, target_date: string | null): Milestone =>
      ({ id, name, next, target_date, progress: { total: 3, started: 1, done: next ? 1 : 3 } }) as Milestone
    projects = [project("q4-launch"), project("onboarding")]
    read.milestones = new Map([["q4-launch", [m("a", "Alpha", false, "2026-10-01"), m("b", "Beta", true, "2026-11-30")]]])
    for (const desktop of [true, false]) {
      media.desktop = desktop
      const { unmount } = render(<ProjectsOverview />)
      // A chunk of its own (next/dynamic), so it comes a moment after the row.
      const shown = await waitFor(() => {
        const found = [...document.querySelectorAll("[data-next-milestone]")]
        expect(found).toHaveLength(1)
        return found
      })
      expect(shown[0].textContent).toContain("Next milestone:")
      expect(shown[0].textContent).toContain("Beta")
      expect(shown[0].getAttribute("title")).toMatch(/^Next milestone: Beta, /)
      expect(shown[0].closest("[data-project-row]")!.textContent).toContain("q4-launch")
      unmount()
    }
    // Read only once the list is in.
    expect(read.ready.every(Boolean)).toBe(true)
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

describe("the projects overview on a phone (PTC-42)", () => {
  it("leaves the page's name to the top bar, and puts New project at the end of the views' row", () => {
    media.desktop = false
    projects = [project("q4")]
    render(<ProjectsOverview />)
    const title = screen.getByRole("heading", { level: 1, name: "Projects" })
    expect(title.className).toContain("sr-only")
    const row = screen.getByRole("tablist", { name: "Projects views" }).parentElement!
    expect(row.hasAttribute("data-overview-tabs-row")).toBe(true)
    expect(within(row).getByRole("button", { name: "New project" })).toBeInTheDocument()
  })
})
