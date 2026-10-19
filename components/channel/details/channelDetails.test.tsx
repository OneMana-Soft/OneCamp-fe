import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"

// A channel's details are one sheet on a computer (design v3 chat, C49): About,
// Members, Notifications, Settings for admins and the danger zone, where Edit
// channel, Channel members and the phone-only info sheet were three surfaces,
// and Leave existed only on a phone. Destructive actions ask in place (C54).

let admin = false
// The members list still on its way.
let membersLoading = false
// Who made the channel, and whether Maya is one of its admins.
let creator = "maya"
let mayaAdmin = true
// Whether the person looking is a workspace admin, not only the channel's.
let workspaceAdmin = false
const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn(async (_req: unknown) => ({})) }))
const INFO = () => ({
  data: { channel_info: { ch_uuid: "c1", ch_name: "engineering", ch_member_count: 3, ch_about: "Ship the Q4 launch", ch_private: true, ch_post_policy: "everyone", ch_deleted_at: "0001-01-01T00:00:00Z", ch_is_admin: admin, ch_is_member: true, notification_type: "all", ch_created_at: "2026-09-01T10:00:00Z", ch_created_by: { user_uuid: creator, user_name: creator === "me" ? "Sam Rivera" : "Maya Chen" } } },
  isLoading: false,
  mutate: () => {},
})
const MEMBERS = () => ({
  data: membersLoading ? undefined : { channel_info: { ch_is_admin: admin, ch_is_member: true, ch_private: true, ch_created_by: { user_uuid: creator }, ch_members: [
    { user_uuid: "maya", user_name: "Maya Chen", user_is_admin: mayaAdmin },
    { user_uuid: "me", user_name: "Sam Rivera", user_is_admin: admin },
    { user_uuid: "jonas", user_name: "Jonas Weber", user_is_admin: false },
  ] } },
  isLoading: membersLoading,
  mutate: () => {},
})
const { toasted } = vi.hoisted(() => ({ toasted: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toasted }), toast: toasted }))
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
  membersLoading = false
  creator = "maya"
  mayaAdmin = true
  makeRequest.mockReset()
  makeRequest.mockImplementation(async () => ({}))
  toasted.mockClear()
})

