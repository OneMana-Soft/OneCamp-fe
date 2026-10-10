import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// Typing writes the draft to the store, throttled to one write every 300 ms.
// The views around a conversation (ChannelView, ChatView, GroupChatView)
// subscribed to the whole draft, so each write re-drew the page under them:
// header, list and composer, about 450 component renders a write in a
// channel. They read the draft when sending now, and only the composer
// (which draws it) follows it.

vi.mock("@/lib/axiosInstance", () => ({ default: { post: () => new Promise(() => {}) }, OWN_ERRORS: {} }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  const none = { data: undefined, mutate: () => {} }
  return { useFetch: () => none, useFetchOnlyOnce: () => me }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/services/unreadCache", () => ({ clearChatUnread: vi.fn() }))

let pageDraws = 0
const Page = () => {
  pageDraws++
  return null
}
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: Page }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: Page }))
vi.mock("@/components/chat/chatIdDesktop", () => ({ ChatIdDesktop: Page }))
vi.mock("@/components/chat/chatIdMobile", () => ({ ChatIdMobile: Page }))
vi.mock("@/components/groupChat/chatGrpIdDesktop", () => ({ ChatGrpIdDesktop: Page }))
vi.mock("@/components/groupChat/grpChatIdMobile", () => ({ GrpChatIdMobile: Page }))

const { default: store } = await import("@/store/store")
const { updateChannelInputText } = await import("@/store/slice/channelSlice")
const { createOrUpdateChatBody } = await import("@/store/slice/chatSlice")
const { createOrUpdateGroupChatBody } = await import("@/store/slice/groupChatSlice")
const { ChannelView } = await import("./ChannelView")
const { ChatView } = await import("./ChatView")
const { GroupChatView } = await import("./GroupChatView")

afterEach(() => {
  cleanup()
  pageDraws = 0
})

const html = (n: number) => `<p>${"a".repeat(n)}</p>`

describe.each([
  ["a channel", () => <ChannelView channelId="c1" />, (n: number) => updateChannelInputText({ channelId: "c1", inputTextHTML: html(n) })],
  ["a DM", () => <ChatView chatId="maya" />, (n: number) => createOrUpdateChatBody({ chatUUID: "maya", body: html(n) })],
  ["a group", () => <GroupChatView grpId="g1" />, (n: number) => createOrUpdateGroupChatBody({ grpID: "g1", body: html(n) })],
] as const)("typing in %s", (_, view, typed) => {
  it("does not re-draw the page around the message box", () => {
    render(<Provider store={store}>{view()}</Provider>)
    const drawn = pageDraws
    expect(drawn).toBeGreaterThan(0)
    for (let n = 1; n <= 5; n++) act(() => void store.dispatch(typed(n)))
    expect(pageDraws).toBe(drawn)
  })
})
