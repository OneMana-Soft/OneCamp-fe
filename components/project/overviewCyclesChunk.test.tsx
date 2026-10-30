import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ProjectOverview } from "@/lib/projectsOverview"
import { resetGrowForTests } from "@/hooks/useGrow"

// The projects overview's loading rows (V-16). The Cycles view is a chunk of
// its own: while it is on its way, the view's own loading rows hold its place
// and the overview stays round it. A bare next/dynamic suspended up to the
// route's skeleton instead, and the Cycles view had no loading state.

const state = vi.hoisted(() => {
  let go = () => {}
  const chunk = new Promise<void>((resolve) => (go = resolve))
  return { chunk, go: () => go(), loading: false, projects: undefined as ProjectOverview[] | undefined }
})

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
const media = vi.hoisted(() => ({ desktop: true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: media.desktop, isMobile: !media.desktop }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: state.projects, isLoading: state.loading, isError: false, mutate: vi.fn() }) }))
// Every project's milestones, which the overview reads after its list (linear-16): none here.
vi.mock("@/hooks/useMyMilestones", () => ({ useMyMilestones: () => new Map() }))
vi.mock("@/components/goals/GoalsView", () => ({ GoalsView: () => null }))
vi.mock("@/components/reports/ReportsView", () => ({ ReportsView: () => null }))
vi.mock("@/components/project/ProjectsTimeline", () => ({ ProjectsTimeline: () => null }))
vi.mock("@/components/project/ProjectsWorkload", () => ({ ProjectsWorkload: () => null }))
// The Cycles view's chunk arrives only when the test lets it.
vi.mock("@/components/work/RunningCycles", async () => {
  await state.chunk
  return { RunningCycles: ({ compact }: { compact?: boolean }) => <div data-running-cycles="">{compact ? "cycles on a phone" : "cycles at a desk"}</div> }
})

import { ProjectsOverview } from "@/components/project/ProjectsOverview"

beforeEach(() => {
  window.localStorage.clear()
  resetGrowForTests()
})
afterEach(() => {
  cleanup()
  media.desktop = true
  state.loading = false
  state.projects = undefined
})

describe("the projects overview's loading rows", () => {
  it("holds the Cycles view's place with its own loading rows while its chunk is on its way, then draws the view", async () => {
    state.projects = []
    render(<ProjectsOverview />)
    fireEvent.click(screen.getByRole("tab", { name: /Cycles/ }))
    const rows = screen.getByRole("status", { name: "Loading cycles" })
    expect(rows.children).toHaveLength(6)
    expect(rows.children[2].className).toContain("h-[56px]")
    // The overview stays round it: its views' tabs, Cycles chosen.
    expect(screen.getByRole("tab", { name: /Cycles/ }).getAttribute("aria-selected")).toBe("true")
    state.go()
    expect(await screen.findByText("cycles at a desk")).toBeTruthy()
    expect(screen.queryByRole("status", { name: "Loading cycles" })).toBeNull()
  })

  it("holds the projects table's place with its header and five rows a project's row high", () => {
    state.loading = true
    const { unmount } = render(<ProjectsOverview />)
    const desk = screen.getByRole("status", { name: "Loading projects" })
    expect(desk.children).toHaveLength(6)
    expect(desk.children[0].className).toContain("h-8")
    expect(desk.children[1].className).toContain("h-[52px]")
    unmount()
    media.desktop = false
    render(<ProjectsOverview />)
    const phone = screen.getByRole("status", { name: "Loading projects" })
    expect(phone.children).toHaveLength(5)
    expect(phone.children[0].className).toContain("h-[72px]")
  })
})
