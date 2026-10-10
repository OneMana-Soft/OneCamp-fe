import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

/**
 * A project's colour follows it (the playful layer): the sidebar, its cards,
 * its timeline bars, and its own page, where the mark sits beside the name
 * from the first paint, since it comes from the project's id.
 */
const h = vi.hoisted(() => ({ info: undefined as unknown }))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => (key.startsWith("/project/info/") ? h.info : { data: undefined, isLoading: true }),
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: true }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=list"), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/app/project/p" }))
vi.mock("@/components/project/projectTaskTable", () => ({ ProjectTaskTable: () => null }))
vi.mock("@/components/project/projectTaskKanban", () => ({ ProjectTaskKanban: () => null }))
vi.mock("@/components/project/timeline/ProjectTimeline", () => ({ ProjectTimeline: () => null }))
vi.mock("@/components/projectUpdates/ProjectUpdates", () => ({ ProjectUpdates: () => null }))
vi.mock("@/components/project/ProjectAttachments", () => ({ ProjectAttachments: () => null }))
vi.mock("@/components/entityLink/LinkedItemsSection", () => ({ LinkedItemsSection: () => null }))
vi.mock("@/components/project/ProjectHeaderLine", () => ({ ProjectHeaderLine: () => <div data-testid="project-line" /> }))
vi.mock("@/components/project/ProjectToolButtons", () => ({ ProjectActionsMenu: () => <button type="button">Project actions</button> }))
vi.mock("@/components/Notification/notificationBell", () => ({ NotificationBell: () => null }))

const { ProjectTaskDesktop } = await import("@/components/project/projectTaskDesktop")

afterEach(() => {
  cleanup()
  h.info = undefined
})

const id = "0c3b5f86-5911-49c9-9f0c-24a47241a6bd"

describe("a project's page", () => {
  it("carries the project's colour beside its name", () => {
    h.info = { data: { data: { project_uuid: id, project_name: "Q4 launch", project_is_admin: true, project_is_member: true } }, isLoading: false }
    render(<ProjectTaskDesktop projectId={id} />)
    const title = screen.getByRole("heading", { level: 1 })
    expect(title.textContent).toContain("Q4 launch")
    expect(title.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor(id))
  })

  it("draws the mark before the name arrives, so nothing moves when it does", () => {
    h.info = { data: undefined, isLoading: true }
    render(<ProjectTaskDesktop projectId={id} />)
    const title = screen.getByRole("heading", { level: 1 })
    expect(title.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor(id))
  })

  it("gives the line under the name the header's whole width, with the actions on the name's row", () => {
    // Beside the actions the line was cut short at 1440 with a panel open:
    // "6 open · 5 due this week · 11 do…" and "Launch the Business t…".
    h.info = { data: { data: { project_uuid: id, project_name: "Q4 launch", project_is_admin: true, project_is_member: true } }, isLoading: false }
    render(<ProjectTaskDesktop projectId={id} />)
    const row = screen.getByRole("heading", { level: 1 }).closest("[data-page-title-row]")!
    expect(row.contains(screen.getByRole("button", { name: "Project actions" }))).toBe(true)
    expect(screen.getByTestId("project-line").closest("[data-page-title-row]")).toBeNull()
  })
})
