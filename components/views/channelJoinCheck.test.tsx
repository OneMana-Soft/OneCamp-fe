import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// FE-F-14: opening a channel you aren't in (from Discover or search) added it
// to your sidebar until the next sidebar answer took it out. Only a channel
// you're in goes into the sidebar.

let info: Record<string, unknown> = {}
// How many were unread is known at once: hooks/useUnreadOnOpen has its own test.
vi.mock("@/hooks/useUnreadOnOpen", () => ({ useUnreadOnOpen: () => 0 }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: () => new Promise(() => {}) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  return {
    useFetch: (url: string) => (url.startsWith("/ch/") ? { data: { channel_info: info, msg: "ok" }, mutate: () => {} } : { data: undefined, mutate: () => {} }),
    useFetchOnlyOnce: () => me,
  }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: () => null }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: () => null }))

const { default: store } = await import("@/store/store")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { ChannelConversation: ChannelView } = await import("@/components/conversation/ChannelConversation")

afterEach(cleanup)

const inSidebar = (id: string) => store.getState().users.userSidebar.userChannels.some((c) => c.ch_uuid === id)

describe("opening a channel", () => {
  it("leaves the sidebar alone when you aren't in it", () => {
    expect(GetEndpointUrl.ChannelBasicInfo.startsWith("/ch/")).toBe(true)
    info = { ch_uuid: "c-browse", ch_name: "design-crit", ch_private: false }
    render(<Provider store={store}><ChannelView channelId="c-browse" /></Provider>)
    expect(inSidebar("c-browse")).toBe(false)
  })

  it("puts a channel you're in into the sidebar", () => {
    info = { ch_uuid: "c-member", ch_name: "launch", ch_private: false, ch_is_member: 1 }
    render(<Provider store={store}><ChannelView channelId="c-member" /></Provider>)
    expect(inSidebar("c-member")).toBe(true)
  })
})
