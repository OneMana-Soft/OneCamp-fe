import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

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
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: [] }, mutate: async () => undefined }) }))
vi.mock("@/services/invitationService", () => ({ invite: vi.fn() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))

const { AdminAdminList } = await import("./AdminAdminList")
const { AdminInvitationList } = await import("./AdminInvitationList")
const { AddAdminDialog } = await import("./AddAdminDialog")
const { AddInvitationDialog } = await import("./AddInvitationDialog")

afterEach(cleanup)

const ZERO = "0001-01-01T00:00:00Z"

describe("the people group's hue", () => {
  it("puts an empty admin list's icon on a sky tile", () => {
    render(<AdminAdminList admins={[]} onRemoveAdmin={vi.fn()} isSubmitting={false} onLoadMore={vi.fn()} hasMore={false} isLoading={false} isFiltered />)
    expect(document.querySelector(".hue-sky [data-empty-icon]")).toBeTruthy()
  })

  it("draws an admin's avatar without an orange shield", () => {
    render(
      <AdminAdminList
        admins={[{ user_uuid: "u1", user_name: "Priya Raman", user_email_id: "priya@kestrel.studio", user_profile_object_key: "", user_deleted_at: ZERO }]}
        onRemoveAdmin={vi.fn()}
        isSubmitting={false}
        onLoadMore={vi.fn()}
        hasMore={false}
        isLoading={false}
      />,
    )
    expect(document.querySelector("li .bg-primary")).toBeNull()
  })

  it("puts an empty invitation list's icon on a sky tile", () => {
    render(<AdminInvitationList invitations={[]} onDelete={vi.fn()} onResend={vi.fn()} onCopyLink={vi.fn()} isSubmitting={false} resendingEmail={null} />)
    expect(document.querySelector(".hue-sky [data-empty-icon]")).toBeTruthy()
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
})
