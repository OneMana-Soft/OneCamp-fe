import { afterEach, describe, expect, it } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactNode } from "react"
import chatSlice, { AddUserInChatList, CreateUserChatList } from "@/store/slice/chatSlice"
import groupChatSlice from "@/store/slice/groupChatSlice"
import { holdRows } from "@/store/conversations"
import { useListPreviewFill } from "@/components/conversation/useListPreviewFill"
import type { ConversationRef } from "@/lib/conversation/types"
import type { ChatInfo } from "@/types/chat"
import type { UserDMInterface, UserProfileDataInterface } from "@/types/user"

// A DM or group opened that the list's answer lacked (one its person hid, say)
// went into the list with no last message, so its row said "No messages yet"
// over a conversation with history (design-03).

const person = (uuid: string) => ({ user_uuid: uuid, user_name: uuid }) as UserProfileDataInterface
const row = (grouping: string, chats?: ChatInfo[]): UserDMInterface => ({
  dm_grouping_id: grouping, dm_unread: 0, dm_participants: [person(grouping.split(" ")[0])], dm_notification_type: "all", ...(chats ? { dm_chats: chats } : {}),
})
const chat = (id: string, text: string) => ({ chat_uuid: id, chat_body_text: `<p>${text}</p>` }) as ChatInfo

const MAYA: ConversationRef = { kind: "dm", id: "maya sam", other: "maya" }
const LAUNCH: ConversationRef = { kind: "group", id: "launch" }

/** Opens the conversation as its page does: its row goes into the list if the answer lacked it, and its messages are held. */
function open(conversation: ConversationRef, listed: UserDMInterface[], held: ChatInfo[]) {
  const store = configureStore({ reducer: { chat: chatSlice.reducer, groupChat: groupChatSlice.reducer } })
  store.dispatch(CreateUserChatList({ userDmList: listed }))
  store.dispatch(AddUserInChatList({ usersDm: row(conversation.id) }))
  store.dispatch(holdRows(conversation, held))
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useListPreviewFill(conversation), { wrapper })
  const list = store.getState().chat.latestChatList
  return { order: list.map((d) => d.dm_grouping_id), preview: list.find((d) => d.dm_grouping_id === conversation.id)?.dm_chats?.[0]?.chat_uuid }
}

afterEach(cleanup)

describe("a conversation's row in the list, opened when the list's answer lacked it", () => {
  it("shows a DM's last message where it stands, not 'No messages yet'", () => {
    const { order, preview } = open(MAYA, [row("ana sam", [chat("a1", "Lunch?")])], [chat("m1", "Hi"), chat("m2", "The launch moved to Thursday")])
    expect(preview).toBe("m2")
    expect(order).toEqual(["ana sam", "maya sam"])
  })

  it("shows a group's last message the same way", () => {
    const { order, preview } = open(LAUNCH, [row("ana sam", [chat("a1", "Lunch?")])], [chat("g1", "Kickoff at 10"), chat("g2", "Slides are up")])
    expect(preview).toBe("g2")
    expect(order).toEqual(["ana sam", "launch"])
  })

  it("keeps the preview the list's answer gave it", () => {
    expect(open(MAYA, [row("maya sam", [chat("m0", "Ship it")])], [chat("m1", "Hi")]).preview).toBe("m0")
  })

  it("stays empty for a conversation with no messages yet", () => {
    expect(open(MAYA, [], []).preview).toBeUndefined()
  })
})
