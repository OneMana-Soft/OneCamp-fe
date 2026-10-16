"use client"

/**
 * Runs an open doc's live meta events (hooks/useDocMetaEvents): no UI of its
 * own. A session-slot contribution, so every open doc has one.
 */
import { useDocMetaEvents } from "@/hooks/useDocMetaEvents"

export default function DocMetaEvents({ docId }: { docId: string }) {
    useDocMetaEvents(docId)
    return null
}