/** The options of the request that went with these words. */
const requestFor = (failureTitle: string) =>
  makeRequest.mock.calls.map((c) => c[0] as { failureTitle?: string; showErrorToast?: boolean; payload?: Record<string, unknown> }).find((r) => r.failureTitle === failureTitle)

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

  // "Members · 0" sat over the loading rows for a second (QA F-19).
  it("never counts the members as 0 while their list loads", () => {
    membersLoading = true
    sheet()
    expect(section("Members · 3")).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Members · 0" })).toBeNull()
  })

  // A refusal closed the editor and lost what was typed (QA F-20).
  it("keeps a description that didn't save in its open editor", async () => {
    admin = true
    makeRequest.mockImplementation(async () => {
      throw new Error("Request failed with status code 500")
    })
    sheet()
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }))
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Plan the Q1 launch" } })
    fireEvent.click(within(section("About")).getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(requestFor("Couldn't save the description")).toBeTruthy())
    expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Plan the Q1 launch")
  })

  // Review, 15 Oct 2026: typing a description in Japanese, the Enter that
  // picks the word saved half a sentence and closed the editor, and the
  // Escape that drops the word closed it on what was typed (lib/keys/ime.ts).
  it("leaves an input method's Enter and Escape to it in the description", async () => {
    admin = true
    sheet()
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }))
    const box = screen.getByLabelText("Description")
    fireEvent.change(box, { target: { value: "四半期の" } })
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    expect(requestFor("Couldn't save the description")).toBeUndefined()
    expect(screen.getByLabelText("Description")).toBe(box)
    fireEvent.keyDown(box, { key: "Enter" })
    await vi.waitFor(() => expect(requestFor("Couldn't save the description")?.payload).toEqual(expect.objectContaining({ channel_about: "四半期の" })))
  })

  // Every setting said "Couldn't update channel", or "Something went wrong" (QA F-35).
  it("says what didn't happen in each setting's own words", async () => {
    admin = true
    sheet()
    fireEvent.click(within(section("Settings")).getByRole("switch", { name: "Announcement channel" }))
    fireEvent.click(screen.getByRole("radio", { name: "Nothing" }))
    await vi.waitFor(() => expect(makeRequest).toHaveBeenCalledTimes(2))
    expect(requestFor("Couldn't change who can post in #engineering")?.showErrorToast).toBe(true)
    expect(requestFor("Couldn't change your notifications for #engineering")?.showErrorToast).toBe(true)
    expect(toasted).toHaveBeenCalledWith(expect.objectContaining({ title: "Only admins post in #engineering now" }))
  })

  // Archiving said "Channel updated" (QA F-36).
  it("says a channel was archived, with Restore", async () => {
    admin = true
    sheet()
    fireEvent.click(screen.getByRole("button", { name: "Archive channel" }))
    fireEvent.click(within(screen.getByRole("group", { name: "Archive #engineering?" })).getByRole("button", { name: "Archive" }))
    await vi.waitFor(() => expect(toasted).toHaveBeenCalledWith(expect.objectContaining({ title: "#engineering archived" })))
    const said = toasted.mock.calls.find((c) => c[0].title === "#engineering archived")![0]
    render(said.action)
    expect(screen.getByText("Restore")).toBeTruthy()
    expect(requestFor("Couldn't archive #engineering")?.payload?.channel_archived).toBe(true)
  })

  // The Owner chip stopped 40px short of the others' "…" (QA F-37).
  it("puts a role at the right edge of a row with no menu", () => {
    admin = true
    sheet()
    const owner = document.querySelectorAll("[data-member-row]")[0]
    expect(owner.lastElementChild?.textContent).toBe("Owner")
  })

  // The creator was held in for good: "You made this channel, so you stay in it" (QA F-46).
  it("lets the creator leave once someone else is an admin, and says how otherwise", () => {
    creator = "me"
    admin = true
    mayaAdmin = false
    sheet()
    const danger = section("Danger zone")
    expect((within(danger).getByRole("button", { name: "Leave channel" }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(danger).getByText("You made this channel. Make someone else an admin to leave it.")).toBeTruthy()
    cleanup()

    mayaAdmin = true
    sheet()
    const leave = within(section("Danger zone")).getByRole("button", { name: "Leave channel" }) as HTMLButtonElement
    expect(leave.disabled).toBe(false)
    fireEvent.click(leave)
    expect(screen.getByRole("group", { name: "Leave #engineering?" })).toBeTruthy()
  })

  it("opens through one UI key the header can dispatch", () => {
    expect(openChannelDetails("c1")).toEqual({ type: "ui/openUI", payload: { key: "channelDetails", data: { channelUUID: "c1" } } })
  })
})

// One press, one thing (rule 7; lib/keys/escapeOwn): Esc in the description
// being written cancels the edit and leaves the details open; the next press
// closes them. Radix hears Esc first, in the document, so the field's own
// handler came too late: one press cancelled the edit and closed the sheet.
describe("Esc in the details", () => {
  it("cancels the description being written, and closes the details on the next press", () => {
    admin = true
    const onOpenChange = vi.fn()
    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChannelDetailsSheet channelId="c1" open onOpenChange={onOpenChange} />
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }))
    fireEvent.keyDown(screen.getByLabelText("Description"), { key: "Escape" })
    expect(screen.queryByLabelText("Description")).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe("Esc in a new name", () => {
  it("cancels the name being typed, and closes the details on the next press", () => {
    admin = true
    const onOpenChange = vi.fn()
    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChannelDetailsSheet channelId="c1" open onOpenChange={onOpenChange} />
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Rename channel" }))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "Escape" })
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
