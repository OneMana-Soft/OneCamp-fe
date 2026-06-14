import { describe, expect, it } from "vitest"
import chatSlice, { mergeChats, updateChats, invalidateAllChatMessages } from "@/store/slice/chatSlice"
import channelSlice, { mergeChannelPosts, updateChannelPosts, invalidateChannelPosts } from "@/store/slice/channelSlice"
import groupChatSlice, { mergeGroupChats, updateGroupChats } from "@/store/slice/groupChatSlice"
import messageResyncSlice, { triggerMessageResync } from "@/store/slice/messageResyncSlice"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"

const chat = (uuid: string, createdAt: string, body?: string): ChatInfo =>
    ({
        chat_uuid: uuid,
        chat_created_at: createdAt,
        chat_body_text: body ?? `body-${uuid}`,
        chat_from: {} as any,
        chat_to: {} as any,
        chat_attachments: [],
        chat_comment_count: 0,
    }) as ChatInfo

const post = (uuid: string, createdAt: string, text?: string): PostsRes =>
    ({
        post_uuid: uuid,
        post_created_at: createdAt,
        post_text: text ?? `text-${uuid}`,
        post_by: {} as any,
        post_comment_count: 0,
    }) as PostsRes

describe("chatSlice.mergeChats", () => {
    const reducer = chatSlice.reducer
    const chatId = "dm1"

    it("appends only genuinely-new messages, keyed by uuid", () => {
        let state = reducer(undefined, updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("b", "2024-01-01T00:01:00Z")] }))
        state = reducer(
            state,
            mergeChats({
                chatId,
                // 'b' already present (dup), 'c' is new
                chats: [chat("b", "2024-01-01T00:01:00Z"), chat("c", "2024-01-01T00:02:00Z")],
            })
        )
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["a", "b", "c"])
    })

    it("keeps the array sorted oldest-first even if merged out of order", () => {
        let state = reducer(undefined, updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z")] }))
        state = reducer(
            state,
            mergeChats({
                chatId,
                chats: [chat("z", "2024-01-01T00:05:00Z"), chat("m", "2024-01-01T00:02:00Z")],
            })
        )
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["a", "m", "z"])
    })

    it("returns a STABLE reference when nothing new arrives (no needless re-render)", () => {
        let state = reducer(undefined, updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z")] }))
        const before = state.chatMessages[chatId]
        state = reducer(state, mergeChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z")] }))
        // Same content, no additions -> identical reference preserved.
        expect(state.chatMessages[chatId]).toBe(before)
    })

    it("applies a server-side EDIT made while idle (refreshes content in place)", () => {
        let state = reducer(
            undefined,
            updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z", "old"), chat("b", "2024-01-01T00:01:00Z")] })
        )
        // Server window returns 'a' with edited text within the window range.
        state = reducer(
            state,
            mergeChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z", "edited-on-server"), chat("b", "2024-01-01T00:01:00Z")] })
        )
        const a = state.chatMessages[chatId].find((c) => c.chat_uuid === "a")
        expect(a?.chat_body_text).toBe("edited-on-server")
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["a", "b"])
    })

    it("drops a message DELETED while idle (absent from the window's range)", () => {
        let state = reducer(
            undefined,
            updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("b", "2024-01-01T00:01:00Z"), chat("c", "2024-01-01T00:02:00Z")] })
        )
        // Server window now omits 'b' (deleted). Window range is [a..c], so 'b'
        // is inside it and absent → removed.
        state = reducer(
            state,
            mergeChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("c", "2024-01-01T00:02:00Z")] })
        )
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["a", "c"])
    })

    it("preserves older history and just-sent optimistic messages OUTSIDE the window range", () => {
        // 'old' is older than the window; 'fresh' is newer (optimistic send
        // not yet round-tripped). The window only covers [w1..w2].
        let state = reducer(
            undefined,
            updateChats({
                chatId,
                chats: [
                    chat("old", "2024-01-01T00:00:00Z"),
                    chat("w1", "2024-01-01T00:05:00Z"),
                    chat("w2", "2024-01-01T00:06:00Z"),
                    chat("fresh", "2024-01-01T00:10:00Z"),
                ],
            })
        )
        // Window returns only w1,w2 (the contiguous latest page at the time).
        state = reducer(
            state,
            mergeChats({ chatId, chats: [chat("w1", "2024-01-01T00:05:00Z"), chat("w2", "2024-01-01T00:06:00Z")] })
        )
        // Nothing dropped: 'old' precedes the window, 'fresh' follows it.
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["old", "w1", "w2", "fresh"])
    })

    it("populates an empty conversation from a merge (self-heal after a wipe)", () => {
        let state = reducer(undefined, invalidateAllChatMessages())
        expect(state.chatMessages[chatId]).toBeUndefined()
        state = reducer(state, mergeChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z")] }))
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["a"])
    })

    it("is a no-op for an empty merge payload", () => {
        let state = reducer(undefined, updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z")] }))
        const before = state.chatMessages[chatId]
        state = reducer(state, mergeChats({ chatId, chats: [] }))
        expect(state.chatMessages[chatId]).toBe(before)
    })
})

