"use client"

import { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Search } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_AI, useAIAvailable } from "@/hooks/useClientConfig"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { RootState } from "@/store/store"
import { onPaletteState, openPalette } from "@/lib/ui/palette"
import { useModKey } from "@/hooks/useModKey"

/**
 * The search-or-ask pill and the AI button (design v3, shell S4).
 *
 * The pill is the one way into ⌘K by click (data-palette-trigger), a button
 * and not a field: the top bar's 500px inline search and its own popover are
 * retired, and their results live in the palette. It stays pressed while the
 * palette it opened is up. Beside it, the spark in the agent hue opens the AI
 * panel (⌘J). Where AI is off the button is absent and the pill reads
 * "Search": no dead controls.
 */
export function SidebarSearchRow() {
  const dispatch = useDispatch()
  const mod = useModKey()
  const aiAvailable = useAIAvailable()
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => onPaletteState(setPaletteOpen), [])

  const rightPanel = useSelector((s: RootState) => s.rightPanel.rightPanelState)
  const aiOpen = rightPanel.isOpen && !!rightPanel.data?.aiChatOpen
  const toggleAI = () => dispatch(aiOpen ? closeRightPanel() : openRightPanel({ aiChatOpen: true }))

  // ⌘J (Ctrl J) opens and closes the AI panel, as the button does. One
  // deliberate key, so the panel's own entrance plays. Left alone when
  // something under the focus already used the key (the reaction picker
  // walks its grid with Ctrl J).
  useEffect(() => {
    if (!aiAvailable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "j") return
      e.preventDefault()
      dispatch(aiOpen ? closeRightPanel() : openRightPanel({ aiChatOpen: true }))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aiAvailable, aiOpen, dispatch])

  return (
    <div className="mb-2.5 mt-2 flex items-center gap-1.5">
      <button
        type="button"
        data-palette-trigger=""
        data-open={paletteOpen ? "true" : undefined}
        onClick={() => openPalette({ mode: "search" })}
        aria-label={aiAvailable ? "Search or ask" : "Search"}
        aria-keyshortcuts="Meta+K Control+K"
        className="shell-pill min-w-0 flex-1"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{aiAvailable ? "Search or ask" : "Search"}</span>
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          <span className="kbd">{mod}</span>
          <span className="kbd">K</span>
        </span>
      </button>
      <FeatureGate feature={FEATURE_AI}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleAI}
              aria-label="Ask OneCamp AI"
              aria-pressed={aiOpen}
              aria-keyshortcuts="Meta+J Control+J"
              className="shell-ai"
            >
              <Spark size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Ask OneCamp AI<span className="shell-tip-kbd">{mod}J</span>
          </TooltipContent>
        </Tooltip>
      </FeatureGate>
    </div>
  )
}
