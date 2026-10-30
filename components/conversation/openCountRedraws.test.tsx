import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// How many were unread as a channel opened lands after the channel draws. It
// went through the conversation body and the channel's page as a prop, so its
// arrival redrew the whole view: renders per switch rose 3% with B27
// (FLUIDITY-LEAD-8's flash7). It reaches the list and the catch-up banner
// alone now (components/conversation/openCount).

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: () => new Promise(() => {}) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  return {
    useFetch: (url: string) =>
      url.startsWith("/ch/")
        ? { data: { channel_info: { ch_uuid: "c-launch", ch_name: "launch", ch_is_member: 1 }, msg: "ok" }, mutate: () => {} }
        : { data: undefined, mutate: () => {} },
    useFetchOnlyOnce: () => me,
  }
})
// The count, landed by the test when the sidebar would answer.
const { count } = vi.hoisted(() => ({ count: {} as { land: (n: number) => void } }))
vi.mock("@/hooks/useUnreadOnOpen", async () => {
  const { useState } = await import("react")
  return {
    useUnreadOnOpen: () => {
      const [n, setN] = useState<number>()
      count.land = setN
      return n
    },
  }
})
// The channel's page counts its draws; the list in it shows the count it reads.
const { draws } = vi.hoisted(() => ({ draws: { page: 0 } }))
vi.mock("@/components/channel/chanelIdDesktop", async () => {
  const { useOpenCount } = await import("@/components/conversation/openCount")
  const List = () => <p>{`unread on opening: ${useOpenCount() ?? "not yet"}`}</p>
  return {
    ChannelIdDesktop: () => {
      draws.page++
      return <List />
    },
  }
})
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: () => null }))

const { default: store } = await import("@/store/store")
const { ChannelConversation } = await import("@/components/conversation/ChannelConversation")

afterEach(cleanup)

describe("the count a channel opened with", () => {
  it("reaches the list when it lands, without redrawing the channel's page", () => {
    render(<Provider store={store}><ChannelConversation channelId="c-launch" /></Provider>)
    expect(screen.getByText("unread on opening: not yet")).toBeTruthy()
    const before = draws.page
    act(() => count.land(12))
    expect(screen.getByText("unread on opening: 12")).toBeTruthy()
    expect(draws.page).toBe(before)
  })
})
