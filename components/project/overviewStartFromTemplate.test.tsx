import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// UX-PROJECTS-H1 (PROJECTS-24): with no projects yet, the projects page offers
// New project and Start from a template. Both opened the same blank dialog;
// Start from a template now opens it with a template chosen, its tasks and
// dates shown, so the two differ.

const dispatched = vi.hoisted(() => [] as { type: string; payload?: { key?: string; data?: { templateId?: string } } }[])
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useDispatch: () => (a: (typeof dispatched)[number]) => void dispatched.push(a) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: [], isLoading: false, isError: false, mutate: vi.fn() }) }))
vi.mock("@/hooks/useMyMilestones", () => ({ useMyMilestones: () => new Map() }))
vi.mock("@/hooks/useProjectForecasts", () => ({ useProjectForecasts: () => undefined }))

import { ProjectsOverview } from "@/components/project/ProjectsOverview"
import { ANY_TEMPLATE } from "@/lib/projectTemplateStart"

afterEach(() => {
  cleanup()
  dispatched.length = 0
})

const opened = () => dispatched.filter((a) => a.payload?.key === "createProject").map((a) => a.payload?.data?.templateId)

describe("the projects page with no projects", () => {
  it("opens New project blank, and Start from a template on a template", () => {
    render(<ProjectsOverview />)
    const empty = within(screen.getByRole("heading", { name: "No projects yet" }).closest<HTMLElement>("[data-work-state]")!)
    fireEvent.click(empty.getByRole("button", { name: "New project" }))
    fireEvent.click(empty.getByRole("button", { name: "Start from a template" }))
    expect(opened()).toEqual([undefined, ANY_TEMPLATE])
  })
})
