import { afterEach, describe, expect, it, vi } from "vitest"
import chatSlice, { mergeChats, updateChats, invalidateAllChatMessages, createChat, removeChatByChatId } from "@/store/slice/chatSlice"
import channelSlice, { mergeChannelPosts, updateChannelPosts, invalidateChannelPosts, createPost, removePostByPostId } from "@/store/slice/channelSlice"
import { TOMBSTONE_TTL_MS } from "@/lib/utils/deletionTombstone"
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

    it("clears messages deleted while idle when an EMPTY window is authoritative", () => {
        // Every message was deleted server-side. Without an explicit watermark
        // an empty page can't be told apart from a legacy/paginated response,
        // so the authority flag is what makes the removal safe.
        let state = reducer(
            undefined,
            updateChats({ chatId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("b", "2024-01-01T00:01:00Z")] })
        )
        state = reducer(
            state,
            mergeChats({ chatId, chats: [], authoritativeThrough: Date.parse("2024-01-01T00:10:00Z") })
        )
        expect(state.chatMessages[chatId]).toEqual([])
    })

    it("keeps optimistic sends and post-watermark messages when an empty window is authoritative", () => {
        let state = reducer(
            undefined,
            updateChats({
                chatId,
                chats: [
                    chat("deleted", "2024-01-01T00:00:00Z"),
                    // Sent while the request was in flight -> after the watermark.
                    chat("after-watermark", "2024-01-01T00:20:00Z"),
                ],
            })
        )
        // An unconfirmed local send that predates the watermark must survive too.
        const optimistic = { ...chat("optimistic", "2024-01-01T00:05:00Z"), chat_added_locally: true }
        state = { ...state, chatMessages: { [chatId]: [...state.chatMessages[chatId], optimistic] } } as any

        state = reducer(
            state,
            mergeChats({ chatId, chats: [], authoritativeThrough: Date.parse("2024-01-01T00:10:00Z") })
        )
        expect(state.chatMessages[chatId].map((c) => c.chat_uuid)).toEqual(["optimistic", "after-watermark"])
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

    it("clears the last remaining post when an EMPTY window is authoritative", () => {
        let state = reducer(undefined, updateChannelPosts({ channelId, posts: [post("only", "2024-01-01T00:00:00Z")] }))
        state = reducer(
            state,
            mergeChannelPosts({ channelId, posts: [], authoritativeThrough: Date.parse("2024-01-01T00:10:00Z") })
        )
        expect(state.channelPosts[channelId]).toEqual([])
    })

    it("stays a no-op for an empty window with no authority (pagination / legacy dispatch)", () => {
        let state = reducer(undefined, updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        const before = state.channelPosts[channelId]
        state = reducer(state, mergeChannelPosts({ channelId, posts: [] }))
        expect(state.channelPosts[channelId]).toBe(before)
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

// Deletion tombstones exist because MQTT delivery is not ordered and a "latest
// window" can predate a delete: without them a delete looks like it did nothing
// even though the server accepted it. They are also deliberately short-lived so
// a soft delete an admin later restores is never hidden for long — both halves
// of that contract are locked here.
describe("deletion tombstones", () => {
    // Pin the clock so TTL expiry is exercised deterministically rather than by
    // waiting. markTombstone/isTombstoned both read Date.now() by default.
    const clockAt = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(ms)
    afterEach(() => vi.restoreAllMocks())

    it("channel: a create event delivered after the delete cannot resurrect a post", () => {
        const reducer = channelSlice.reducer
        const channelId = "ch1"
        clockAt(1_000)
        let state = reducer(
            undefined,
            updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z"), post("gone", "2024-01-01T00:01:00Z")] })
        )
        state = reducer(state, removePostByPostId({ channelId, postId: "gone" }))
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a"])

        // The out-of-order create for the same id arrives moments later.
        state = reducer(
            state,
            createPost({
                postId: "gone",
                postText: "back?",
                postCreatedAt: "2024-01-01T00:01:00Z",
                postBy: {} as any,
                channelId,
                attachments: [],
            })
        )
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a"])
    })

    it("channel: a window fetched before the delete cannot re-add the post", () => {
        const reducer = channelSlice.reducer
        const channelId = "ch1"
        clockAt(1_000)
        let state = reducer(
            undefined,
            updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z"), post("gone", "2024-01-01T00:01:00Z")] })
        )
        state = reducer(state, removePostByPostId({ channelId, postId: "gone" }))

        // The reconcile still carries the deleted post: its page predates the delete.
        state = reducer(
            state,
            mergeChannelPosts({
                channelId,
                posts: [post("a", "2024-01-01T00:00:00Z"), post("gone", "2024-01-01T00:01:00Z")],
            })
        )
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toEqual(["a"])
    })

    it("channel: honours a restore once the tombstone has expired", () => {
        const reducer = channelSlice.reducer
        const channelId = "ch1"
        clockAt(1_000)
        let state = reducer(undefined, updateChannelPosts({ channelId, posts: [post("a", "2024-01-01T00:00:00Z")] }))
        state = reducer(state, removePostByPostId({ channelId, postId: "restored" }))

        // An admin restore surfaces on a later fetch, past the TTL. The tombstone
        // must not suppress it — it only guards the immediate delete/merge race.
        clockAt(1_000 + TOMBSTONE_TTL_MS + 1)
        state = reducer(
            state,
            createPost({
                postId: "restored",
                postText: "restored by an admin",
                postCreatedAt: "2024-01-01T00:02:00Z",
                postBy: {} as any,
                channelId,
                attachments: [],
            })
        )
        expect(state.channelPosts[channelId].map((p) => p.post_uuid)).toContain("restored")
    })

    it("chat: a create event delivered after the delete cannot resurrect a message", () => {
        const reducer = chatSlice.reducer
        const dmId = "dm1"
        clockAt(1_000)
        let state = reducer(
            undefined,
            updateChats({ chatId: dmId, chats: [chat("a", "2024-01-01T00:00:00Z"), chat("gone", "2024-01-01T00:01:00Z")] })
        )
        state = reducer(state, removeChatByChatId({ chatId: dmId, messageId: "gone" }))
        expect(state.chatMessages[dmId].map((c) => c.chat_uuid)).toEqual(["a"])

        state = reducer(
            state,
            createChat({
                chatId: "gone",
                chatText: "back?",
                chatCreatedAt: "2024-01-01T00:01:00Z",
                chatBy: {} as any,
                chatTo: {} as any,
                dmId,
                attachments: [],
            })
        )
        expect(state.chatMessages[dmId].map((c) => c.chat_uuid)).toEqual(["a"])
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
