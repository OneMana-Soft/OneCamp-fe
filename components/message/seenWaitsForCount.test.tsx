import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ChatInfo } from "@/types/chat"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Where you left off (chat B27): the newest message isn't marked seen until
// the count of what was unread is read, and is marked once it is. The rows are
// drawn by a memoised renderer, so it must follow the count: one that kept the
// first render's held the conversation unseen for good.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/chat/priya", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useMediaFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/components/chat/chatMessage", () => ({ ChatMessage: ({ chatInfo }: { chatInfo: ChatInfo }) => <p>{chatInfo.chat_uuid}</p> }))
vi.mock("@/components/groupChat/groupChatMessage", () => ({ GroupChatMessage: ({ chatInfo }: { chatInfo: ChatInfo }) => <p>{chatInfo.chat_uuid}</p> }))
vi.mock("@/components/chat/SeenReceiptLine", () => ({ SeenReceiptLine: ({ hold }: { hold?: boolean }) => <i data-testid="seen" data-hold={hold ? "" : undefined} /> }))

const { default: store } = await import("@/store/store")
const { dmList } = await import("@/components/conversation/DmRows")
const { groupList } = await import("@/components/conversation/GroupRows")

const at = (i: number) => new Date(Date.UTC(2026, 9, 16, 9, i)).toISOString()
const still = { has: false, loading: false, ask: () => {} }
// A DM's and a group's rows, as their lists draw them (chat A1 step 2b).
const dm = dmList({ kind: "dm", id: "priya sam", other: "priya" })
const group = groupList("g1")
const DmRows = dm.Rows
const GroupRows = group.Rows
const paging = { older: still, newer: still, toLatest: () => {} }
const chat = (i: number, extra: Partial<ChatInfo> = {}) => ({ chat_uuid: `m${i}`, chat_body_text: `<p>m${i}</p>`, chat_from: { user_uuid: "priya", user_name: "Priya" }, chat_created_at: at(i), chat_attachments: [], chat_comment_count: 0, ...extra }) as unknown as ChatInfo
const chats = [1, 2].map((i) => chat(i))
const held = () => document.querySelector("[data-testid=seen]")?.hasAttribute("data-hold")

afterEach(cleanup)

describe("the newest message is marked seen once the unread count is read", () => {
  it("in a DM", () => {
    const { rerender } = render(<Provider store={store}><DmRows {...paging} conversation={dm.ref} rows={chats} /></Provider>)
    expect(held()).toBe(true)
    rerender(<Provider store={store}><DmRows {...paging} conversation={dm.ref} rows={chats} unreadOnOpen={1} /></Provider>)
    expect(held()).toBe(false)
  })

  it("in a group", () => {
    const { rerender } = render(<Provider store={store}><GroupRows {...paging} conversation={group.ref} rows={chats} /></Provider>)
    expect(held()).toBe(true)
    rerender(<Provider store={store}><GroupRows {...paging} conversation={group.ref} rows={chats} unreadOnOpen={1} /></Provider>)
    expect(held()).toBe(false)
  })

  // A line can be the newest row (someone added, a call ended): the receipt
  // sits under it, so the conversation is still marked seen.
  it("in a group whose newest row is a line", () => {
    const line = chat(3, { chat_kind: "system", chat_body_text: "<p>Priya added Jonas.</p>", chat_system: JSON.stringify({ kind: "group.added", actor: "priya", targets: ["jonas"] }) })
    render(<Provider store={store}><GroupRows {...paging} conversation={group.ref} rows={[...chats, line]} unreadOnOpen={1} /></Provider>)
    expect(held()).toBe(false)
  })

  it("not while newer messages are still to load below", () => {
    render(<Provider store={store}><DmRows {...paging} newer={{ ...still, has: true }} conversation={dm.ref} rows={chats} unreadOnOpen={1} /></Provider>)
    expect(document.querySelector("[data-testid=seen]")).toBeNull()
  })
})
