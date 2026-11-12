"use client"

import { isHeldUnread, releaseUnread } from "@/lib/conversation/unreadHold"
import { useEffect, useRef } from "react"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { ChatTarget } from "@/lib/chat/conversation"
import { receiptsKey, type Receipts } from "@/lib/chat/readReceipts"
import { clearChatUnread } from "@/services/unreadCache"
import { whenOnScreen } from "@/lib/ui/whenOnScreen"

/** Who has seen a conversation (lib/chat/readReceipts); kept live by MESSAGE_CHAT_SEEN. */
export function useChatReceipts(target: ChatTarget | null) {
  return useFetch<{ data: Receipts }>(target ? receiptsKey(target) : "")
}


/**
 * Marks a DM or group seen now (key: its receipts key, lib/chat/readReceipts
 * receiptsKey); once the server has it, its cached counts (groupingId) clear.
 * Best-effort and silent, as every automatic mark.
 */
export function markChatSeen(key: string, groupingId: string): Promise<void> {
  return axiosInstance
    .post(key, {}, OWN_ERRORS)
    .then(() => clearChatUnread(groupingId))
    .catch(() => {})
}

/**
 * Marks the conversation seen while it's on screen (lib/ui whenOnScreen): when
 * it opens, and when someone else's message arrives in it (arrived: the newest
 * such message; one's own needs no mark, as sending it marked the
 * conversation), each waiting while the window is hidden for it to come back
 * into view, so a chat left open in a background tab isn't "seen".
 * The others see it at once (MESSAGE_CHAT_SEEN).
 * The mark is what unread counts are kept against, so once the server has it,
 * the cached counts for the conversation (groupingId) are cleared too.
 */
export function useMarkChatSeen(target: ChatTarget | null, arrived: string, groupingId: string) {
  const key = target ? receiptsKey(target) : ""
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Opening it reads it, even after a Mark unread (B27).
  useEffect(() => {
    if (groupingId) releaseUnread(groupingId)
  }, [groupingId])

  useEffect(() => {
    if (!key) return
    const cancel = whenOnScreen(() => {
      // Marked unread: nothing marks it read until it is opened again.
      if (isHeldUnread(groupingId)) return
      if (timer.current) clearTimeout(timer.current)
      // A burst of messages is one mark.
      timer.current = setTimeout(() => void markChatSeen(key, groupingId), 600)
    })
    return () => {
      cancel()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [key, arrived, groupingId])
}
