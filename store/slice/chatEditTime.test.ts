import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import chatSlice, { updateChatByChatId, updateChats } from "@/store/slice/chatSlice"
import groupChatSlice, { updateGroupChatByChatId, updateGroupChats } from "@/store/slice/groupChatSlice"
import { applyReplyEdit } from "@/lib/chat/replyEdit"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A DM's or a group's message said "(edited)" only once the page was read
// again: an edit, yours or one arriving live, changed its words and not its
// edit time, as a channel post's edit does (C27). And a failed save's revert
// puts that time back (F-07).
const messages = [
  { chat_uuid: "never", chat_body_text: "<p>a</p>", chat_created_at: "2026-10-14T09:00:00Z" },
  { chat_uuid: "once", chat_body_text: "<p>b</p>", chat_created_at: "2026-10-14T09:00:00Z", chat_updated_at: "2026-10-14T09:10:00Z" },
]

describe("a DM's message, edited", () => {
  const store = () => {
    const s = configureStore({ reducer: { chat: chatSlice.reducer } })
    s.dispatch(updateChats({ chatId: "u1", chats: structuredClone(messages) as never }))
    return s
  }
  const chat = (s: ReturnType<typeof store>, id: string) => s.getState().chat.chatMessages["u1"].find((c) => c.chat_uuid === id)!

  it("says it was edited as the edit shows, and not when the words are the same", () => {
    const s = store()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a2</p>" }))
    expect(chat(s, "never").chat_updated_at).toBeTruthy()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "once", htmlText: "<p>b</p>" }))
    expect(chat(s, "once").chat_updated_at).toBe("2026-10-14T09:10:00Z")
  })

  it("puts back that it was never edited, or when it last was", () => {
    const s = store()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a2</p>" }))
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a</p>", updatedAt: null }))
    expect(chat(s, "never").chat_updated_at).toBeUndefined()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "once", htmlText: "<p>b2</p>" }))
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "once", htmlText: "<p>b</p>", updatedAt: "2026-10-14T09:10:00Z" }))
    expect(chat(s, "once")).toMatchObject({ chat_body_text: "<p>b</p>", chat_updated_at: "2026-10-14T09:10:00Z" })
  })
})

describe("a group's message, edited", () => {
  it("says it was edited as the edit shows, and puts back when it last was", () => {
    const s = configureStore({ reducer: { groupChat: groupChatSlice.reducer } })
    s.dispatch(updateGroupChats({ grpId: "g1", chats: structuredClone(messages) as never }))
    const chat = (id: string) => s.getState().groupChat.chatMessages["g1"].find((c) => c.chat_uuid === id)!
    s.dispatch(updateGroupChatByChatId({ grpId: "g1", messageId: "never", htmlText: "<p>a2</p>" }))
    expect(chat("never").chat_updated_at).toBeTruthy()
    s.dispatch(updateGroupChatByChatId({ grpId: "g1", messageId: "never", htmlText: "<p>a</p>", updatedAt: null }))
    expect(chat("never").chat_updated_at).toBeUndefined()
  })
})

describe("a reply's edit", () => {
  it("is stamped when its words change, and not when they don't", () => {
    const reply = { comment_text: "<p>ok</p>", comment_updated_at: undefined as string | undefined }
    applyReplyEdit(reply, "<p>ok</p>")
    expect(reply.comment_updated_at).toBeUndefined()
    applyReplyEdit(reply, "<p>ok, done</p>")
    expect(reply).toMatchObject({ comment_text: "<p>ok, done</p>" })
    expect(reply.comment_updated_at).toBeTruthy()
  })
})
