import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"

// Archiving said "It can be restored", and nothing in the app could: no
// screen offered it (SN-BUG-9). An archived channel's Details offer Restore
// to its admins and workspace admins, and tell anyone else who can.

let channelAdmin = false
let workspaceAdmin = false
let archivedAt = "2026-10-12T10:00:00Z"
const INFO = () => ({
  data: { channel_info: { ch_uuid: "c1", ch_name: "engineering", ch_private: false, ch_post_policy: "everyone", ch_deleted_at: archivedAt, ch_is_admin: channelAdmin, ch_is_member: true, notification_type: "all" } },
  isLoading: false,
  mutate: () => {},
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url.includes("channelBasicInfo") ? INFO() : { data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera", user_is_admin: workspaceAdmin } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/ai/ChannelWeeklyReportSetting", () => ({ ChannelWeeklyReportSetting: () => null }))
vi.mock("@/components/member/channelAITeammates", () => ({ default: () => null }))
vi.mock("@/components/member/channelAIBudget", () => ({ default: () => null }))
vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => null }))
vi.mock("@/components/combobox/addMemberCombobox", () => ({ AddMemberCombobox: () => null }))
const restoreChannel = vi.fn(async (_id: string) => {})
vi.mock("@/services/channelService", async (orig) => ({
  ...(await orig<typeof import("@/services/channelService")>()),
  restoreChannel: (id: string) => restoreChannel(id),
}))

const { default: store } = await import("@/store/store")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: ChannelDetailsSheet } = await import("./channelDetailsSheet")

function sheet() {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <ChannelDetailsSheet channelId="c1" open onOpenChange={() => {}} />
      </TooltipProvider>
    </Provider>,
  )
}

afterEach(() => {
  cleanup()
  channelAdmin = false
  workspaceAdmin = false
  archivedAt = "2026-10-12T10:00:00Z"
  restoreChannel.mockClear()
})

describe("an archived channel's Details", () => {
  it("offer its admins Restore", async () => {
    channelAdmin = true
    sheet()
    const archived = screen.getByRole("region", { name: "Archived" })
    await act(async () => {
      fireEvent.click(within(archived).getByRole("button", { name: "Restore" }))
    })
    expect(restoreChannel).toHaveBeenCalledWith("c1")
  })

  it("offer a workspace admin Restore, though not the channel's admin", () => {
    workspaceAdmin = true
    sheet()
    expect(within(screen.getByRole("region", { name: "Archived" })).getByRole("button", { name: "Restore" })).toBeTruthy()
  })

  it("tell anyone else who can restore it", () => {
    sheet()
    const archived = screen.getByRole("region", { name: "Archived" })
    expect(within(archived).queryByRole("button", { name: "Restore" })).toBeNull()
    expect(archived.textContent).toContain("Its admins and workspace admins can restore it.")
  })

  it("say, before archiving, that its history stays found and who can bring it back", () => {
    archivedAt = "0001-01-01T00:00:00Z"
    channelAdmin = true
    sheet()
    expect(screen.queryByRole("region", { name: "Archived" })).toBeNull()
    const danger = screen.getByRole("region", { name: "Danger zone" })
    expect(danger.textContent).toContain("its members still find its history in search")
    expect(danger.textContent).toContain("Its admins and workspace admins can restore it.")
  })
})
