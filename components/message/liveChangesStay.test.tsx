import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// Live edits, reactions and reply counts snapped back. Every change to a
// conversation re-ran the list's seeding effect, which merged the latest page
// cached when the conversation opened, server first: an edit went back to its
// old words, a reaction count to its old number, and a first reaction (a key
// the cached page didn't have) never settled, looping the list. Each answer is
// merged once now, and a change made live after an answer was asked for stays.

const ASKED_AT = Date.parse("2026-10-13T09:00:00Z")
const answers: Record<string, unknown> = {}
const idle = { data: undefined, isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: undefined }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url && answers[url] ? answers[url] : idle),
  useFetchOnlyOnce: (url: string) => (url && answers[url] ? answers[url] : idle),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ ChannelTypingBar: () => null, ChatTypingBar: () => null, GroupChatTypingBar: () => null }))
vi.mock("@/components/channel/channelMessages", () => ({ ChannelMessages: () => null }))
vi.mock("@/components/chat/chatMessages", () => ({ ChatMessages: () => null }))

const { default: store } = await import("@/store/store")
const { ChannelMessageList } = await import("@/components/channel/channelMessageList")
const { ChatMessageList } = await import("@/components/chat/chatMessageList")
const { updatePostByPostId, createPostReactionPostId } = await import("@/store/slice/channelSlice")
const { updateChatByChatId } = await import("@/store/slice/chatSlice")
const { GetEndpointUrl } = await import("@/services/endPoints")

afterEach(cleanup)

function cachedPage(url: string, data: unknown) {
  answers[url] = { data, isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: ASKED_AT }
}

const post = (id: string, text: string) => ({
  post_uuid: id, post_text: text, post_created_at: "2026-10-13T08:59:00Z", post_comment_count: 0,
  post_by: { user_uuid: "maya", user_name: "Maya" },
})

describe("a live change in a channel", () => {
  it("survives the next render: an edit isn't put back to the cached words", () => {
    cachedPage(`${GetEndpointUrl.GetChannelLatestPost}/ch-edit`, { data: { posts: [post("p1", "<p>v1</p>")], has_more: false } })
    render(<Provider store={store}><ChannelMessageList channelId="ch-edit" /></Provider>)
    expect(store.getState().channel.channelPosts["ch-edit"]?.[0]?.post_text).toBe("<p>v1</p>")

    act(() => void store.dispatch(updatePostByPostId({ channelId: "ch-edit", postId: "p1", htmlText: "<p>v2</p>" })))
    expect(store.getState().channel.channelPosts["ch-edit"][0].post_text).toBe("<p>v2</p>")
  })

  it("settles: a first reaction, which the cached page has no key for, doesn't loop the list", () => {
    cachedPage(`${GetEndpointUrl.GetChannelLatestPost}/ch-react`, { data: { posts: [post("p2", "<p>hi</p>")], has_more: false } })
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<Provider store={store}><ChannelMessageList channelId="ch-react" /></Provider>)
    let changes = 0
    const stop = store.subscribe(() => changes++)
    act(() => void store.dispatch(createPostReactionPostId({
      channelId: "ch-react", postId: "p2", emojiId: "thumbsup", reactionId: "r1",
      addedBy: { user_uuid: "jonas", user_name: "Jonas" },
    } as never)))
    stop()
    expect(store.getState().channel.channelPosts["ch-react"][0].post_reactions).toHaveLength(1)
    expect(changes).toBeLessThan(5)
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/Maximum update depth/)
    errors.mockRestore()
  })
})

describe("a live change in a DM", () => {
  it("survives the next render", () => {
    cachedPage(`${GetEndpointUrl.GetChatLatestMessage}/jonas`, {
      data: { chats: [{ chat_uuid: "c1", chat_body_text: "<p>v1</p>", chat_created_at: "2026-10-13T08:59:00Z", chat_comment_count: 0, chat_from: { user_uuid: "jonas" } }], has_more: false },
    })
    render(<Provider store={store}><ChatMessageList chatId="jonas" /></Provider>)
    act(() => void store.dispatch(updateChatByChatId({ chatId: "jonas", messageId: "c1", htmlText: "<p>v2</p>" } as never)))
    expect(store.getState().chat.chatMessages["jonas"][0].chat_body_text).toBe("<p>v2</p>")
  })
})
