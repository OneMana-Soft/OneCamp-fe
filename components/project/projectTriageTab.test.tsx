import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

/**
 * A project's Triage tab (linear-21 H3): drawn only while the project's info says triage is on
 * (project_triage, laid over the read the page already makes), with what waits as its count. The
 * queue itself (GET /project/{id}/triage) is read only while the tab is open, so a project's first
 * load asks nothing new, on or off (the 7th check: no extra round trips from the web).
 */
const h = vi.hoisted(() => ({ info: undefined as unknown, keys: [] as string[], search: "tab=list" }))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    h.keys.push(key ?? "")
    return key?.startsWith("/project/info/") ? h.info : { data: undefined, isLoading: true }
  },
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: true }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(h.search), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/app/project/p" }))
vi.mock("@/components/project/projectTaskTable", () => ({ ProjectTaskTable: () => null }))
vi.mock("@/components/project/projectTaskKanban", () => ({ ProjectTaskKanban: () => null }))
vi.mock("@/components/project/timeline/ProjectTimeline", () => ({ ProjectTimeline: () => null }))
vi.mock("@/components/projectUpdates/ProjectUpdates", () => ({ ProjectUpdates: () => null }))
vi.mock("@/components/project/ProjectAttachments", () => ({ ProjectAttachments: () => null }))
vi.mock("@/components/entityLink/LinkedItemsSection", () => ({ LinkedItemsSection: () => null }))
vi.mock("@/components/project/ProjectHeaderLine", () => ({ ProjectHeaderLine: () => <div data-testid="project-line" /> }))
vi.mock("@/components/project/ProjectToolButtons", () => ({ ProjectActionsMenu: () => <button type="button">Project actions</button> }))
vi.mock("@/components/Notification/notificationBell", () => ({ NotificationBell: () => null }))
vi.mock("@/components/project/projectListTabContent", () => ({ ProjectListTabContent: () => null }))
vi.mock("@/components/project/ProjectGlanceLine", () => ({ ProjectGlanceLine: () => null }))
vi.mock("@/components/projectUpdates/ProjectHealthChip", () => ({ ProjectHealthChip: () => null }))
vi.mock("@/components/goals/ProjectGoalChip", () => ({ ProjectGoalChip: () => null }))
vi.mock("@/components/project/ProjectLinksStrip", () => ({ ProjectLinksChip: () => null, ProjectLinksStrip: () => null }))
// The tab's view is a chunk of its own: here, a mark of where it is drawn.
vi.mock("@/components/work/triage/TriageTab", () => ({ TriageTab: ({ projectId }: { projectId: string }) => <div data-testid="triage-view">{projectId}</div> }))

const { ProjectTaskDesktop } = await import("@/components/project/projectTaskDesktop")
const { ProjectListTabs } = await import("@/components/project/projectListTabs")

const id = "0c3b5f86-5911-49c9-9f0c-24a47241a6bd"
const info = (triage?: { on: boolean; waiting: number }) => ({
  data: { data: { project_uuid: id, project_name: "Support desk", project_is_admin: false, project_is_member: true, project_team: { team_name: "Support" }, ...(triage ? { project_triage: triage } : {}) } },
  isLoading: false,
})
const tabNames = () => screen.queryAllByRole("tab").map((t) => t.textContent ?? "")
const asksTriage = () => h.keys.filter((k) => k.includes("/triage"))

afterEach(() => {
  cleanup()
  h.info = undefined
  h.keys = []
  h.search = "tab=list"
})

describe("a project's Triage tab on a computer", () => {
  it("is not drawn while the project's info carries no triage (today's server, or a guest), and nothing asks for the queue", () => {
    h.info = info()
    render(<ProjectTaskDesktop projectId={id} />)
    expect(tabNames().some((n) => n.startsWith("Triage"))).toBe(false)
    expect(asksTriage()).toEqual([])
  })

  it("is not drawn while triage is off, and the first load sends no GET /triage", () => {
    h.info = info({ on: false, waiting: 0 })
    render(<ProjectTaskDesktop projectId={id} />)
    expect(tabNames().some((n) => n.startsWith("Triage"))).toBe(false)
    expect(asksTriage()).toEqual([])
  })

  it("is drawn while triage is on, with what waits as its count, still with no queue read until it is opened", () => {
    h.info = info({ on: true, waiting: 2 })
    render(<ProjectTaskDesktop projectId={id} />)
    const tab = screen.getByRole("tab", { name: /Triage/ })
    expect(tab.textContent).toContain("2")
    expect(screen.queryByTestId("triage-view")).toBeNull()
    expect(asksTriage()).toEqual([])
  })

  it("opens on ?tab=triage while triage is on", () => {
    h.search = "tab=triage"
    h.info = info({ on: true, waiting: 1 })
    render(<ProjectTaskDesktop projectId={id} />)
    expect(screen.getByRole("tab", { name: /Triage/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByTestId("triage-view").textContent).toBe(id)
  })

  it("leaves ?tab=triage on the list while triage is off", () => {
    h.search = "tab=triage"
    h.info = info({ on: false, waiting: 0 })
    render(<ProjectTaskDesktop projectId={id} />)
    expect(screen.queryByTestId("triage-view")).toBeNull()
    expect(screen.getByRole("tab", { name: /List/ }).getAttribute("aria-selected")).toBe("true")
  })
})

describe("a project's Triage tab on a phone", () => {
  it("is among the tabs, with its count, only while triage is on", () => {
    h.info = info({ on: true, waiting: 3 })
    render(<ProjectListTabs projectId={id} />)
    const tab = screen.getByRole("tab", { name: /Triage/ })
    expect(tab.textContent).toContain("3")
    expect(asksTriage()).toEqual([])
    cleanup()
    h.info = info({ on: false, waiting: 0 })
    render(<ProjectListTabs projectId={id} />)
    expect(tabNames().some((n) => n.startsWith("Triage"))).toBe(false)
    expect(asksTriage()).toEqual([])
  })

  it("opens on ?tab=triage while triage is on", () => {
    h.search = "tab=triage"
    h.info = info({ on: true, waiting: 1 })
    render(<ProjectListTabs projectId={id} />)
    expect(screen.getByTestId("triage-view").textContent).toBe(id)
  })
})
