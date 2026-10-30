import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Opening a DM or a group asks for its latest page once (chat A1 step 2b).
// Their own lists asked twice: SWR asks as the list mounts, and each list
// asked again as it opened, a second identical request on every open (a
// channel's list stopped on 24 Sep). Real SWR; the API is a stand-in.

const chat = { chat_uuid: "m1", chat_body_text: "<p>hi</p>", chat_from: { user_uuid: "u-una", user_name: "Una" }, chat_created_at: "2026-10-22T09:00:00Z", chat_comment_count: 0 }
const api: Record<string, unknown> = {
  "/dm/latestChat/u-una": { data: { chats: [chat], has_more: false } },
  "/groupChat/latestChat/g-una": { data: { chats: [chat], has_more: false } },
  "/groupChat/getDmParticipants/g-una": { data: { dm_participants: [] } },
}
const get = vi.fn(async (url: string) => ({ data: api[url] ?? { data: {} } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => get(url) } }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ ChannelTypingBar: () => null, ChatTypingBar: () => null, GroupChatTypingBar: () => null }))
vi.mock("@/components/conversation/ConversationRows", () => ({ ConversationRows: ({ rows }: { rows: unknown[] }) => <p>{`${rows.length} messages`}</p> }))

const { default: store } = await import("@/store/store")
const { DmList, GroupList } = await import("@/lib/testing/conversationLists")

afterEach(() => {
  cleanup()
  get.mockClear()
})

describe("opening a conversation", () => {
  it.each([
    ["a DM", () => <DmList other="u-una" />, "/dm/latestChat/u-una"],
    ["a group", () => <GroupList grpId="g-una" />, "/groupChat/latestChat/g-una"],
  ])("asks for %s's latest page once", async (_, list, latest) => {
    render(
      <Provider store={store}>
        <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false }}>{list()}</SWRConfig>
      </Provider>,
    )
    await waitFor(() => expect(screen.getByText("1 messages")).toBeTruthy())
    expect(get.mock.calls.filter(([url]) => url === latest)).toHaveLength(1)
  })
})
