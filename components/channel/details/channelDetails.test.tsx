import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"

// A channel's details are one sheet on a computer (design v3 chat, C49): About,
// Members, Notifications, Settings for admins and the danger zone, where Edit
// channel, Channel members and the phone-only info sheet were three surfaces,
// and Leave existed only on a phone. Destructive actions ask in place (C54).

let admin = false
// Whether the person looking is a workspace admin, not only the channel's.
let workspaceAdmin = false
const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn(async (_req: unknown) => ({})) }))
const INFO = () => ({
  data: { channel_info: { ch_uuid: "c1", ch_name: "engineering", ch_about: "Ship the Q4 launch", ch_private: true, ch_post_policy: "everyone", ch_deleted_at: "0001-01-01T00:00:00Z", ch_is_admin: admin, ch_is_member: true, notification_type: "all", ch_created_at: "2026-09-01T10:00:00Z", ch_created_by: { user_uuid: "maya", user_name: "Maya Chen" } } },
  isLoading: false,
  mutate: () => {},
})
const MEMBERS = () => ({
  data: { channel_info: { ch_is_admin: admin, ch_is_member: true, ch_private: true, ch_created_by: { user_uuid: "maya" }, ch_members: [
    { user_uuid: "maya", user_name: "Maya Chen", user_is_admin: true },
    { user_uuid: "me", user_name: "Sam Rivera", user_is_admin: admin },
    { user_uuid: "jonas", user_name: "Jonas Weber", user_is_admin: false },
  ] } },
  isLoading: false,
  mutate: () => {},
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url.includes("channelInfoWithMemberAdminFlag") ? MEMBERS() : url.includes("channelBasicInfo") ? INFO() : { data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera", user_is_admin: workspaceAdmin } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/ai/ChannelWeeklyReportSetting", () => ({ ChannelWeeklyReportSetting: () => null }))
vi.mock("@/components/member/channelAITeammates", () => ({ default: () => null }))
vi.mock("@/components/member/channelAIBudget", () => ({ default: () => null }))
vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => <p>Guest link</p> }))
vi.mock("@/components/combobox/addChannelMemberCombobox", () => ({ default: () => <p>Add member picker</p> }))

const { default: store } = await import("@/store/store")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: ChannelDetailsSheet } = await import("./channelDetailsSheet")
const { openChannelDetails } = await import("./openChannelDetails")

function sheet() {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <ChannelDetailsSheet channelId="c1" open onOpenChange={() => {}} />
      </TooltipProvider>
    </Provider>,
  )
}
const section = (name: string) => screen.getByRole("region", { name })

afterEach(() => {
  cleanup()
  admin = false
  workspaceAdmin = false
  makeRequest.mockClear()
})

describe("the channel's Details sheet", () => {
  it("is one sheet with About, Members and Notifications, on the sheet surface at e4", () => {
    sheet()
    const dialog = screen.getByRole("dialog", { name: "engineering" })
    expect(dialog.className).toContain("bg-sheet")
    expect(dialog.className).toContain("shadow-e4")
    expect(dialog.className).toContain("sm:w-[440px]")
    expect(dialog.className).toContain("animate-panel-in")
    expect(within(section("About")).getByText("Ship the Q4 launch")).toBeTruthy()
    expect(within(section("About")).getByText(/Maya Chen on/)).toBeTruthy()
    expect(within(section("Members · 3")).getAllByText(/Maya Chen|Sam Rivera|Jonas Weber/)).toHaveLength(3)
    expect(screen.getByRole("radiogroup", { name: "Notify me about" })).toBeTruthy()
    for (const card of document.querySelectorAll("[data-details-card]")) expect(card.className).toMatch(/rounded-xl.*shadow-e1/)
  })

  it("draws each member as a 48px row with a role chip and no crown", () => {
    sheet()
    const rows = document.querySelectorAll("[data-member-row]")
    expect(rows).toHaveLength(3)
    expect(rows[0].className).toContain("min-h-12")
    expect(within(rows[0] as HTMLElement).getByText("Owner").className).toContain("chip")
    expect(document.body.innerHTML).not.toContain("lucide-crown")
  })

  it("offers Leave on a computer, and asks in place, warning about a private channel", () => {
    sheet()
    const danger = section("Danger zone")
    fireEvent.click(within(danger).getByRole("button", { name: "Leave channel" }))
    const ask = within(danger).getByRole("group", { name: "Leave #engineering?" })
    expect(ask.textContent).toContain("You'll need an invite to come back.")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("shows Settings, Archive and member actions only to admins", () => {
    sheet()
    expect(screen.queryByRole("region", { name: "Settings" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Archive channel" })).toBeNull()
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit description" })).toBeNull()
    cleanup()
    admin = true
    workspaceAdmin = true
    sheet()
    const settings = section("Settings")
    for (const name of ["Private channel", "Announcement channel"]) expect(within(settings).getByLabelText(name).getAttribute("role")).toBe("switch")
    expect(screen.getByRole("button", { name: "More for Jonas Weber" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "More for Maya Chen" }), "the creator keeps their role").toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Archive channel" }))
    expect(screen.getByRole("group", { name: "Archive #engineering?" })).toBeTruthy()
  })

  // One switch by any moderator made a private channel public, its whole
  // history and files with it, asking nobody (SN-BUG-5).
  it("lets only a workspace admin make a private channel public, and asks first", async () => {
    admin = true
    sheet()
    const settings = section("Settings")
    expect(within(settings).queryByRole("switch", { name: "Private channel" }), "a moderator who isn't a workspace admin").toBeNull()
    expect(within(settings).getByText(/Only a workspace admin can make it public/)).toBeTruthy()
    cleanup()

    workspaceAdmin = true
    sheet()
    fireEvent.click(within(section("Settings")).getByRole("switch", { name: "Private channel" }))
    const ask = screen.getByRole("group", { name: "Make #engineering public?" })
    expect(within(ask).getByText(/read its whole history, files included/)).toBeTruthy()
    expect(makeRequest, "nothing is saved before the answer").not.toHaveBeenCalled()
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }))
    expect(makeRequest).not.toHaveBeenCalled()
    expect(within(section("Settings")).getByRole("switch", { name: "Private channel" }).getAttribute("aria-checked")).toBe("true")

    fireEvent.click(within(section("Settings")).getByRole("switch", { name: "Private channel" }))
    fireEvent.click(within(screen.getByRole("group", { name: "Make #engineering public?" })).getByRole("button", { name: "Make public" }))
    await vi.waitFor(() => expect(makeRequest).toHaveBeenCalledTimes(1))
    expect((makeRequest.mock.calls[0][0] as { payload: { channel_private: boolean } }).payload.channel_private).toBe(false)
  })

  it("opens through one UI key the header can dispatch", () => {
    expect(openChannelDetails("c1")).toEqual({ type: "ui/openUI", payload: { key: "channelDetails", data: { channelUUID: "c1" } } })
  })
})
