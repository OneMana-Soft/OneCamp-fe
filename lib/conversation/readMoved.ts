// Your read marker moved in one conversation (chat A3's read.moved, on your own
// activity topic): another tab or device read it, or you marked a message
// unread. Every badge takes the server's number, and an open conversation
// reads where you are again (conversationPath readStateKey), so all your tabs
// agree at once. A chunk of its own, fetched by the realtime handler on the
// first such event (hooks/useMqttMessageHandler).

import type { Dispatch } from "@reduxjs/toolkit"
import { resetUserChannelUnread, resetUserChatUnread } from "@/store/slice/userSlice"
import { clearChannelUnread, clearChatUnread } from "@/services/unreadCache"
import { appMutate } from "@/lib/swrMutate"
import { readStateKey } from "@/lib/conversation/conversationPath"

/** read.moved's body (business/ReadState MovedEvent). */
export interface ReadMoved {
  kind: "channel" | "dm" | "group"
  id: string
  unread: number
  first_unread?: string
}

/** The event's body, or null for one that isn't. Pure. */
export function readMovedOf(data: unknown): ReadMoved | null {
  const d = data as Partial<ReadMoved> | null
  if (!d || (d.kind !== "channel" && d.kind !== "dm" && d.kind !== "group") || typeof d.id !== "string" || !d.id) return null
  return { kind: d.kind, id: d.id, unread: Math.max(0, Number(d.unread) || 0), first_unread: typeof d.first_unread === "string" ? d.first_unread : undefined }
}

/** Applies a read.moved to the badges and an open conversation's position. */
export function applyReadMoved(dispatch: Dispatch, data: unknown): void {
  const moved = readMovedOf(data)
  if (!moved) return
  if (moved.kind === "channel") {
    dispatch(resetUserChannelUnread({ ch_uuid: moved.id, count: moved.unread }))
    clearChannelUnread(moved.id, moved.unread)
  } else {
    dispatch(resetUserChatUnread({ dm_grouping_id: moved.id, count: moved.unread }))
    clearChatUnread(moved.id, moved.unread)
  }
  void appMutate(readStateKey(moved.kind, moved.id))
  // An open conversation moves its "New" line (components/message/useUnreadAnchor).
  if (moved.first_unread && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("onecamp:read-moved", { detail: { id: moved.id, first_unread: moved.first_unread } }))
  }
}
