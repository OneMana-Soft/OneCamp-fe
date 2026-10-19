import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// Reading a channel's details no longer marks it read (chat A9, F-6): the
// details are read for many reasons (a link's preview, a mention, Discover),
// and each one marked the channel read for whoever asked. Opening the channel
// marks it read, once, and leaving it marks what arrived while it was open.

const { seen } = vi.hoisted(() => ({ seen: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: () => new Promise(() => {}) }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  return {
    useFetch: (url: string) => (url.startsWith("/ch/") ? { data: { channel_info: { ch_uuid: "c-launch", ch_name: "launch", ch_is_member: 1 }, msg: "ok" }, mutate: () => {} } : { data: undefined, mutate: () => {} }),
    useFetchOnlyOnce: () => me,
  }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: seen }))
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: () => null }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: () => null }))

const { default: store } = await import("@/store/store")
const { ChannelView } = await import("./ChannelView")

afterEach(() => {
  cleanup()
  seen.mockClear()
})

describe("opening a channel", () => {
  it("marks it read once on the way in, and again on the way out", () => {
    const view = render(<Provider store={store}><ChannelView channelId="c-launch" /></Provider>)
    expect(seen.mock.calls).toEqual([["c-launch"]])
    view.rerender(<Provider store={store}><ChannelView channelId="c-launch" /></Provider>)
    expect(seen).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(seen.mock.calls).toEqual([["c-launch"], ["c-launch"]])
  })

  it("marks the one opened next as read when switching", () => {
    const view = render(<Provider store={store}><ChannelView channelId="c-launch" /></Provider>)
    view.rerender(<Provider store={store}><ChannelView channelId="c-design" /></Provider>)
    expect(seen.mock.calls).toEqual([["c-launch"], ["c-launch"], ["c-design"]])
  })
})
