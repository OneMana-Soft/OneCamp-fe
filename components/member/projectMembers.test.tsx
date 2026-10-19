import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({ members: [] as unknown[] }))
const person = (i: number) => ({ user_uuid: `u${i}`, user_name: `person${i}`, user_full_name: `Person ${i}`, user_is_admin: i === 0 })

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) =>
    key.startsWith("/project/membersInfo") || key.includes("member")
      ? { data: { data: { project_is_admin: true, project_members: h.members, project_team: { team_is_admin: false }, project_created_by: { user_uuid: "u0" } }, users: [] }, mutate: vi.fn() }
      : { data: undefined, mutate: vi.fn() },
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(() => Promise.resolve({})), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const roles = vi.hoisted(() => ({ set: [] as Array<[string, string, string]>, refuse: false }))
vi.mock("@/services/workAccessService", async (orig) => ({
  ...(await orig<typeof import("@/services/workAccessService")>()),
  setMemberRole: vi.fn(async (project: string, user: string, role: string) => {
    roles.set.push([project, user, role])
    if (roles.refuse) throw new Error("refused")
  }),
}))

const { ProjectMemberContent } = await import("./projectMemberContent")

afterEach(() => {
  cleanup()
  h.members = []
  roles.set.length = 0
  roles.refuse = false
})

// PTC-18: two fields both read "Search members…", one adding and one
// filtering, over a list of three people.
describe("a project's members", () => {
  it("has one field to add someone, which says it adds, and no find for a short list", () => {
    h.members = [0, 1, 2].map(person)
    render(<ProjectMemberContent projectId="p1" />)
    expect(screen.getByRole("combobox").textContent).toContain("Add a person…")
    expect(screen.queryByText("Search members…")).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Find a member" })).toBeNull()
  })

  it("offers a find once the list is long", () => {
    h.members = Array.from({ length: 9 }, (_, i) => person(i))
    render(<ProjectMemberContent projectId="p1" />)
    expect(screen.getByRole("textbox", { name: "Find a member" })).toBeTruthy()
  })

  // Each person's role is chosen on their row (Work Access); the creator's
  // stays Admin.
  it("changes someone's role from their row, and keeps the creator an admin", async () => {
    h.members = [0, 1].map(person)
    render(<ProjectMemberContent projectId="p1" />)
    expect(screen.getByText("Admin")).toBeTruthy()
    const trigger = screen.getByRole("button", { name: "person1's role: Member" })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Viewer/ }))
    await waitFor(() => expect(roles.set).toEqual([["p1", "u1", "viewer"]]))
  })
})
