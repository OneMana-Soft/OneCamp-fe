import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import type { PostsRes } from "@/types/post"
import type { ChatInfo } from "@/types/chat"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Opening a channel with unread messages marks where they start, and the
// mark stays above the same message as new ones arrive below.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/channel/c1", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useMediaFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/components/channel/chanelMessage", () => ({
  ChannelMessage: ({ postInfo }: { postInfo: PostsRes }) => <p data-testid="row">{postInfo.post_uuid}</p>,
}))
vi.mock("@/components/chat/chatMessage", () => ({ ChatMessage: ({ chatInfo }: { chatInfo: ChatInfo }) => <p data-testid="row">{chatInfo.chat_uuid}</p> }))
vi.mock("@/components/groupChat/groupChatMessage", () => ({ GroupChatMessage: ({ chatInfo }: { chatInfo: ChatInfo }) => <p data-testid="row">{chatInfo.chat_uuid}</p> }))
vi.mock("@/components/chat/SeenReceiptLine", () => ({ SeenReceiptLine: () => null }))

const { default: store } = await import("@/store/store")
const { ChannelRows } = await import("@/components/conversation/ChannelRows")
const { dmList } = await import("@/components/conversation/DmRows")
const { groupList } = await import("@/components/conversation/GroupRows")
const { READ_MOVED_EVENT } = await import("@/components/message/useUnreadAnchor")

const post = (i: number, by = "maya"): PostsRes =>
  ({ post_uuid: `p${i}`, post_text: `<p>${i}</p>`, post_by: { user_uuid: by, user_name: by }, post_created_at: new Date(Date.UTC(2026, 9, 10, 9, i * 9)).toISOString(), post_comment_count: 0 }) as PostsRes
const still = { has: false, loading: false, ask: () => {} }
const list = { conversation: { kind: "channel", id: "c1" } as const, older: still, newer: still, toLatest: () => {} }
const rowsAfterLine = () => {
  // virtua hides rows it has not measured, and jsdom measures nothing.
  const line = document.querySelector('[role="separator"][aria-label="New messages"]')!
  expect(line).toBeTruthy()
  return [...document.querySelectorAll("[data-testid=row]")].filter((r) => line.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).map((r) => r.textContent)
}

afterEach(cleanup)

describe("the New line", () => {
  it("sits above the first unread message, and stays there as more arrive", () => {
    const five = [1, 2, 3, 4, 5].map((i) => post(i))
    const { rerender } = render(<Provider store={store}><ChannelRows {...list} rows={five} unreadOnOpen={2} /></Provider>)
    expect(rowsAfterLine()).toEqual(["p4", "p5"])
    rerender(<Provider store={store}><ChannelRows {...list} rows={[...five, post(6)]} unreadOnOpen={2} /></Provider>)
    expect(rowsAfterLine()).toEqual(["p4", "p5", "p6"])
  })

  it("is not drawn when nothing was unread", () => {
    render(<Provider store={store}><ChannelRows {...list} rows={[1, 2, 3].map((i) => post(i))} unreadOnOpen={0} /></Provider>)
    expect(document.querySelector('[role="separator"][aria-label="New messages"]')).toBeNull()
  })
})

// A Mark unread on another tab or device (read.moved) names the conversation
// by its id: a DM's is its grouping id, which its list isn't kept under.
describe("the New line, marked unread elsewhere", () => {
  const chats = [1, 2, 3, 4].map((i) => ({ chat_uuid: `m${i}`, chat_body_text: `<p>${i}</p>`, chat_from: { user_uuid: "maya", user_name: "maya" }, chat_created_at: new Date(Date.UTC(2026, 9, 10, 9, i * 9)).toISOString(), chat_comment_count: 0 }) as ChatInfo)
  it.each([
    ["a DM", dmList({ kind: "dm", id: "maya sam", other: "maya" })],
    ["a group", groupList("g1")],
  ])("moves to the message named, in %s", (_, { ref, Rows }) => {
    render(<Provider store={store}><Rows conversation={ref} older={still} newer={still} toLatest={() => {}} rows={chats} unreadOnOpen={0} /></Provider>)
    act(() => void window.dispatchEvent(new CustomEvent(READ_MOVED_EVENT, { detail: { id: ref.id, first_unread: "m3" } })))
    expect(rowsAfterLine()).toEqual(["m3", "m4"])
  })
})
