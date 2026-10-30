import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// A workspace admin reaches a team's stewardship by making themselves one of
// its admins: one step, asked first, and recorded by the server (Work
// Access, D5).

const h = vi.hoisted(() => ({ teamAdmin: false, workspaceAdmin: true, dispatched: [] as Array<{ payload?: { key?: string; data?: { onConfirm?: () => Promise<void> | void; confirmText?: string } } }> }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) =>
    key.startsWith("/team/membersInfo")
      ? { data: { data: { team_is_admin: h.teamAdmin, team_members: [] } }, isLoading: false, mutate: vi.fn() }
      : { data: undefined, mutate: vi.fn() },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_is_admin: h.workspaceAdmin } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(() => Promise.resolve({})), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => (a: (typeof h.dispatched)[number]) => void h.dispatched.push(a), useSelector: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const posted = vi.hoisted(() => vi.fn(async () => ({ data: {} })))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: posted } }))

const { TeamMemberContent } = await import("./teamMemberContent")

afterEach(() => {
  cleanup()
  h.teamAdmin = false
  h.workspaceAdmin = true
  h.dispatched.length = 0
  posted.mockClear()
})

describe("a workspace admin and a team they don't run", () => {
  it("is offered to become one of its admins, asked first, then it's done", async () => {
    render(<TeamMemberContent teamId="t-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Make me an admin" }))
    const asked = h.dispatched.find((a) => a.payload?.key === "confirmAlert")?.payload?.data
    expect(asked?.confirmText).toBe("Make me an admin")
    expect(posted).not.toHaveBeenCalled()
    await asked?.onConfirm?.()
    await waitFor(() => expect(posted).toHaveBeenCalledWith("/admin/teams/t-1/admins/me", undefined, { suppressErrorToast: true }))
  })

  it("isn't offered to the team's own admin, or to someone who doesn't run the workspace", () => {
    h.teamAdmin = true
    const { unmount } = render(<TeamMemberContent teamId="t-1" />)
    expect(screen.queryByRole("button", { name: "Make me an admin" })).toBeNull()
    unmount()
    h.teamAdmin = false
    h.workspaceAdmin = false
    render(<TeamMemberContent teamId="t-1" />)
    expect(screen.queryByRole("button", { name: "Make me an admin" })).toBeNull()
  })
})
