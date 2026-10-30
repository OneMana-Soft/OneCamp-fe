import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A conversation that isn't there, or isn't yours (QA F-08 to F-11). A
// channel showed "# channel · 0 members" with a live Huddle, "a connection
// problem" and Join this channel; a DM with nobody a blank pane on a computer
// and a message box on a phone; a group "failed to fetch group chat" on a
// computer and a message box on a phone. Now each is one state, the same on
// both, and the phone's bar offers nothing for it.

/** What each read answers in a test, by its address. */
const answers = new Map<string, { data?: unknown; isError?: unknown; isLoading?: boolean }>()
const retried = vi.fn()
const answerFor = (url: string) => ({ mutate: retried, ...(answers.get(url) ?? { data: undefined }) })

// How many were unread is known at once: hooks/useUnreadOnOpen has its own test.
vi.mock("@/hooks/useUnreadOnOpen", () => ({ useUnreadOnOpen: () => 0 }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: () => new Promise(() => {}) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
let phone = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: phone, isDesktop: !phone }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  return {
    useFetch: (url: string) => answerFor(url),
    useFetchOnlyOnce: (url: string) => (url === "/user/profile" ? me : answerFor(url)),
  }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/services/unreadCache", () => ({ clearChatUnread: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

/** The conversation's own page, which a missing conversation never draws. */
const Page = () => <p>the conversation</p>
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: Page }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: Page }))
vi.mock("@/components/chat/chatIdDesktop", () => ({ ChatIdDesktop: Page }))
vi.mock("@/components/chat/chatIdMobile", () => ({ ChatIdMobile: Page }))
vi.mock("@/components/groupChat/chatGrpIdDesktop", () => ({ ChatGrpIdDesktop: Page }))
vi.mock("@/components/groupChat/grpChatIdMobile", () => ({ GrpChatIdMobile: Page }))

const { default: store } = await import("@/store/store")
const { createGrpChatLocally } = await import("@/store/slice/groupChatSlice")
const { ChannelConversation: ChannelView } = await import("@/components/conversation/ChannelConversation")
const { ChatView } = await import("./ChatView")
const { GroupChatView } = await import("./GroupChatView")
const { PhoneConversationTitle, PhoneHuddleButton, WhileConversationThere } = await import(
  "@/components/navigationBar/mobile/phoneConversationTitle"
)

const status = (code: number) => Object.assign(new Error(`Request failed with status code ${code}`), { response: { status: code, data: {} } })

afterEach(() => {
  cleanup()
  answers.clear()
  retried.mockReset()
  phone = false
})

const draw = (view: React.ReactNode) => render(<Provider store={store}>{view}</Provider>)

describe.each([false, true])("a missing conversation (phone: %s)", (onPhone) => {
  it("is a channel that doesn't exist: one state, a way back, no page", () => {
    phone = onPhone
    answers.set("/ch/channelBasicInfo/nope", { isError: status(404) })
    draw(<ChannelView channelId="nope" />)
    expect(screen.getByRole("heading", { name: "This channel doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to channels" }).getAttribute("href")).toBe("/app/channel")
    expect(screen.queryByText("the conversation")).toBeNull()
  })

  it("is a private channel you aren't in: says so, without a page", () => {
    phone = onPhone
    answers.set("/ch/channelBasicInfo/secret", { isError: status(403) })
    draw(<ChannelView channelId="secret" />)
    expect(screen.getByRole("heading", { name: "You can't see this channel" })).toBeTruthy()
    expect(screen.getByText("It's private. Ask someone in it to add you.")).toBeTruthy()
    expect(screen.queryByText("the conversation")).toBeNull()
  })

  it("is a DM with nobody by that id", () => {
    phone = onPhone
    answers.set("/user/profile/ghost", { data: { msg: "Person not found" } })
    draw(<ChatView chatId="ghost" />)
    expect(screen.getByRole("heading", { name: "This conversation doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.getByText("We couldn't find that person. The link may be old or mistyped.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to messages" }).getAttribute("href")).toBe("/app/chat")
    expect(screen.queryByText("the conversation")).toBeNull()
  })

  it("is a group you're not in", () => {
    phone = onPhone
    answers.set("/groupChat/getDmParticipants/theirs", { isError: status(403) })
    draw(<GroupChatView grpId="theirs" />)
    expect(screen.getByRole("heading", { name: "You can't see this conversation" })).toBeTruthy()
    expect(screen.queryByText("the conversation")).toBeNull()
  })
})

describe("a conversation that couldn't be loaded", () => {
  it("says nothing is lost and offers Try again", () => {
    answers.set("/ch/channelBasicInfo/c1", { isError: status(503) })
    draw(<ChannelView channelId="c1" />)
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retried).toHaveBeenCalled()
    expect(screen.queryByText("the conversation")).toBeNull()
  })
})

describe("a conversation that is there", () => {
  it("draws its page", () => {
    answers.set("/ch/channelBasicInfo/c1", { data: { channel_info: { ch_uuid: "c1", ch_name: "engineering" } } })
    draw(<ChannelView channelId="c1" />)
    expect(screen.getByText("the conversation")).toBeTruthy()
  })

  it("draws a group made here before its first message, which the server hasn't got yet", () => {
    store.dispatch(createGrpChatLocally({ grpId: "fresh", participants: [{ user_uuid: "maya" } as never] }))
    answers.set("/groupChat/getDmParticipants/fresh", { data: { data: null } })
    draw(<GroupChatView grpId="fresh" />)
    expect(screen.getByText("the conversation")).toBeTruthy()
  })
})

describe("the phone's bar over a missing conversation", () => {
  it("has no title, no Huddle and no options", () => {
    answers.set("/ch/channelBasicInfo/nope", { isError: status(404) })
    draw(
      <>
        <PhoneConversationTitle kind="channel" id="nope" />
        <PhoneHuddleButton kind="channel" id="nope" />
        <WhileConversationThere kind="channel" id="nope">
          <button type="button">Channel options</button>
        </WhileConversationThere>
      </>,
    )
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("keeps them for a channel that is there", () => {
    answers.set("/ch/channelBasicInfo/c1", { data: { channel_info: { ch_uuid: "c1", ch_name: "engineering", ch_member_count: 4 } } })
    draw(
      <>
        <PhoneConversationTitle kind="channel" id="c1" />
        <PhoneHuddleButton kind="channel" id="c1" />
        <WhileConversationThere kind="channel" id="c1">
          <button type="button">Channel options</button>
        </WhileConversationThere>
      </>,
    )
    expect(screen.getByRole("button", { name: "engineering, details" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Start a huddle" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Channel options" })).toBeTruthy()
  })
})
