"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useConfirm } from "@/hooks/useConfirm"
import { unsavedWhat } from "@/lib/unsavedChanges"

/**
 * Asks before a link inside the app leaves changes unsaved.
 *
 * SaveBar asked only before the tab closed (beforeunload), so a click on any
 * link in the sidebar dropped a half-edited allow-list or email template
 * without a word. This listens for clicks on in-app links, once, at the root,
 * in the capture phase so it is ahead of the link's own handler, and while
 * something is unsaved (lib/unsavedChanges) it stops the link and asks, naming
 * what would be lost. Links out of the app, into a new tab or within the page
 * are left alone.
 */
export function UnsavedChangesGuard() {
  const confirm = useConfirm()
  const router = useRouter()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const what = unsavedWhat()
      if (!what) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      confirm({
        title: "Leave without saving?",
        description: `Your unsaved ${what} will be lost.`,
        confirmText: "Leave",
        cancelText: "Stay",
        destructive: true,
        onConfirm: () => router.push(url.pathname + url.search + url.hash),
      })
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [confirm, router])

  return null
}
