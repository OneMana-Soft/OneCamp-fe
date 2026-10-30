import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ChatInfo } from "@/types/chat"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A group's rows tell the store who wrote them (their name, picture and
// status), as a channel's and a DM's did, so names and faces elsewhere read
// them there. A group's own rows never told it (chat A1 step 2b).

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/chat/group/g1", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useMediaFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/components/groupChat/groupChatMessage", () => ({ GroupChatMessage: ({ chatInfo }: { chatInfo: ChatInfo }) => <p>{chatInfo.chat_uuid}</p> }))
vi.mock("@/components/chat/SeenReceiptLine", () => ({ SeenReceiptLine: () => null }))

const { default: store } = await import("@/store/store")
const { groupList } = await import("@/components/conversation/GroupRows")

afterEach(cleanup)

describe("a group's rows", () => {
  it("tell the store who wrote them", () => {
    const { ref, Rows } = groupList("g-authors")
    const still = { has: false, loading: false, ask: () => {} }
    const chat = { chat_uuid: "m1", chat_body_text: "<p>hi</p>", chat_from: { user_uuid: "u-ines", user_name: "Ines Duarte", user_status: "online" }, chat_created_at: "2026-10-22T09:00:00Z", chat_comment_count: 0 } as ChatInfo
    render(<Provider store={store}><Rows conversation={ref} older={still} newer={still} toLatest={() => {}} rows={[chat]} unreadOnOpen={0} /></Provider>)
    expect(store.getState().users.usersStatus["u-ines"]).toMatchObject({ userName: "Ines Duarte", status: "online" })
  })
})
