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

export default function AiQuickInvoke() {
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
      e.preventDefault()
      if (isAiOpen) {
        dispatch(closeRightPanel())
      } else {
        dispatch(openRightPanel({ aiChatOpen: true, aiContextType: surfaceTypeFromPath(pathname) }))
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dispatch, pathname, isAiOpen])

  return null
}
