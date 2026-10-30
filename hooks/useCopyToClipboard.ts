"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "@/hooks/use-toast"

/**
 * Copies text, saying so in a toast when given a message; false when the
 * browser refused. A plain function, so a surface that loads on first use (the
 * calendar's event menu, its view options) copies without the hook.
 */
export async function copyToClipboard(text: string, message?: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text)
        } else {
            const ta = document.createElement("textarea")
            ta.value = text
            ta.setAttribute("readonly", "")
            ta.style.position = "fixed"
            ta.style.top = "0"
            ta.style.left = "0"
            ta.style.opacity = "0"
            document.body.appendChild(ta)
            ta.focus()
            ta.select()
            document.execCommand("copy")
            document.body.removeChild(ta)
        }
        if (message) {
            toast({
                title: "Copied",
                description: message,
            })
        }
        return true
    } catch (err) {
        console.error("[v0] Clipboard copy failed:", (err as Error)?.message)
        return false
    }
}

/** copyToClipboard, and whether it copied in the last `timeout` ms (a button's "Copied"). */
export function useCopyToClipboard(timeout = 2000) {
    const [copied, setCopied] = useState(false)
    const timerRef = useRef<number | null>(null)

    const copy = useCallback(
        async (text: string, message?: string) => {
            const ok = await copyToClipboard(text, message)
            setCopied(ok)
            if (ok) {
                if (timerRef.current) window.clearTimeout(timerRef.current)
                timerRef.current = window.setTimeout(() => setCopied(false), timeout)
            }
            return ok
        },
        [timeout],
    )

    return { copied, copy }
}
