import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import channelSlice, { addPendingPost, confirmPendingPost, createPost, failPendingPost, removePendingPost, retryPendingPost } from "@/store/slice/channelSlice"
import chatSlice, { addPendingChat, confirmPendingChat, createChat, failPendingChat } from "@/store/slice/chatSlice"
import groupChatSlice, { addPendingGroupChat, confirmPendingGroupChat, createGroupChat, failPendingGroupChat } from "@/store/slice/groupChatSlice"
import type { PostsRes } from "@/types/post"
import type { ChatInfo } from "@/types/chat"
import { indexOfEchoed, isLocalId, newLocalId, plainText, rowKey } from "./pendingSend"
import { sendOnce } from "./sendOnce"

// A message is in the conversation the moment Send is pressed, marked as
// sending, and stays one row from then on: confirmed by the server's answer,
// marked not sent if there is none, or replaced in place by the realtime echo
// if that comes first.

const SAM = { user_uuid: "sam", user_name: "Sam Rivera" }
const pending = (localId: string, text = "<p>Ship it</p>"): PostsRes => ({
  post_uuid: localId,
  post_local_id: localId,
  post_send_state: "sending",
  post_text: text,
  post_by: SAM as PostsRes["post_by"],
  post_created_at: "2026-10-10T09:00:00.000Z",
  post_comment_count: 0,
  post_added_locally: true,
})

const store = () => configureStore({ reducer: { channel: channelSlice.reducer, chat: chatSlice.reducer, groupChat: groupChatSlice.reducer } })

describe("local ids", () => {
  it("are unique and recognisable", () => {
    const a = newLocalId()
    const b = newLocalId()
    expect(a).not.toBe(b)
    expect(isLocalId(a)).toBe(true)
    expect(isLocalId("3408b5a0-6883-423b-b138-2462fe59c48e")).toBe(false)
    expect(rowKey(a, "server")).toBe(a)
    expect(rowKey(undefined, "server")).toBe("server")
  })

  it("compare a message's words, not its markup", () => {
    expect(plainText("<p>Ship  it&nbsp;on <strong>Friday</strong></p>")).toBe("Ship it on Friday")
  })
})

