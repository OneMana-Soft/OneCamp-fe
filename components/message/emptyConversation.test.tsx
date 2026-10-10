import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A conversation with no messages yet, in a channel, a group and a DM, opened
// normally and from a link to one message. Each list seeds the store from the
// server's answer only when there is something in it: an empty answer stored
// a fresh [] on every render, which re-ran the effect that stored it, and the
// page hit React's update limit instead of rendering. The lists run as the
// app runs them, with the store and its reducers; the requests and the rows
// are stand-ins.

const answers = new Map<string, unknown>()
vi.mock("@/hooks/useFetch", () => {
  // The same answer on every render, as SWR gives.
  const answer = (url: string) => {
    if (!answers.has(url)) {
      answers.set(
        url,
        url === ""
          ? { data: undefined, isLoading: false, mutate: () => {} }
          : { data: { data: { chats: [], posts: [], has_more: false, dm_participants: [] } }, isLoading: false, mutate: () => {}, lastRequestStartedAt: 0 },
      )
    }
    return answers.get(url)
  }
  return { useFetch: answer, useFetchOnlyOnce: answer }
})
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ TypingIndicatorBar: () => null }))
vi.mock("@/components/chat/chatMessages", () => ({
  ChatMessages: ({ chats }: { chats: unknown[] }) => <p>{`${chats.length} messages`}</p>,
}))
vi.mock("@/components/groupChat/groupChatMessages", () => ({
  GroupChatMessages: ({ chats }: { chats: unknown[] }) => <p>{`${chats.length} messages`}</p>,
}))
vi.mock("@/components/channel/channelMessages", () => ({
  ChannelMessages: ({ posts }: { posts: unknown[] }) => <p>{`${posts.length} messages`}</p>,
}))

const { default: store } = await import("@/store/store")
const { ChatMessageList } = await import("@/components/chat/chatMessageList")
const { GroupChatMessageList } = await import("@/components/groupChat/groupChatMessageList")
const { ChannelMessageList } = await import("@/components/channel/channelMessageList")

afterEach(() => {
  cleanup()
  answers.clear()
})

describe("an empty conversation", () => {
  it.each([
    ["a DM", () => <ChatMessageList chatId="dm-empty" />, () => store.getState().chat.chatMessages["dm-empty"]],
    ["a DM, from a link to a message", () => <ChatMessageList chatId="dm-linked" messageId="m1" />, () => store.getState().chat.chatMessages["dm-linked"]],
    ["a group", () => <GroupChatMessageList grpId="grp-empty" />, () => store.getState().groupChat.chatMessages["grp-empty"]],
    ["a group, from a link to a message", () => <GroupChatMessageList grpId="grp-linked" messageId="m1" />, () => store.getState().groupChat.chatMessages["grp-linked"]],
    ["a channel", () => <ChannelMessageList channelId="ch-empty" />, () => store.getState().channel.channelPosts["ch-empty"]],
    ["a channel, from a link to a post", () => <ChannelMessageList channelId="ch-linked" postId="p1" />, () => store.getState().channel.channelPosts["ch-linked"]],
  ])("renders in %s, and stores nothing for it", (_, list, stored) => {
    render(<Provider store={store}>{list()}</Provider>)
    expect(screen.getByText("0 messages")).toBeTruthy()
    expect(stored()).toBeUndefined()
  })
})
