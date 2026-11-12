"use client"

import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

/**
 * Reads again each time a connection's subscriptions are answered (RealtimeEngine
 * onSubscribed): what was sent before reached no one. ready: its first read is in.
 */
export function useLiveAgain(read: () => void, ready = true) {
    const nonce = useSelector((state: RootState) => state.messageResync?.catchUpNonce ?? 0)
    const handled = useRef(nonce)
    const latest = useRef(read)
    useEffect(() => {
        latest.current = read
    })
    useEffect(() => {
        if (!ready || nonce === handled.current) return
        handled.current = nonce
        latest.current()
    }, [nonce, ready])
}
