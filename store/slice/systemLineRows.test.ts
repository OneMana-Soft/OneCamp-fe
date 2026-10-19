import { describe, expect, it } from "vitest"
import groupChatSlice, { addPendingGroupChat, createGroupChat } from "@/store/slice/groupChatSlice"
import channelSlice, { addPendingPost, createPost } from "@/store/slice/channelSlice"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A system line is the server's (chat A9): written as its actor, but never a
// send of this tab's, so it can't be taken for one still sending, whatever its
// words; and it keeps what makes it a line.
const words = "<p>Maya added Priya. The conversation continues with them in a new one.</p>"
const facts = JSON.stringify({ kind: "group.continued", actor: "maya", to: "grp-new" })
const maya = { user_uuid: "maya", user_name: "Maya", user_profile_object_key: "" }

describe("a live system line in a group", () => {
  it("is a row of its own beside a send with the same words, and keeps its kind and facts", () => {
    const pending = { chat_uuid: "local-1", chat_local_id: "local-1", chat_send_state: "sending", chat_body_text: words, chat_from: maya, chat_created_at: "2026-10-16T09:00:00Z", chat_attachments: [], chat_comment_count: 0 } as unknown as ChatInfo
    let state = groupChatSlice.reducer(undefined, addPendingGroupChat({ grpId: "g", chat: pending }))
    state = groupChatSlice.reducer(state, createGroupChat({ chatId: "line-1", chatText: words, chatCreatedAt: "2026-10-16T09:00:01Z", grpId: "g", chatBy: maya, attachments: [], system: { chat_kind: "system", chat_system: facts } }))
    const rows = state.chatMessages.g
    expect(rows.map((c) => c.chat_uuid)).toEqual(["local-1", "line-1"])
    expect(rows[0].chat_send_state).toBe("sending")
    expect(rows[1]).toMatchObject({ chat_kind: "system", chat_system: facts })
  })

  it("is its sender's echo when it's a person's message", () => {
    const pending = { chat_uuid: "local-1", chat_local_id: "local-1", chat_send_state: "sending", chat_body_text: words, chat_from: maya, chat_created_at: "2026-10-16T09:00:00Z", chat_attachments: [], chat_comment_count: 0 } as unknown as ChatInfo
    let state = groupChatSlice.reducer(undefined, addPendingGroupChat({ grpId: "g", chat: pending }))
    state = groupChatSlice.reducer(state, createGroupChat({ chatId: "srv-1", chatText: words, chatCreatedAt: "2026-10-16T09:00:01Z", grpId: "g", chatBy: maya, attachments: [] }))
    expect(state.chatMessages.g.map((c) => c.chat_uuid)).toEqual(["srv-1"])
    expect(state.chatMessages.g[0].chat_kind).toBeUndefined()
  })
})

describe("a live system line in a channel", () => {
  it("is a row of its own, with its kind and facts", () => {
    const pending = { post_uuid: "local-2", post_local_id: "local-2", post_send_state: "sending", post_text: words, post_by: maya, post_created_at: "2026-10-16T09:00:00Z", post_comment_count: 0 } as unknown as PostsRes
    let state = channelSlice.reducer(undefined, addPendingPost({ channelId: "c", post: pending }))
    state = channelSlice.reducer(state, createPost({ postId: "line-2", postText: words, postCreatedAt: "2026-10-16T09:00:01Z", channelId: "c", postBy: maya, attachments: [], system: { post_kind: "system", post_system: facts } }))
    expect(state.channelPosts.c.map((p) => p.post_uuid)).toEqual(["local-2", "line-2"])
    expect(state.channelPosts.c[1]).toMatchObject({ post_kind: "system", post_system: facts })
  })
})
