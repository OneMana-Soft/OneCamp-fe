"use client"

import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { useSplitActions } from "@/hooks/useSplitView"
import { isCallPane } from "@/lib/split"

/**
 * While one view is focused (design v3, shell V2): in that view's own bar, a
 * 24px "One view" chip and a ghost Show all, and word of a call still running
 * out of sight (the moss dot breathes). The top bar that held it is gone.
 */
export function FocusPill() {
  const run = useSplitActions()
  const { panes, focused } = useSelector((s: RootState) => s.split)
  if (focused === null || panes.length === 0) return null
  const callHidden = panes.some((p, i) => isCallPane(p) && i !== focused)
  return (
    <div className="inline-flex items-center gap-1" data-focus-pill="">
      <span className="inline-flex h-6 items-center gap-1.5 rounded-[6px] bg-press px-2 text-2xs font-medium text-ink-2">
        {callHidden && <span aria-hidden className="shell-call-dot" />}
        {callHidden ? "On a call" : "One view"}
      </span>
      <button
        type="button"
        onClick={() => run({ type: "focus" })}
        title="Show every view (Ctrl+Alt+Enter)"
        className="h-6 rounded-[6px] px-2 text-2xs font-medium text-ink-2 transition-colors duration-[140ms] hover:bg-hover hover:text-ink hover:duration-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Show all
      </button>
    </div>
  )
}
