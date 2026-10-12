import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A forward of a message deleted since says so where it was forwarded, and
// shows nothing of it: the server stopped sending its text, author and
// channel (BE-BUG-8), and the card no longer draws an empty forward.

vi.mock("@/hooks/useRelayedAuthor", () => ({ useRelayedAuthor: () => null }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-body="">{content}</div>,
}))

const { MessagePreview } = await import("./MessagePreview")
const { mapPostsResToBaseMessage, mapChatInfoToBaseMessage } = await import("./baseMessageCard")

afterEach(cleanup)

const post = (fwd: Record<string, unknown>) =>
  ({ post_uuid: "p2", post_text: "", post_by: { user_uuid: "sam" }, post_created_at: "2026-10-13T09:00:00Z", post_comment_count: 0, post_fwd_msg_post: fwd }) as never

describe("a forward of a deleted message", () => {
  it("is marked deleted from the server's deletion time, and only then", () => {
    const gone = mapPostsResToBaseMessage(post({ post_uuid: "p1", post_deleted_at: "2026-10-13T08:00:00Z" }))
    expect(gone.fwdMsgPost?.deleted).toBe(true)
    // A live original carries the graph's zero time, or none.
    const live = mapPostsResToBaseMessage(post({ post_uuid: "p1", post_text: "<p>ship it</p>", post_deleted_at: "0001-01-01T00:00:00Z" }))
    expect(live.fwdMsgPost?.deleted).toBe(false)
    expect(mapPostsResToBaseMessage(post({ post_uuid: "p1", post_text: "<p>ship it</p>" })).fwdMsgPost?.deleted).toBe(false)
    const chat = mapChatInfoToBaseMessage({
      chat_uuid: "c2", chat_body_text: "", chat_from: { user_uuid: "sam" }, chat_created_at: "2026-10-13T09:00:00Z",
      chat_fwd_msg_chat: { chat_uuid: "c1", chat_deleted_at: "2026-10-13T08:00:00Z" },
    } as never)
    expect(chat.fwdMsgChat?.deleted).toBe(true)
  })

  it("says it was deleted, with no name, words or link", () => {
    const { container } = render(<MessagePreview vewFooter deleted msgUUID="p1" />)
    expect(screen.getByText("This message was deleted.")).toBeTruthy()
    expect(container.querySelector("[data-body]")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
