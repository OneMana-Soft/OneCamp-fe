import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ProjectOverview } from "@/lib/projectsOverview"

// linear-15 (DB-93's verdict, 2 Nov): a phone's project card names its team, lead and labels on a line of its own,
// as the laptop's row does (SubLine); before, only the laptop's row had it, so a phone never saw a project's lead.

const state = vi.hoisted(() => ({ projects: [] as ProjectOverview[] }))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: state.projects, isLoading: false, isError: false, mutate: vi.fn() }) }))
vi.mock("@/hooks/useMyMilestones", () => ({ useMyMilestones: () => new Map() }))
vi.mock("@/hooks/useProjectForecasts", () => ({ useProjectForecasts: () => undefined }))
vi.mock("@/components/goals/GoalsView", () => ({ GoalsView: () => null }))
vi.mock("@/components/reports/ReportsView", () => ({ ReportsView: () => null }))
vi.mock("@/components/project/ProjectsTimeline", () => ({ ProjectsTimeline: () => null }))
vi.mock("@/components/project/ProjectsWorkload", () => ({ ProjectsWorkload: () => null }))
vi.mock("@/components/work/RunningCycles", () => ({ RunningCycles: () => null }))

import { ProjectsOverview } from "@/components/project/ProjectsOverview"

const base = { is_admin: 1, open: 3, done: 1, overdue: 0, due_soon: 0 }
const status = { category: "in_progress" as const, name: "In progress", color: "" }
const BILLING: ProjectOverview = {
  ...base,
  project_uuid: "p-billing",
  project_name: "Billing revamp",
  project_team: { team_uuid: "t1", team_name: "Payments" },
  plan: {
    lead: { user_uuid: "u1", name: "Ana Diaz" },
    start: null,
    target: null,
    priority: "high",
    status,
    labels: [
      { id: "l1", name: "Revenue", color: "emerald" },
      { id: "l2", name: "Q4 bet", color: "slate" },
      { id: "l3", name: "Ops", color: "sky" },
    ],
  },
}
const AUDIT: ProjectOverview = { ...base, project_uuid: "p-audit", project_name: "Audit prep", plan: { lead: null, start: null, target: null, priority: "", status, labels: null } }
const card = (name: string) => screen.getByText(name).closest<HTMLElement>("[data-project-row]")!

afterEach(() => {
  cleanup()
  state.projects = []
})

describe("a phone's project card (linear-15)", () => {
  it("names the project's team, lead and first two labels on a line of its own, and a card with none has no line", () => {
    state.projects = [BILLING, AUDIT]
    render(<ProjectsOverview />)
    const line = card("Billing revamp").querySelector("[data-plan-line]")
    expect(line?.textContent).toBe("Payments · Ana Diaz · Revenue · Q4 bet")
    // Between the name's line and the counts' line, as the laptop's row has it under the name.
    expect(line?.compareDocumentPosition(card("Billing revamp").querySelector("[data-row-counts]")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(card("Audit prep").querySelector("[data-plan-line]")).toBeNull()
  })
})
