"use client"

import { X } from "@/lib/icons"

interface ComposerReplyPillProps {
  // Author name of the message being replied to.
  authorName?: string
  // Plain-text snippet of the message being replied to.
  text?: string
  // Dismiss the reply target (non-destructive to the draft).
  onCancel: () => void
}

// ComposerReplyPill renders the Discord-style "Replying to <name>: <snippet>"
// chip shown above a message composer. Shared across channel / DM / group and
// desktop / mobile so the reply affordance stays visually consistent.
export function ComposerReplyPill({ authorName, text, onCancel }: ComposerReplyPillProps) {
  return (
    <div className="mx-2 mb-1 flex items-center gap-2 rounded-md border-l-2 border-primary/50 bg-muted/40 px-2 py-1 text-xs">
      <span className="text-muted-foreground">Replying to</span>
      <span className="font-medium text-foreground">{authorName || "message"}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{text || ""}</span>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
        aria-label="Cancel reply"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  )
}
