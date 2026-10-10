import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import type { PostsRes } from "@/types/post"

// Opening a channel with unread messages marks where they start, and the
// mark stays above the same message as new ones arrive below.

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

const { default: store } = await import("@/store/store")
const { ChannelMessages } = await import("@/components/channel/channelMessages")

const post = (i: number, by = "maya"): PostsRes =>
  ({ post_uuid: `p${i}`, post_text: `<p>${i}</p>`, post_by: { user_uuid: by, user_name: by }, post_created_at: new Date(Date.UTC(2026, 9, 10, 9, i * 9)).toISOString(), post_comment_count: 0 }) as PostsRes
const list = { channelId: "c1", getOldMessages: () => {}, hasMoreOldMsg: false, getNewMessages: () => {}, hasMoreNewMsg: false, isNewMsgLoading: false, isOLdMsgLoading: false, clickedScrollToBottom: () => {} }
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
    const { rerender } = render(<Provider store={store}><ChannelMessages {...list} posts={five} unreadOnOpen={2} /></Provider>)
    expect(rowsAfterLine()).toEqual(["p4", "p5"])
    rerender(<Provider store={store}><ChannelMessages {...list} posts={[...five, post(6)]} unreadOnOpen={2} /></Provider>)
    expect(rowsAfterLine()).toEqual(["p4", "p5", "p6"])
  })

  it("is not drawn when nothing was unread", () => {
    render(<Provider store={store}><ChannelMessages {...list} posts={[1, 2, 3].map((i) => post(i))} unreadOnOpen={0} /></Provider>)
    expect(document.querySelector('[role="separator"][aria-label="New messages"]')).toBeNull()
  })
})
