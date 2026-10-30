"use client"

import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

/**
 * Reads what came after a conversation's newest message, once, when a
 * connection's subscriptions are answered (messageResync.catchUpNonce). The
 * conversation was read before they were, so a message sent in between was in
 * neither its first read nor the live stream: on every cold open, a post in
 * the ~220 ms before the subscription was lost (FLUIDITY-LEAD-8, 22 Oct 2026).
 *
 * `ready`: the conversation's own first read is in, and it shows the latest
 * (not parked on an older message). A signal that comes first waits for it.
 * Signals from before the conversation opened aren't its own: it read after them.
 */
export function useMessageCatchUp(readNewer: () => void, ready: boolean) {
    const nonce = useSelector((state: RootState) => state.messageResync.catchUpNonce)
    const handled = useRef(nonce)
    const read = useRef(readNewer)
    useEffect(() => {
        read.current = readNewer
    })
    useEffect(() => {
        if (!ready || nonce === handled.current) return
        handled.current = nonce
        read.current()
    }, [nonce, ready])
}
