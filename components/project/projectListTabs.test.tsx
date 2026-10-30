import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

let search = ""
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: true }) }))
vi.mock("@/components/project/projectListTabContent", () => ({ ProjectListTabContent: ({ selectedTab }: { selectedTab: string }) => <div data-testid={`content-${selectedTab}`} /> }))
vi.mock("@/components/project/projectTaskKanban", () => ({ ProjectTaskKanban: () => <div data-testid="content-board" /> }))
vi.mock("@/components/project/timeline/ProjectTimeline", () => ({ ProjectTimeline: () => <div data-testid="content-timeline" /> }))
vi.mock("@/components/work/backlog/ProjectBacklog", () => ({ default: () => <div data-testid="content-backlog" /> }))
vi.mock("@/components/projectUpdates/ProjectUpdates", () => ({ ProjectUpdates: () => <div data-testid="content-updates" /> }))
vi.mock("@/components/project/ProjectGlanceLine", () => ({ ProjectGlanceLine: () => <p data-testid="glance" /> }))
// The phone's one "⋯": the tools, then notifications, the name and the members.
let menuExtra: string[] = []
let menuNotifications: { level: string; onChoose: (level: string) => void } | undefined
vi.mock("@/components/project/ProjectToolButtons", () => ({
  ProjectActionsMenu: ({ extra, notifications }: { extra?: { label: string }[]; notifications?: typeof menuNotifications }) => {
    menuExtra = (extra ?? []).map((e) => e.label)
    menuNotifications = notifications
    return null
  },
}))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})) }) }))
vi.mock("@/components/projectUpdates/ProjectHealthChip", () => ({ ProjectHealthChip: ({ className }: { className?: string }) => <span data-testid="health-chip" className={className} /> }))
vi.mock("@/components/goals/ProjectGoalChip", () => ({ ProjectGoalChip: ({ className }: { className?: string }) => <a data-testid="goal-chip" className={className} /> }))

const { ProjectListTabs } = await import("@/components/project/projectListTabs")

afterEach(() => {
  cleanup()
  search = ""
})

describe("a project's tabs on a phone", () => {
  it("are the computer's seven, Docs and the backlog among them (PTC-12, B3)", () => {
    render(<ProjectListTabs projectId="p" />)
    const names = screen.getAllByRole("tab").map((t) => t.textContent)
    expect(names).toEqual(["Tasks", "Board", "Backlog", "Timeline", "Updates", "Attachments", "Docs & Files"])
  })

  it("keep the project's line above the tabs, so no tab jumps when chosen", () => {
    render(<ProjectListTabs projectId="p" />)
    const glance = screen.getByTestId("glance")
    expect(glance.closest('[role="tabpanel"]')).toBeNull()
    expect(glance.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("open the tab a link names, in the desktop's words or the phone's", async () => {
    for (const [tab, panel] of [["kanban", "board"], ["backlog", "backlog"], ["attachments", "attachment"], ["updates", "updates"]]) {
      search = `tab=${tab}`
      render(<ProjectListTabs projectId="p" />)
      // The board and updates are chunks of their own, so they arrive a tick later.
      expect(await screen.findByTestId(`content-${panel}`)).toBeTruthy()
      cleanup()
    }
  })
})

describe("the phone project's chips (PTC-43)", () => {
  it("keep to the screen, the goal's name giving way, where the row ran off it mid-word", () => {
    render(<ProjectListTabs projectId="p" />)
    const goal = screen.getByTestId("goal-chip")
    const row = goal.parentElement!
    expect(row.className).not.toMatch(/overflow-x-auto/)
    expect(goal.className).toMatch(/\bmin-w-0\b/)
    expect(goal.className).toMatch(/\bshrink\b/)
    expect(screen.getByTestId("health-chip").className).toContain("shrink-0")
  })
})

describe("the phone project's one menu", () => {
  it("carries notifications and the members, which the top bar's second ⋯ held", () => {
    render(<ProjectListTabs projectId="p1" />)
    expect(menuExtra).toEqual(expect.arrayContaining(["Project members"]))
    // Notifications is the menu's own item, whose levels are picked, not cycled (PTC-26).
    expect(menuNotifications?.level).toBe("all")
    expect(typeof menuNotifications?.onChoose).toBe("function")
  })
})
