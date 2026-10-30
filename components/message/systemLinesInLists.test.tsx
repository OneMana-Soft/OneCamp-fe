import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import type { PostsRes } from "@/types/post"
import type { ChatInfo } from "@/types/chat"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A system line (chat A9) is drawn as a line in every conversation, never as a
// message with an avatar and actions; and a shared history's copies sit under
// one heading saying what they are.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/channel/c1", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/components/channel/chanelMessage", () => ({
  ChannelMessage: ({ postInfo }: { postInfo: PostsRes }) => <p data-testid="row">{postInfo.post_uuid}</p>,
}))
vi.mock("@/components/groupChat/groupChatMessage", () => ({
  GroupChatMessage: ({ chatInfo, continued }: { chatInfo: ChatInfo; continued?: boolean }) => <p data-testid="row" data-continued={continued ? "" : undefined}>{chatInfo.chat_uuid}</p>,
}))
vi.mock("@/components/chat/SeenReceiptLine", () => ({ SeenReceiptLine: () => null }))

const { default: store } = await import("@/store/store")
const { ChannelRows } = await import("@/components/conversation/ChannelRows")
const { groupList } = await import("@/components/conversation/GroupRows")
// A group's rows, as its list draws them (chat A1 step 2b).
const GroupRows = groupList("g").Rows

const at = (i: number) => new Date(Date.UTC(2026, 9, 16, 9, i)).toISOString()
const still = { has: false, loading: false, ask: () => {} }
const paging = { older: still, newer: still, toLatest: () => {} }

afterEach(cleanup)

const rows = () => [...document.querySelectorAll("[data-testid=row]")].map((r) => r.textContent)
const lines = () => [...document.querySelectorAll("[data-system-line]")].map((r) => r.textContent)

describe("a channel", () => {
  it("draws its system line as a line, and people's messages as messages", () => {
    const posts = [
      { post_uuid: "line", post_text: "<p>Maya made this channel from the conversation with Priya.</p>", post_by: { user_uuid: "maya", user_name: "Maya" }, post_created_at: at(1), post_comment_count: 0, post_kind: "system", post_system: JSON.stringify({ kind: "channel.from_group", actor: "maya", from: "g" }) },
      { post_uuid: "m1", post_text: "<p>hi</p>", post_by: { user_uuid: "maya", user_name: "Maya" }, post_created_at: at(2), post_comment_count: 0 },
    ] as PostsRes[]
    render(<Provider store={store}><ChannelRows {...paging} conversation={{ kind: "channel", id: "c1" }} rows={posts} unreadOnOpen={0} /></Provider>)
    expect(rows()).toEqual(["m1"])
    expect(lines()).toEqual(["Maya made this channel from the conversation with Priya."])
  })
})

describe("a group", () => {
  const chat = (uuid: string, i: number, extra: Partial<ChatInfo> = {}) =>
    ({ chat_uuid: uuid, chat_body_text: `<p>${uuid}</p>`, chat_from: { user_uuid: "maya", user_name: "Maya" }, chat_created_at: at(i), chat_attachments: [], chat_comment_count: 0, ...extra }) as ChatInfo

  it("heads the copies a share brought in, and draws its lines as lines", () => {
    const chats = [
      chat("copy1", 1, { chat_copy_of: "orig1" }),
      chat("copy2", 2, { chat_copy_of: "orig2" }),
      chat("started", 3, { chat_body_text: "<p>Maya started this conversation with Priya.</p>", chat_kind: "system", chat_system: JSON.stringify({ kind: "group.started", actor: "maya", targets: ["priya"], from: "old" }) }),
      chat("m1", 4),
    ]
    render(<Provider store={store}><GroupRows {...paging} conversation={{ kind: "group", id: "g1" }} rows={chats} unreadOnOpen={0} /></Provider>)
    expect(rows()).toEqual(["copy1", "copy2", "m1"])
    expect(lines()[0]).toContain("Maya started this conversation with Priya.")
    const heading = document.querySelector("[data-shared-history]")
    expect(heading?.textContent).toBe("Shared from the earlier conversation")
    const first = [...document.querySelectorAll("[data-testid=row]")][0]
    expect(heading!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("never draws the message after a line as continuing it", () => {
    const chats = [
      chat("started", 1, { chat_kind: "system", chat_system: JSON.stringify({ kind: "group.started", actor: "maya" }) }),
      chat("m1", 2),
    ]
    render(<Provider store={store}><GroupRows {...paging} conversation={{ kind: "group", id: "g2" }} rows={chats} unreadOnOpen={0} /></Provider>)
    expect(rows()).toEqual(["m1"])
    expect(document.querySelector("[data-testid=row]")?.hasAttribute("data-continued")).toBe(false)
    expect(document.querySelectorAll("[data-shared-history]")).toHaveLength(0)
  })
})
