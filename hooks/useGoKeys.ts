"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { GO_WINDOW_MS, goTarget, isTyping } from "@/lib/goKeys"

/** G then a letter goes to a page (lib/goKeys); never while typing. */
export function useGoKeys(enabled: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    let armedAt = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target as Element | null)) return
      // A whiteboard's own keys are single letters, wherever its focus sits.
      if (/^\/app\/board\/./.test(window.location.pathname)) return
      const now = Date.now()
      if (armedAt && now - armedAt < GO_WINDOW_MS) {
        armedAt = 0
        const to = goTarget(e.key)
        if (to) {
          e.preventDefault()
          router.push(to)
        }
        return
      }
      armedAt = e.key === "g" || e.key === "G" ? now : 0
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [enabled, router])
}
