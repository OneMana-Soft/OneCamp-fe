import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { heldRows } from "@/store/conversations"
import { FillChatListPreview } from "@/store/slice/chatSlice"
import type { ConversationRef } from "@/lib/conversation/types"
import type { ChatInfo } from "@/types/chat"

/**
 * An open DM's or group's list row added without its last message (the list's
 * answer lacked it: one its person hid, say) takes the conversation's newest
 * held message, never "No messages yet" over history. Selects nothing once it
 * has one, so new messages don't redraw the page through it.
 */
export function useListPreviewFill(conversation: ConversationRef | null): void {
  const dispatch = useDispatch()
  const fill = useSelector((state: RootState) => {
    if (!conversation || conversation.kind === "channel") return undefined
    const row = state.chat.latestChatList.find((d) => d.dm_grouping_id === conversation.id)
    if (!row || row.dm_chats?.length) return undefined
    // A DM's and a group's held rows are chats.
    const held = heldRows(state, conversation) as ChatInfo[] | undefined
    return held?.[held.length - 1]
  })
  const id = conversation?.id
  useEffect(() => {
    if (id && fill) dispatch(FillChatListPreview({ grpId: id, chat: fill }))
  }, [id, fill, dispatch])
}
