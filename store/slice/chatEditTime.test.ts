import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import chatSlice, { updateChatByChatId, updateChats } from "@/store/slice/chatSlice"
import groupChatSlice, { updateGroupChatByChatId, updateGroupChats } from "@/store/slice/groupChatSlice"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A DM's or a group's message said "(edited)" only once the page was read
// again: an edit changed its words and not its edit time. Whoever reports an
// edit gives its time (hooks/useSaveEdit for your own, the live handlers for
// others'), and a failed save's revert gives back the one it had (F-07).
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

  it("takes the edit time it is given, and keeps its own when it is given none", () => {
    const s = store()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    expect(chat(s, "never")).toMatchObject({ chat_body_text: "<p>a2</p>", chat_updated_at: "2026-10-14T09:20:00Z" })
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "once", htmlText: "<p>b2</p>" }))
    expect(chat(s, "once").chat_updated_at).toBe("2026-10-14T09:10:00Z")
  })

  it("puts back that it was never edited", () => {
    const s = store()
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    s.dispatch(updateChatByChatId({ chatId: "u1", messageId: "never", htmlText: "<p>a</p>", updatedAt: null }))
    expect(chat(s, "never").chat_updated_at).toBeUndefined()
  })
})

describe("a group's message, edited", () => {
  it("takes the edit time it is given, and puts back that it was never edited", () => {
    const s = configureStore({ reducer: { groupChat: groupChatSlice.reducer } })
    s.dispatch(updateGroupChats({ grpId: "g1", chats: structuredClone(messages) as never }))
    const chat = (id: string) => s.getState().groupChat.chatMessages["g1"].find((c) => c.chat_uuid === id)!
    s.dispatch(updateGroupChatByChatId({ grpId: "g1", messageId: "never", htmlText: "<p>a2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    expect(chat("never").chat_updated_at).toBe("2026-10-14T09:20:00Z")
    s.dispatch(updateGroupChatByChatId({ grpId: "g1", messageId: "never", htmlText: "<p>a</p>", updatedAt: null }))
    expect(chat("never").chat_updated_at).toBeUndefined()
  })
})
