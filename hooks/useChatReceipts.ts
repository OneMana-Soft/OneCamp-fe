"use client"

import { useEffect, useRef } from "react"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import type { ChatTarget } from "@/lib/chat/conversation"
import { receiptsKey, withSeen, type Receipts } from "@/lib/chat/readReceipts"
import { clearChatUnread } from "@/services/unreadCache"

/** Who has seen a conversation (lib/chat/readReceipts); kept live by MESSAGE_CHAT_SEEN. */
export function useChatReceipts(target: ChatTarget | null) {
  return useFetch<{ data: Receipts }>(target ? receiptsKey(target) : "")
}

/** Folds a live receipt (MESSAGE_CHAT_SEEN) into the open conversation's receipts. */
export function applySeenEvent(key: string, userUUID: string, at: string) {
  void appMutate(
    key,
    (current: { data?: Receipts } | undefined) => (current?.data ? { ...current, data: withSeen(current.data, userUUID, at) } : current),
    { revalidate: false },
  )
}

/**
 * Marks the conversation seen while it's on screen: when it opens, when the
 * window comes back into view, and when someone else's message arrives in it
 * (arrived: the newest such message; one's own needs no mark, as sending it
 * marked the conversation).
 * The others see it at once (MESSAGE_CHAT_SEEN). Nothing is marked while the
 * window is hidden, so a chat left open in a background tab isn't "seen".
 * The mark is what unread counts are kept against, so once the server has it,
 * the cached counts for the conversation (groupingId) are cleared too.
 */
export function useMarkChatSeen(target: ChatTarget | null, arrived: string, groupingId: string) {
  const key = target ? receiptsKey(target) : ""
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!key) return
    const mark = () => {
      if (document.visibilityState !== "visible") return
      if (timer.current) clearTimeout(timer.current)
      // A burst of messages is one mark.
      timer.current = setTimeout(() => {
        void axiosInstance
          .post(key, {}, OWN_ERRORS)
          .then(() => clearChatUnread(groupingId))
          .catch(() => {})
      }, 600)
    }
    mark()
    const onVisible = () => mark()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [key, arrived, groupingId])
}
