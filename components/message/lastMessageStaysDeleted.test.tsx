import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A conversation's only message deleted, in a DM, a group and a channel. The
// list seeded itself from the latest page whenever it was empty, and the page
// it came in still had the message: deleting it put it straight back, for
// whoever deleted it and for everyone it was deleted for live, until a reload.
// A list the store holds, even emptied by deletes, takes only answers it
// hasn't had (lib/utils/recentlyLoaded holdLoaded); one let go (leaving a
// link) is seeded from its latest page again. The lists run as the app runs
// them, with the store and its reducers; the requests and the rows are
// stand-ins.

const only = { chat_uuid: "m1", post_uuid: "m1", chat_created_at: "2026-10-01T10:00:00Z", post_created_at: "2026-10-01T10:00:00Z" }
const answers = new Map<string, unknown>()
vi.mock("@/hooks/useFetch", () => {
  // The same answer on every render, as SWR gives: the latest page holds one message.
  const answer = (url: string) => {
    if (!answers.has(url)) {
      answers.set(
        url,
        url === ""
          ? { data: undefined, isLoading: false, mutate: () => {} }
          : { data: { data: { chats: [only], posts: [only], has_more: false, dm_participants: [] } }, isLoading: false, mutate: () => {}, lastRequestStartedAt: 0 },
      )
    }
    return answers.get(url)
  }
  return { useFetch: answer, useFetchOnlyOnce: answer }
})
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ TypingIndicatorBar: () => null, ChannelTypingBar: () => null, ChatTypingBar: () => null, GroupChatTypingBar: () => null }))
vi.mock("@/components/conversation/ConversationRows", () => ({ ConversationRows: ({ rows }: { rows: unknown[] }) => <p>{`${rows.length} messages`}</p> }))

const { default: store } = await import("@/store/store")
const { ChannelList, DmList, GroupList } = await import("@/lib/testing/conversationLists")
const { removeChatByChatId, updateChats } = await import("@/store/slice/chatSlice")
const { removeGroupChatByChatId, updateGroupChats } = await import("@/store/slice/groupChatSlice")
const { removePostByPostId, updateChannelPosts } = await import("@/store/slice/channelSlice")

afterEach(() => {
  cleanup()
  answers.clear()
})

const kinds = [
  {
    name: "a DM",
    list: (id: string) => <DmList other={id} />,
    held: (id: string) => store.getState().chat.chatMessages[id],
    remove: (id: string) => removeChatByChatId({ chatId: id, messageId: "m1" }),
    letGo: (id: string) => updateChats({ chatId: id, chats: [] }),
  },
  {
    name: "a group",
    list: (id: string) => <GroupList grpId={id} />,
    held: (id: string) => store.getState().groupChat.chatMessages[id],
    remove: (id: string) => removeGroupChatByChatId({ grpId: id, messageId: "m1" }),
    letGo: (id: string) => updateGroupChats({ grpId: id, chats: [] }),
  },
  {
    name: "a channel",
    list: (id: string) => <ChannelList channelId={id} />,
    held: (id: string) => store.getState().channel.channelPosts[id],
    remove: (id: string) => removePostByPostId({ channelId: id, postId: "m1" }),
    letGo: (id: string) => updateChannelPosts({ channelId: id, posts: [] }),
  },
]

describe("a conversation's only message, deleted", () => {
  it.each(kinds)("stays deleted in $name", ({ name, list, held, remove }) => {
    const id = `${name}-deleted`
    render(<Provider store={store}>{list(id)}</Provider>)
    expect(screen.getByText("1 messages")).toBeTruthy()
    act(() => void store.dispatch(remove(id)))
    expect(screen.getByText("0 messages")).toBeTruthy()
    expect(held(id)).toEqual([])
  })

  it.each(kinds)("comes back from the latest page when $name's list is let go, as leaving a link does", ({ name, list, held, letGo }) => {
    const id = `${name}-let-go`
    render(<Provider store={store}>{list(id)}</Provider>)
    act(() => void store.dispatch(letGo(id)))
    expect(screen.getByText("1 messages")).toBeTruthy()
    expect(held(id)).toHaveLength(1)
  })
})