describe("channelSlice.mergeChannelPosts", () => {
    const reducer = channelSlice.reducer
    const channelId = "ch1"

    it("appends only new posts and sorts oldest-first", () => {
        let state = reducer(undefined, updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        state = reducer(
            state,
            mergeChannelPosts({ channelId, posts: [post("c", "2024-01-01T00:02:00Z"), post("b", "2024-01-01T00:01:00Z")] })
        )
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a", "b", "c"])
    })

    it("keeps a stable reference when idle reconnect brings nothing new", () => {
        let state = reducer(undefined, updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        const before = state.channelPosts[channelId]
        state = reducer(state, mergeChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        expect(state.channelPosts[channelId]).toBe(before)
    })

    it("applies an edit and a delete from the reconcile window", () => {
        let state = reducer(
            undefined,
            updateChannelPosts({
                channelId,
                posts: [post("a", "2024-01-01T00:00:00Z", "old"), post("b", "2024-01-01T00:01:00Z"), post("c", "2024-01-01T00:02:00Z")],
            })
        )
        // 'a' edited, 'b' deleted (absent), 'c' unchanged, 'd' new.
        state = reducer(
            state,
            mergeChannelPosts({
                channelId,
                posts: [post("a", "2024-01-01T00:00:00Z", "edited"), post("c", "2024-01-01T00:02:00Z"), post("d", "2024-01-01T00:03:00Z")],
            })
        )
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a", "c", "d"])
        expect(state.channelPosts[channelId].find((p) => p.post_uuid === "a")?.post_text).toBe("edited")
    })

    it("never removes an optimistic local post even if absent from the window", () => {
        let state = reducer(
            undefined,
            updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] })
        )
        // Inject an optimistic post within the window's time-range.
        const local = { ...post("local", "2024-01-01T00:00:30Z"), post_added_locally: true }
        state = { ...state, channelPosts: { [channelId]: [state.channelPosts[channelId][0], local] } } as any
        state = reducer(
            state,
            mergeChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z"), post("b", "2024-01-01T00:01:00Z")] })
        )
        // 'local' is preserved despite being absent from the server window.
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toContain("local")
    })

    it("self-heals after invalidateChannelPosts wipes state", () => {
        let state = reducer(undefined, invalidateChannelPosts())
        state = reducer(state, mergeChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a"])
    })
})

describe("groupChatSlice.mergeGroupChats", () => {
    const reducer = groupChatSlice.reducer
    const grpId = "g1"

    it("merges missed group messages without dropping existing ones", () => {
        let state = reducer(undefined, updateGroupChats({ grpId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("b", "2024-01-01T00:01:00Z")] }))
        state = reducer(state, mergeGroupChats({ grpId, chats: [chat("c", "2024-01-01T00:02:00Z")] }))
        expect(state.chatMessages[grpId].map((c) => c.chat_uuid)).toEqual(["a", "b", "c"])
    })

    it("applies edits and deletes from the window", () => {
        let state = reducer(
            undefined,
            updateGroupChats({ grpId, chats: [chat("a", "2024-01-01T00:00:00Z", "old"), chat("b", "2024-01-01T00:01:00Z"), chat("c", "2024-01-01T00:02:00Z")] })
        )
        // 'a' edited, 'b' deleted, 'c' kept.
        state = reducer(
            state,
            mergeGroupChats({ grpId, chats: [chat("a", "2024-01-01T00:00:00Z", "new"), chat("c", "2024-01-01T00:02:00Z")] })
        )
        expect(state.chatMessages[grpId].map((c) => c.chat_uuid)).toEqual(["a", "c"])
        expect(state.chatMessages[grpId].find((c) => c.chat_uuid === "a")?.chat_body_text).toBe("new")
    })
})

describe("messageResyncSlice", () => {
    it("monotonically increments the nonce on each trigger", () => {
        const reducer = messageResyncSlice.reducer
        let state = reducer(undefined, { type: "@@init" } as any)
        expect(state.nonce).toBe(0)
        state = reducer(state, triggerMessageResync())
        expect(state.nonce).toBe(1)
        state = reducer(state, triggerMessageResync())
        expect(state.nonce).toBe(2)
    })
})
