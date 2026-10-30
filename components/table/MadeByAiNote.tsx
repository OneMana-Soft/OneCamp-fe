"use client"

/**
 * A table AI made, opened from the AI bar (?made=ai): private to its asker,
 * and its rows may come from their private messages and docs (TAB-BUG-6).
 * A chunk of its own (lazyParts' MadeByAiPart): the table route reaches it
 * only on that path, and the More menu's share item asks the same question.
 */

import * as React from "react"
import { Lock } from "@/lib/icons"
import { useConfirm } from "@/hooks/useConfirm"

/** Showing it to the workspace asks first; once it's shown, the address forgets ?made. */
export function useShowMadeByAi(show: () => Promise<unknown>) {
  const confirm = useConfirm()
  return () =>
    confirm({
      title: "Show this table to the workspace?",
      description: "Its rows may come from your private messages and docs. Everyone in the workspace will see them.",
      confirmText: "Show to the workspace",
      onConfirm: async () => {
        await show()
        const url = new URL(window.location.href)
        url.searchParams.delete("made")
        window.history.replaceState(window.history.state, "", url)
      },
    })
}

export function MadeByAiNote({ canManage, onShow }: { canManage: boolean; onShow: () => Promise<unknown> }) {
  const ask = useShowMadeByAi(onShow)
  return (
    <div role="note" data-made-by-ai="" className="mx-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-ui-sm text-ink-2 sm:mx-6">
      <Lock className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span>Only you can see this table. AI may have filled it from your private messages and docs.</span>
      {canManage ? (
        <button type="button" onClick={ask} data-touch-target="" className="rounded-sm font-medium text-brand-text hover:underline">
          Show to the workspace
        </button>
      ) : null}
    </div>
  )
}
