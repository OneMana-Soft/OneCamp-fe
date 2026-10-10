"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type React from "react"

/**
 * A row's hover actions, on a screen that cannot hover: a tap on the row shows
 * them, and a tap anywhere else puts them away.
 *
 * A message's toolbar (reply, react, more) appears on hover. A tablet has no
 * hover, so on an iPad there was no way to reply to a message, react to it or
 * reach its menu. Showing the toolbar on every message at once would put a
 * toolbar on every line, so it appears on the message you tap, as it would
 * under a mouse.
 *
 * Only a touch or a pen counts; a mouse keeps hover. A tap that lands on a
 * link, a button or a field inside the row does that thing instead.
 */
export function useTouchReveal() {
    const [revealed, setRevealed] = useState(false)
    const rowRef = useRef<Element | null>(null)

    useEffect(() => {
        if (!revealed) return
        const away = (e: PointerEvent) => {
            if (!rowRef.current?.contains(e.target as Node)) setRevealed(false)
        }
        document.addEventListener("pointerdown", away, true)
        return () => document.removeEventListener("pointerdown", away, true)
    }, [revealed])

    const onPointerUp = useCallback((e: React.PointerEvent<Element>) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return
        if ((e.target as Element).closest?.("a, button, input, textarea, select, [contenteditable='true'], [role='button'], [role='menuitem']")) return
        rowRef.current = e.currentTarget
        setRevealed(true)
    }, [])

    return { revealed, onPointerUp }
}
