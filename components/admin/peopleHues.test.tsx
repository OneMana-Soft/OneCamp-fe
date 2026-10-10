import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The people group's colour: the admin menu draws Members, Admins, Teams,
// Invitations and External users in sky, and their cards follow it. An empty
// list's icon sits on a sky tile, a dialog's title icon on a sky tile instead
// of the accent (which is for the one action), and an admin's avatar carries
// no orange shield: every row in that list is an admin, and faces are
// coloured now.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ data: { data: [], has_more: false } })), post: vi.fn() }, OWN_ERRORS: {} }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ email_enabled: true }) }))
// One answer object, as SWR keeps it between renders: a new object on every
// call would look like a new answer each render to a card that copies it.
const empty = vi.hoisted(() => ({ data: { data: [] as unknown[], has_more: false }, isLoading: false, mutate: async () => undefined }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => empty,
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/services/invitationService", () => ({ invite: vi.fn() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/components/member/teamMemberContent", () => ({ TeamMemberContent: () => null }))

const { AdminAdminList } = await import("./AdminAdminList")
const { default: AdminCard } = await import("./adminCard")
const { default: InvitationCard } = await import("./invitationCard")
const { AddAdminDialog } = await import("./AddAdminDialog")
const { AddInvitationDialog } = await import("./AddInvitationDialog")
const { default: AdminTeamMembersDialog } = await import("@/components/dialog/adminTeamMembersDialog")

afterEach(cleanup)

const ZERO = "0001-01-01T00:00:00Z"

describe("the people group's hue", () => {
  // The empty and no-match states are the tab's (PeopleFrame), drawn by the card.
  it("puts the icon of an admin search that matched nobody on a sky tile", () => {
    render(<AdminCard />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search admins" }), { target: { value: "zzzz" } })
    expect(document.querySelector("[data-people-state] .hue-sky [data-empty-icon]")).toBeTruthy()
  })

  it("draws an admin's avatar without an orange shield", () => {
    render(
      <AdminAdminList
        admins={[{ user_uuid: "u1", user_name: "Priya Raman", user_email_id: "priya@kestrel.example", user_profile_object_key: "", user_deleted_at: ZERO }]}
        onRemoveAdmin={vi.fn()}
        isSubmitting={false}
        onLoadMore={vi.fn()}
        hasMore={false}
        isLoading={false}
      />,
    )
    expect(document.querySelector("li .bg-primary")).toBeNull()
  })

  it("welcomes the first invitations with a sky illustration, and an action", () => {
    render(<InvitationCard />)
    const empty = document.querySelector("[data-people-state]") as HTMLElement
    expect(empty.querySelector("[data-empty-illustration] svg.hue-sky")).toBeTruthy()
    expect(within(empty).getByRole("button", { name: "Invite people" })).toBeTruthy()
  })

  it("keeps the sky icon tile when a search matches no invitation", () => {
    render(<InvitationCard />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search invitations" }), { target: { value: "zzzz" } })
    const empty = document.querySelector("[data-people-state]") as HTMLElement
    expect(empty.querySelector("[data-empty-illustration]")).toBeNull()
    expect(empty.querySelector(".hue-sky [data-empty-icon]")).toBeTruthy()
  })

  it("puts the add-admin dialog's title icon on a sky tile, not in the accent", async () => {
    await act(async () => {
      render(<AddAdminDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
    })
    const title = document.querySelector("[role='dialog'] h2")!
    expect(title.querySelector(".hue-sky svg")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  it("puts the invite dialog's title icon on a sky tile, not in the accent", () => {
    render(<AddInvitationDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
    const title = document.querySelector("[role='dialog'] h2")!
    expect(title.querySelector(".hue-sky svg")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  it("puts the team members dialog's title icon on a sky tile", () => {
    render(<AdminTeamMembersDialog isOpen onOpenChange={vi.fn()} teamId="t1" teamName="Design" />)
    const title = document.querySelector("[role='dialog'] h2")!
    expect(title.querySelector(".hue-sky svg")).toBeTruthy()
  })
})
