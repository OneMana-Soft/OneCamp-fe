"use client"

import { useRef } from "react"
import { firstUnreadKey } from "@/lib/chat/unreadDivider"

/**
 * The message the "New" line sits above, fixed the first time the
 * conversation has messages: it stays put while new ones arrive below and
 * older ones load above (counted again each time, it would creep down the
 * conversation with every new message).
 */
export function useUnreadAnchor<T>(
  messages: readonly T[],
  unreadOnOpen: number | undefined,
  isMine: (m: T) => boolean,
  keyOf: (m: T) => string,
): string | null {
  const anchor = useRef<string | null | undefined>(undefined)
  if (anchor.current === undefined && messages.length > 0) {
    anchor.current = firstUnreadKey(messages, unreadOnOpen || 0, isMine, keyOf)
  }
  return anchor.current ?? null
}
