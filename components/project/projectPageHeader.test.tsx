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
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
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
  it("carries the project's tile at 36 beside its name, in its own hue, with no eyebrow", () => {
    h.info = { data: { data: { project_uuid: id, project_name: "Q4 launch", project_is_admin: true, project_is_member: true, project_team: { team_name: "Launch" } } }, isLoading: false }
    const { container } = render(<ProjectTaskDesktop projectId={id} />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Q4 launch")
    const tile = container.querySelector("[data-project-tile='36']")
    expect(tile?.getAttribute("data-hue")).toBe(hueFor(id))
    expect(screen.queryByText(/Project · /)).toBeNull()
  })

  it("draws the tile before the name arrives, so nothing moves when it does", () => {
    h.info = { data: undefined, isLoading: true }
    const { container } = render(<ProjectTaskDesktop projectId={id} />)
    expect(container.querySelector("[data-project-tile='36']")?.getAttribute("data-hue")).toBe(hueFor(id))
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
  })

  it("names where you are in a breadcrumb with the tile at 16, and lights only its own page's top band", () => {
    h.info = { data: { data: { project_uuid: id, project_name: "Q4 launch", project_is_admin: true, project_is_member: true } }, isLoading: false }
    const { container } = render(<ProjectTaskDesktop projectId={id} />)
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(crumb.textContent).toContain("Projects")
    expect(crumb.querySelector("[data-project-tile='16']")).not.toBeNull()
    expect(container.querySelector("[data-project-band]")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Project actions" })).toBeTruthy()
  })
})
