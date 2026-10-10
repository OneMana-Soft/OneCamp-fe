"use client"

import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { useSplitActions } from "@/hooks/useSplitView"
import { isCallPane } from "@/lib/split"

/**
 * While one view is focused: in the top bar, a quiet way back to all of them,
 * and word of a call still running out of sight. In the bar it covers nothing
 * (at the bottom of the page it sat on the message box).
 */
export function FocusPill() {
  const run = useSplitActions()
  const { panes, focused } = useSelector((s: RootState) => s.split)
  if (focused === null || panes.length === 0) return null
  const callHidden = panes.some((p, i) => isCallPane(p) && i !== focused)
  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-full border border-border/70 bg-background pl-3 pr-1 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0">
      {callHidden ? (
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" />
          On a call
        </span>
      ) : (
        <span>One view</span>
      )}
      <button
        type="button"
        onClick={() => run({ type: "focus" })}
        title="Show every view (Ctrl+Alt+Enter)"
        className="rounded-full px-2 py-1 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        Show all
      </button>
    </div>
  )
}
