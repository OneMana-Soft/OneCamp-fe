"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { armGo, disarmGo, goArmed, goTarget, isTyping } from "@/lib/goKeys"

/** G then a letter goes to a page (lib/goKeys); never while typing. */
export function useGoKeys(enabled: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target as Element | null)) return
      // A whiteboard's own keys are single letters, wherever its focus sits.
      if (/^\/app\/board\/./.test(window.location.pathname)) return
      const now = Date.now()
      if (goArmed(now)) {
        disarmGo()
        const to = goTarget(e.key)
        if (to) {
          e.preventDefault()
          router.push(to)
        }
        return
      }
      if (e.key === "g" || e.key === "G") armGo(now)
      else disarmGo()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [enabled, router])
}
