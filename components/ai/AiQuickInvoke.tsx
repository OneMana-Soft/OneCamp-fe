"use client"

/**
 * AiQuickInvoke — a global keyboard shortcut (Ctrl/Cmd+J) that opens the AI
 * assistant from anywhere, preloaded with the surface the user is currently
 * looking at so its starter prompts are context-aware ("Summarize this doc",
 * "What decisions were made in this channel?").
 *
 * Mounted once near the app root. Pairs with the Ctrl/Cmd+K command palette
 * (search / jump to / create): K is "find things", J is "ask AI". Pressing the
 * shortcut while the assistant is already open toggles it closed, so it doubles
 * as a quick dismiss.
 *
 * The actual AskAI call (RAG over the user's accessible content) is unchanged
 * and already permission-scoped; this only changes how fast you can reach it.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { openRightPanel, closeRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { withAI } from "@/components/common/withFeature"

// surfaceTypeFromPath maps the current route to a coarse surface type the
// assistant uses to tailor its starter suggestions. Returns "" for generic
// pages (home, settings, ...), where the default suggestions apply.
function surfaceTypeFromPath(pathname: string | null): string {
  if (!pathname) return ""
  const p = pathname
  if (p.startsWith("/app/channel/")) return "channel"
  if (p.startsWith("/app/doc/")) return "doc"
  if (p.startsWith("/app/task/")) return "task"
  if (p.startsWith("/app/board/")) return "board"
  if (p.startsWith("/app/tables/")) return "table"
  if (p.startsWith("/app/chat/")) return "chat"
  if (p.startsWith("/app/project/")) return "project"
  return ""
}

function AiQuickInvoke() {
  const dispatch = useDispatch()
  const pathname = usePathname()
  const isAiOpen = useSelector(
    (s: RootState) => s.rightPanel.rightPanelState.isOpen && s.rightPanel.rightPanelState.data.aiChatOpen,
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+J — avoid clobbering the Ctrl/Cmd+K palette. Ignore when a
      // modifier-laden combo we don't own is pressed (alt/shift) so it stays
      // a precise, predictable shortcut.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== "j") return
      // Left alone when something under the focus already used the key (the
      // reaction picker walks its grid with Ctrl J), or a page did: a table's
      // Ctrl J opens its switcher.
      if (e.defaultPrevented) return
      e.preventDefault()
      if (isAiOpen) {
        dispatch(closeRightPanel())
      } else {
        dispatch(openRightPanel({ aiChatOpen: true, aiContextType: surfaceTypeFromPath(pathname) }))
      }
    }
    // On the window, so it hears the key after every listener on the document,
    // whatever order they were added in. On the document it ran first whenever
    // a table's own listener was added after it (as each change to the page
    // adds it again): the panel opened beside the table switcher, and its field
    // took the letters typed for the switcher (tableKeys.spec :89, 1 Nov).
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dispatch, pathname, isAiOpen])

  return null
}

// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export default withAI(AiQuickInvoke)