describe("a post sent from here", () => {
  it("is in the channel at once, and takes the server's id and time when it answers", () => {
    const s = store()
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1") }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(1)
    s.dispatch(confirmPendingPost({ channelId: "c1", localId: "local-1", postUUID: "p9", createdAt: "2026-10-10T09:00:01.000Z" }))
    const [p] = s.getState().channel.channelPosts.c1
    expect(p.post_uuid).toBe("p9")
    expect(p.post_created_at).toBe("2026-10-10T09:00:01.000Z")
    expect(p.post_send_state).toBeUndefined()
    // Still keyed by the id it was sent with, so its row is never remounted.
    expect(p.post_local_id).toBe("local-1")
  })

  it("is marked not sent when the server does not answer, and sending again on Try again", () => {
    const s = store()
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1") }))
    s.dispatch(failPendingPost({ channelId: "c1", localId: "local-1" }))
    expect(s.getState().channel.channelPosts.c1[0].post_send_state).toBe("failed")
    s.dispatch(retryPendingPost({ channelId: "c1", localId: "local-1" }))
    expect(s.getState().channel.channelPosts.c1[0].post_send_state).toBe("sending")
    s.dispatch(removePendingPost({ channelId: "c1", localId: "local-1" }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(0)
  })

  it("becomes the realtime echo of itself in place, and the late answer adds nothing", () => {
    const s = store()
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1", "<p>Ship it</p>") }))
    s.dispatch(createPost({ channelId: "c1", postId: "p9", postText: "<p>Ship it</p>", postCreatedAt: "2026-10-10T09:00:01.000Z", postBy: SAM as PostsRes["post_by"], attachments: [] }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(1)
    expect(s.getState().channel.channelPosts.c1[0].post_uuid).toBe("p9")
    s.dispatch(confirmPendingPost({ channelId: "c1", localId: "local-1", postUUID: "p9", createdAt: "2026-10-10T09:00:01.000Z" }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(1)
  })

  // The echo came, so everyone has it; then the answer to the send was lost (a
  // timeout, a proxy's 502). It said "Not sent", and Try again posted it twice.
  it("stays sent when its echo came first and its answer was lost", () => {
    const s = store()
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1", "<p>Ship it</p>") }))
    s.dispatch(createPost({ channelId: "c1", postId: "p9", postText: "<p>Ship it</p>", postCreatedAt: "2026-10-10T09:00:01.000Z", postBy: SAM as PostsRes["post_by"], attachments: [] }))
    s.dispatch(failPendingPost({ channelId: "c1", localId: "local-1" }))
    expect(s.getState().channel.channelPosts.c1[0].post_send_state).toBeUndefined()
    expect(s.getState().channel.channelPosts.c1[0].post_uuid).toBe("p9")
  })

  it("keeps someone else's post with the same words as a post of its own", () => {
    const s = store()
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1", "<p>+1</p>") }))
    s.dispatch(createPost({ channelId: "c1", postId: "p7", postText: "<p>+1</p>", postCreatedAt: "2026-10-10T09:00:01.000Z", postBy: { user_uuid: "maya", user_name: "Maya Chen" } as PostsRes["post_by"], attachments: [] }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(2)
    expect(s.getState().channel.channelPosts.c1[0].post_send_state).toBe("sending")
  })

  it("is dropped when its echo got in first as a post of its own", () => {
    const s = store()
    // The echo's words differ (the server rewrote the markup), so it was not
    // recognised and was added below; the answer then names it.
    s.dispatch(addPendingPost({ channelId: "c1", post: pending("local-1", "<p>see https://x.dev</p>") }))
    s.dispatch(createPost({ channelId: "c1", postId: "p9", postText: '<p>see <a href="https://x.dev">x.dev</a></p>', postCreatedAt: "2026-10-10T09:00:01.000Z", postBy: SAM as PostsRes["post_by"], attachments: [] }))
    expect(s.getState().channel.channelPosts.c1).toHaveLength(2)
    s.dispatch(confirmPendingPost({ channelId: "c1", localId: "local-1", postUUID: "p9" }))
    const left = s.getState().channel.channelPosts.c1
    expect(left).toHaveLength(1)
    expect(left[0].post_uuid).toBe("p9")
  })
})

describe("a direct or group message sent from here", () => {
  const chat = (localId: string): ChatInfo => ({
    chat_uuid: localId,
    chat_local_id: localId,
    chat_send_state: "sending",
    chat_body_text: "<p>On it.</p>",
    chat_from: SAM as ChatInfo["chat_from"],
    chat_to: {} as ChatInfo["chat_to"],
    chat_created_at: "2026-10-10T09:00:00.000Z",
    chat_attachments: [],
    chat_comment_count: 0,
    chat_added_locally: true,
  })

  it("is confirmed in place in a DM, and becomes its echo", () => {
    const s = store()
    s.dispatch(addPendingChat({ dmId: "maya", chat: chat("local-1") }))
    s.dispatch(createChat({ dmId: "maya", chatId: "m9", chatText: "<p>On it.</p>", chatCreatedAt: "2026-10-10T09:00:01.000Z", chatBy: SAM as ChatInfo["chat_from"], chatTo: {} as ChatInfo["chat_to"], attachments: [] }))
    s.dispatch(confirmPendingChat({ dmId: "maya", localId: "local-1", chatUUID: "m9" }))
    const list = s.getState().chat.chatMessages.maya
    expect(list).toHaveLength(1)
    expect(list[0].chat_uuid).toBe("m9")
    expect(list[0].chat_send_state).toBeUndefined()
  })

  it("stays sent in a DM and a group when its echo came first and its answer was lost", () => {
    const s = store()
    s.dispatch(addPendingChat({ dmId: "maya", chat: chat("local-1") }))
    s.dispatch(createChat({ dmId: "maya", chatId: "m9", chatText: "<p>On it.</p>", chatCreatedAt: "2026-10-10T09:00:01.000Z", chatBy: SAM as ChatInfo["chat_from"], chatTo: {} as ChatInfo["chat_to"], attachments: [] }))
    s.dispatch(failPendingChat({ dmId: "maya", localId: "local-1" }))
    expect(s.getState().chat.chatMessages.maya[0].chat_send_state).toBeUndefined()
    s.dispatch(addPendingGroupChat({ grpId: "g1", chat: chat("local-2") }))
    s.dispatch(createGroupChat({ grpId: "g1", chatId: "m10", chatText: "<p>On it.</p>", chatCreatedAt: "2026-10-10T09:00:02.000Z", chatBy: SAM as ChatInfo["chat_from"], attachments: [] }))
    s.dispatch(failPendingGroupChat({ grpId: "g1", localId: "local-2" }))
    expect(s.getState().groupChat.chatMessages.g1[0].chat_send_state).toBeUndefined()
  })

  it("is confirmed in place in a group", () => {
    const s = store()
    s.dispatch(addPendingGroupChat({ grpId: "g1", chat: chat("local-2") }))
    s.dispatch(confirmPendingGroupChat({ grpId: "g1", localId: "local-2", chatUUID: "m10", createdAt: "2026-10-10T09:00:02.000Z" }))
    expect(s.getState().groupChat.chatMessages.g1[0].chat_uuid).toBe("m10")
    s.dispatch(createGroupChat({ grpId: "g1", chatId: "m10", chatText: "<p>On it.</p>", chatCreatedAt: "2026-10-10T09:00:02.000Z", chatBy: SAM as ChatInfo["chat_from"], attachments: [] }))
    expect(s.getState().groupChat.chatMessages.g1).toHaveLength(1)
  })

  it("finds nothing to replace for a message not sent from here", () => {
    expect(indexOfEchoed([chat("local-3")], { localId: (c) => c.chat_local_id, id: (c) => c.chat_uuid, author: (c) => c.chat_from?.user_uuid, html: (c) => c.chat_body_text, state: (c) => c.chat_send_state }, undefined, "<p>On it.</p>")).toBe(-1)
  })
})

// A thread reply sent again is the same reply (V-1088): its client_msg_id is
// kept while the draft is unchanged and not yet sent, so the server's send-once
// guard answers a retry, or a second Send while the first is in flight, with the
// reply it already wrote.
describe("a reply's client_msg_id", () => {
  const ids = (key: string, print: readonly unknown[], seen: string[], answer: Promise<unknown>) =>
    sendOnce(key, print, (id) => { seen.push(id); return answer }).catch(() => undefined)

  it("is the same when the unchanged draft is sent again after a failure, or while it is in flight", async () => {
    const seen: string[] = []
    await ids("channel:t1", ["<p>On it.</p>", [], false], seen, Promise.reject(new Error("timeout")))
    const inFlight = ids("channel:t1", ["<p>On it.</p>", [], false], seen, new Promise(() => {}))
    await ids("channel:t1", ["<p>On it.</p>", [], false], seen, Promise.resolve({ comment_id: "c1" }))
    void inFlight
    expect(seen).toHaveLength(3)
    expect(isLocalId(seen[0])).toBe(true)
    expect(new Set(seen).size).toBe(1)
  })

  it("is new once the words, the files or Also send change", async () => {
    const seen: string[] = []
    await ids("dm:t2", ["<p>On it.</p>", [], false], seen, Promise.reject(new Error("500")))
    await ids("dm:t2", ["<p>On it now.</p>", [], false], seen, Promise.reject(new Error("500")))
    await ids("dm:t2", ["<p>On it now.</p>", ["key-1"], false], seen, Promise.reject(new Error("500")))
    await ids("dm:t2", ["<p>On it now.</p>", ["key-1"], true], seen, Promise.reject(new Error("500")))
    expect(new Set(seen).size).toBe(4)
  })

  it("is new for the same words once they were sent", async () => {
    const seen: string[] = []
    await ids("group:t3", ["<p>Done.</p>", [], false], seen, Promise.resolve({ comment_id: "c3" }))
    await ids("group:t3", ["<p>Done.</p>", [], false], seen, Promise.resolve({ comment_id: "c4" }))
    expect(seen[0]).not.toBe(seen[1])
  })

  it("of a newer draft survives an older send's answer", async () => {
    const seen: string[] = []
    let answerFirst: (v: unknown) => void = () => {}
    const first = ids("channel:t4", ["<p>A</p>", [], false], seen, new Promise((r) => { answerFirst = r }))
    await ids("channel:t4", ["<p>B</p>", [], false], seen, Promise.reject(new Error("timeout")))
    answerFirst({ comment_id: "cA" })
    await first
    await ids("channel:t4", ["<p>B</p>", [], false], seen, Promise.resolve({ comment_id: "cB" }))
    expect(seen[2]).toBe(seen[1])
    expect(seen[1]).not.toBe(seen[0])
  })
})
