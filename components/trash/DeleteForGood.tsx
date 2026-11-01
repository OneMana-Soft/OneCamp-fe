"use client"

// Delete for good, from a trash: the one button and confirmation docs' trash
// and the tables' trash share (V-121), so both ask the same way. It sits
// before Restore, so every row's Restore lines up at the end. On a phone it is
// its icon at a full touch size; from sm up, its words. Nothing is deleted
// until the confirmation is accepted.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/hooks/useConfirm"
import { Loader2, Trash2 } from "@/lib/icons"

export interface DeleteForGoodProps {
  /** What goes, as the person knows it: the button's label and the confirmation quote it. */
  name: string
  /** The confirmation's words: what goes with it, and that nobody can bring it back. */
  warning: string
  /** This one is being deleted for good. */
  busy?: boolean
  disabled?: boolean
  /** Deletes it for good, once the person has confirmed. */
  onDelete: () => Promise<void>
}

export function DeleteForGood({ name, warning, busy = false, disabled = false, onDelete }: DeleteForGoodProps) {
  const confirm = useConfirm()
  const ask = () =>
    confirm({
      title: `Delete “${name}” for good?`,
      description: warning,
      confirmText: "Delete for good",
      destructive: true,
      onConfirm: onDelete,
    })
  return (
    <Button size="sm" variant="ghost" onClick={ask} disabled={disabled} aria-label={`Delete “${name}” for good`} className="shrink-0 text-danger-ink max-sm:size-11 max-sm:p-0">
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4 sm:hidden" aria-hidden="true" />}
      <span className="max-sm:hidden">Delete for good</span>
    </Button>
  )
}
