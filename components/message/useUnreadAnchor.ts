"use client"

import { useEffect, useRef, useState } from "react"
import { firstUnreadKey } from "@/lib/chat/unreadDivider"

/** The window event a moved read marker raises (lib/conversation/readMoved). */
export const READ_MOVED_EVENT = "onecamp:read-moved"

/** A conversation's id and how to tell a message's uuid: where Mark unread can move the line. */
export interface MovableAnchor<T> {
  conversation: string
  idOf: (m: T) => string | undefined
}

/**
 * The message the "New" line sits above, fixed the first time the
 * conversation has messages: it stays put while new ones arrive below and
 * older ones load above (counted again each time, it would creep down the
 * conversation with every new message). With movable, a Mark unread here or
 * on another tab or device (read.moved) moves it to the message named.
 */
export function useUnreadAnchor<T>(
  messages: readonly T[],
  unreadOnOpen: number | undefined,
  isMine: (m: T) => boolean,
  keyOf: (m: T) => string,
  movable?: MovableAnchor<T>,
): string | null {
  const anchor = useRef<string | null | undefined>(undefined)
  const [movedTo, setMovedTo] = useState<string | null>(null)
  const conversation = movable?.conversation
  useEffect(() => {
    if (!conversation) return
    const onMoved = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; first_unread?: string }>).detail
      if (d?.id === conversation && d.first_unread) setMovedTo(d.first_unread)
    }
    window.addEventListener(READ_MOVED_EVENT, onMoved)
    return () => window.removeEventListener(READ_MOVED_EVENT, onMoved)
  }, [conversation])
  if (movedTo && movable) {
    const at = messages.find((m) => movable.idOf(m) === movedTo)
    if (at) return keyOf(at)
  }
  if (anchor.current === undefined && messages.length > 0 && unreadOnOpen !== undefined) {
    anchor.current = firstUnreadKey(messages, unreadOnOpen, isMine, keyOf)
  }
  return anchor.current ?? null
}
