"use client"

import * as React from "react"
import type { RecoveredEdits } from "@/hooks/useCollaborationProvider"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Edits this tab made that the server never confirmed, kept when the tab had
 * to drop its copy of the doc because the doc changed underneath it (restored,
 * or rewritten, while the tab was away). Merging the two copies would have put
 * every block in twice, so the edits are offered here instead, to copy back by
 * hand. Non-blocking: the doc is live and editable above it.
 */
export function RecoveredEditsBanner({ recovered, onDismiss, className }: { recovered: RecoveredEdits; onDismiss: () => void; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([recovered.html], { type: "text/html" }),
            "text/plain": new Blob([recovered.text], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(recovered.text)
      }
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const btn = "h-6 shrink-0 rounded-[6px] px-2 text-2xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  return (
    <div
      role="status"
      aria-live="polite"
      data-recovered-edits=""
      className={cn("mx-5 my-2 flex items-center gap-3 rounded-[12px] bg-raised px-3.5 py-2 text-ui-sm text-ink shadow-e1", className)}
    >
      <span className="min-w-0 flex-1">
        This doc changed while you were away, so your unsaved edits weren&apos;t added to it. Copy them to put them back.
      </span>
      <button type="button" onClick={copy} className={cn(btn, "bg-brand text-brand-foreground shadow-primary")}>
        {copied ? "Copied" : "Copy your edits"}
      </button>
      <button type="button" onClick={onDismiss} className={cn(btn, "text-ink-3 hover:text-ink")}>
        Dismiss
      </button>
    </div>
  )
}
