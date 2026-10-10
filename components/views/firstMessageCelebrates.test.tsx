import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"

// The sender's first message in a channel or DM bursts camp-hued sparks from
// Send (lib/celebrate, the playful layer's "a first message"). Only when it is
// certain from what the client holds: none of theirs among the messages, and
// the latest page from the server is all there is. Never on routine sends.

const send = vi.fn(() => new Promise(() => {}))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: () => send() }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  const maya = { data: { data: { user_uuid: "maya", user_name: "Maya Chen" } } }
  const none = { data: undefined, mutate: () => {} }
  return { useFetch: () => none, useFetchOnlyOnce: (url: string) => (url === "/user/profile" ? me : maya) }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/services/unreadCache", () => ({ clearChatUnread: vi.fn() }))
const sparks = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrate: (el: Element) => sparks(el), springPop: () => null }))

// The view's own composer would need a live editor; this one calls Send as the
// real one does, from a button named Send, and celebrates as it does.
type ComposerProps = { handleSend: () => boolean | void }
const Composer = ({ handleSend }: ComposerProps) => (
  <button
    aria-label="Send"
    onClick={(e) => {
      if (handleSend()) sparks(e.currentTarget)
    }}
  >
    Send
  </button>
)
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdDesktop", () => ({ ChatIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdMobile", () => ({ ChatIdMobile: (p: ComposerProps) => <Composer {...p} /> }))

const { default: store } = await import("@/store/store")
const { updateChannelInputText, updateChannelPosts } = await import("@/store/slice/channelSlice")
const { createOrUpdateChatBody } = await import("@/store/slice/chatSlice")
const { ChannelView } = await import("./ChannelView")
const { ChatView } = await import("./ChatView")

function withLatest(key: string, page: { has_more: boolean }) {
  const cache = new Map<string, unknown>([[key, { data: { data: { ...page, posts: [], chats: [] }, msg: "ok" } }]])
  return ({ children }: { children: React.ReactNode }) => <SWRConfig value={{ provider: () => cache as never }}>{children}</SWRConfig>
}

beforeEach(() => {
  sparks.mockReset()
  localStorage.clear()
})
afterEach(cleanup)

describe("sending in a channel", () => {
  it("celebrates the sender's first message there, once", () => {
    const Wrap = withLatest("/po/latestPosts/c-first", { has_more: false })
    render(<Provider store={store}><Wrap><ChannelView channelId="c-first" /></Wrap></Provider>)
    act(() => void store.dispatch(updateChannelInputText({ channelId: "c-first", inputTextHTML: "<p>Hello all</p>" })))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sparks).toHaveBeenCalledTimes(1)
    expect(sparks.mock.calls[0][0]).toBe(screen.getByRole("button", { name: "Send" }))
    act(() => void store.dispatch(updateChannelInputText({ channelId: "c-first", inputTextHTML: "<p>And again</p>" })))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sparks).toHaveBeenCalledTimes(1)
  })

  it("does not celebrate where the sender has written before", () => {
    store.dispatch(updateChannelPosts({ channelId: "c-old", posts: [{ post_uuid: "p1", post_text: "<p>hi</p>", post_by: { user_uuid: "me" } as never, post_created_at: "2026-10-09T09:00:00Z", post_comment_count: 0 }] }))
    const Wrap = withLatest("/po/latestPosts/c-old", { has_more: false })
    render(<Provider store={store}><Wrap><ChannelView channelId="c-old" /></Wrap></Provider>)
    act(() => void store.dispatch(updateChannelInputText({ channelId: "c-old", inputTextHTML: "<p>Back again</p>" })))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sparks).not.toHaveBeenCalled()
  })

  it("does not celebrate when older messages might hold one of theirs", () => {
    const Wrap = withLatest("/po/latestPosts/c-long", { has_more: true })
    render(<Provider store={store}><Wrap><ChannelView channelId="c-long" /></Wrap></Provider>)
    act(() => void store.dispatch(updateChannelInputText({ channelId: "c-long", inputTextHTML: "<p>Hi</p>" })))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sparks).not.toHaveBeenCalled()
  })
})

describe("sending in a DM", () => {
  it("celebrates the first message to someone", () => {
    const Wrap = withLatest("/dm/latestChat/maya", { has_more: false })
    render(<Provider store={store}><Wrap><ChatView chatId="maya" /></Wrap></Provider>)
    act(() => void store.dispatch(createOrUpdateChatBody({ chatUUID: "maya", body: "<p>Hi Maya</p>" })))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sparks).toHaveBeenCalledTimes(1)
  })
})
