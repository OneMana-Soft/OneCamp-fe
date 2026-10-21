// Where you are in a conversation, and Mark unread (chat A3,
// router/chatConversations.go): GET .../read-state and POST .../unread.

import type { Dispatch } from "@reduxjs/toolkit"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { conversationPath } from "@/lib/conversation/conversationPath"
import { holdUnread, releaseUnread } from "@/lib/conversation/unreadHold"
import { applyReadMoved } from "@/lib/conversation/readMoved"

type Kind = "channel" | "dm" | "group"

/** Where you are: unread, the first unread message, since when. */
export interface ReadPosition {
  unread: number
  first_unread?: string
  since?: string
}

/** Marks message, and what follows it (your own excepted), unread; answers where you now are. */
export async function markUnread(kind: Kind, id: string, message: string): Promise<ReadPosition> {
  const res = await axiosInstance.post<{ data: ReadPosition }>(conversationPath(kind, id, "unread"), { from: message }, OWN_ERRORS)
  return res.data.data
}

/**
 * Mark unread from a message: the conversation is held unread while it's open
 * (lib/conversation/unreadHold), and its badge and line move at once, as in
 * every other tab (read.moved). False when it couldn't be done; the hold is
 * let go then.
 */
export async function markUnreadFrom(dispatch: Dispatch, kind: Kind, id: string, message: string): Promise<boolean> {
  holdUnread(id)
  try {
    const at = await markUnread(kind, id, message)
    applyReadMoved(dispatch, { kind, id, unread: at.unread, first_unread: at.first_unread })
    return true
  } catch {
    releaseUnread(id)
    return false
  }
}
