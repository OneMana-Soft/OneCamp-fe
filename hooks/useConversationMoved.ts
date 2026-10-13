"use client"

import { useEffect, useRef } from "react"
import { CONVERSATION_MOVED_EVENT, type ConversationKind, type ConversationMoved } from "@/lib/mqtt/conversationAccess"

/**
 * Follows a conversation to its new id. A group's id is its members' hash, so
 * when someone is added it has a new one: a view open on the old id showed a
 * conversation nothing was sent to any more (lib/mqtt/conversationAccess).
 * onMoved gets the new id when the conversation open here (kind, id) moves.
 */
export function useConversationMoved(kind: ConversationKind | null, id: string | undefined, onMoved: (to: string) => void) {
    const onMovedRef = useRef(onMoved)
    useEffect(() => {
        onMovedRef.current = onMoved
    })
    useEffect(() => {
        if (!kind || !id) return
        const listen = (event: Event) => {
            const moved = (event as CustomEvent<ConversationMoved>).detail
            if (moved && moved.kind === kind && moved.from === id && moved.to && moved.to !== id) onMovedRef.current(moved.to)
        }
        window.addEventListener(CONVERSATION_MOVED_EVENT, listen)
        return () => window.removeEventListener(CONVERSATION_MOVED_EVENT, listen)
    }, [kind, id])
}
