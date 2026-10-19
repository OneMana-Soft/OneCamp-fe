import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Notice } from "@/services/workAccessService"

// The admins are told once that members now change tasks (Work Access, A1):
// where to choose who can, and gone for good once dismissed.

let notices: Notice[] | undefined
const refetch = vi.fn()
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url === "/notices" && notices ? { data: { notices } } : undefined, mutate: refetch }
  },
}))
// Where the page is: a project's page unless a test says otherwise.
let at = { path: "/app/project/p-1", search: "" }
vi.mock("next/navigation", () => ({
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(at.search),
}))
const dismissed: string[] = []
vi.mock("@/services/workAccessService", async (orig) => ({
  ...(await orig<typeof import("@/services/workAccessService")>()),
  dismissNotice: vi.fn(async (key: string) => {
    dismissed.push(key)
  }),
}))
vi.mock("next/link", () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
}))

const { MembersEditNotice, membersNoticeShowsOn } = await import("./MembersEditNotice")

afterEach(() => {
  cleanup()
  notices = undefined
  dismissed.length = 0
  asked.length = 0
  at = { path: "/app/project/p-1", search: "" }
  refetch.mockClear()
})

// STEP4_PLAN #1 (17 Oct): it sat across the top of every page, Settings and
// the calendar included, a row on a computer and about 100 px on a phone.
// It shows where its link leads: the projects and admin Permissions.
describe("where the members-edit notice shows", () => {
  it("is on the projects, any project's pages, and admin Permissions", () => {
    expect(membersNoticeShowsOn("/app/project", null)).toBe(true)
    expect(membersNoticeShowsOn("/app/project/p-1", null)).toBe(true)
    expect(membersNoticeShowsOn("/app/project/p-1", "timeline")).toBe(true)
    expect(membersNoticeShowsOn("/app/admin", "permissions")).toBe(true)
  })

  it("is nowhere else, admin's other sections among them", () => {
    for (const [path, tab] of [
      ["/app/home", null],
      ["/app/calendar", null],
      ["/app/channel/c-1", null],
      ["/app/doc/d-1", null],
      ["/app/activity", null],
      ["/app/admin", null],
      ["/app/admin", "notifications"],
      ["/app/projects-archive", null],
    ] as const) {
      expect(membersNoticeShowsOn(path, tab), `${path}?tab=${tab}`).toBe(false)
    }
  })

  it("draws nothing and asks the server nothing on another page", () => {
    notices = [{ key: "projects.members_edit", data: { project_uuid: "p-1", project_name: "Website" } }]
    at = { path: "/app/calendar", search: "" }
    const { container } = render(<MembersEditNotice />)
    expect(container.textContent).toBe("")
    expect(asked.filter((u) => u !== "")).toEqual([])
  })

  it("shows on admin Permissions", () => {
    notices = [{ key: "projects.members_edit" }]
    at = { path: "/app/admin", search: "tab=permissions" }
    render(<MembersEditNotice />)
    expect(screen.getByRole("status").textContent).toContain("Members can now change tasks in your projects.")
  })
})

describe("the members-edit notice", () => {
  it("tells a project's admin, and links to that project's setting", () => {
    notices = [{ key: "projects.members_edit", data: { project_uuid: "p-1", project_name: "Website" } }]
    render(<MembersEditNotice />)
    expect(screen.getByRole("status").textContent).toContain("Members can now change tasks in your projects.")
    expect(screen.getByRole("status").textContent).toContain("Choose who can, per project:")
    expect(screen.getByRole("link", { name: "Who can change tasks in Website" }).getAttribute("href")).toBe("/app/project/p-1?tool=access")
  })

  it("sends a workspace admin who runs no project to the workspace's default", () => {
    notices = [{ key: "projects.members_edit" }]
    render(<MembersEditNotice />)
    expect(screen.getByRole("link", { name: "Permissions" }).getAttribute("href")).toBe("/app/admin?tab=permissions")
  })

  it("says nothing to someone it isn't for", () => {
    notices = []
    const { container } = render(<MembersEditNotice />)
    expect(container.textContent).toBe("")
  })

  it("is gone once dismissed, and the server is told", async () => {
    notices = [{ key: "projects.members_edit", data: { project_uuid: "p-1", project_name: "Website" } }]
    render(<MembersEditNotice />)
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByRole("status")).toBeNull()
    await waitFor(() => expect(dismissed).toEqual(["projects.members_edit"]))
  })

  it("is gone once its link is followed", async () => {
    notices = [{ key: "projects.members_edit", data: { project_uuid: "p-1", project_name: "Website" } }]
    render(<MembersEditNotice />)
    fireEvent.click(screen.getByRole("link", { name: "Who can change tasks in Website" }))
    await waitFor(() => expect(dismissed).toEqual(["projects.members_edit"]))
  })
})
