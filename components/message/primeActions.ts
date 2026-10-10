"use client"

import { useEffect, useState } from "react"

// Once per page: the first row to ask builds the toolbar; no other row does.
let primed = false

/**
 * Whether this row should build its actions toolbar once, hidden, right now.
 *
 * Since the toolbar is built on hover (it no longer sits hidden under every
 * row), the first hover of a session was the first time its code ran at all:
 * one long task just as the person reached for a message. A thread opened
 * from the first message pointed at took about 150 ms instead of 80, and
 * over a second with the CPU slowed 4x. The first row to mount asks for an
 * idle moment and builds the toolbar there, out of sight, then drops it, so
 * that first run happens while nobody is waiting. Browsers without
 * requestIdleCallback (and tests) skip it and behave as before.
 */
export function usePrimeActions(): boolean {
    const [priming, setPriming] = useState(false)

    useEffect(() => {
        if (primed || typeof window.requestIdleCallback !== "function") return
        primed = true
        let ran = false
        const handle = window.requestIdleCallback(
            () => {
                ran = true
                setPriming(true)
            },
            { timeout: 2000 },
        )
        return () => {
            window.cancelIdleCallback?.(handle)
            // Unmounted before the idle moment came: let the next row ask.
            if (!ran) primed = false
        }
    }, [])

    // Built and committed once; dropped on the next task.
    useEffect(() => {
        if (!priming) return
        const id = window.setTimeout(() => setPriming(false), 0)
        return () => window.clearTimeout(id)
    }, [priming])

    return priming
}
