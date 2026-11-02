"use client"

/**
 * Raised hands (a board's, miro-24), first raised first, as Here now and a board's React tray list them: each with its
 * place, and Lower for whoever may (an editor, for anyone's; each person, for their own). The hands are presence's
 * (presence/people reads each person's, presence/hands queues them); lowering is the bus's control (presence/control). Draws
 * nothing while no hand is up.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { usePresence } from "./store"
import { handsUp } from "./hands"
import { usePresenceControl } from "./control"

export function HandQueue({ docId, busKey, divider }: { docId: string; busKey: string; divider: "before" | "after" }) {
  const presence = usePresence(docId)
  const control = usePresenceControl(busKey)
  const hands = handsUp(presence?.people)
  if (hands.length === 0) return null
  const line = <div role="separator" className="shell-menu-sep" />
  return (
    <>
      {divider === "before" && line}
      <section aria-label="Raised hands" data-hand-queue="">
        <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Raised hands</p>
        <ol>
          {hands.map((h, i) => {
            const you = h.id === presence?.self
            const lower = you ? control?.hand && (() => control.hand?.set(false)) : control?.lower && (() => control.lower?.(h.client))
            return (
              <li key={h.id} data-hand-row={h.id} className="flex min-h-9 items-center gap-2 rounded-lg px-2">
                <span className="w-4 shrink-0 text-center text-meta tabular-nums text-ink-3">{i + 1}</span>
                <span aria-hidden="true" className="text-ui leading-none">
                  ✋
                </span>
                <span className="min-w-0 flex-1 truncate text-ui font-[450] text-ink">{you ? "You" : h.name}</span>
                {lower && (
                  <RowButton label={you ? "Lower your hand" : `Lower ${h.name}'s hand`} onClick={lower}>
                    Lower
                  </RowButton>
                )}
              </li>
            )
          })}
        </ol>
      </section>
      {divider === "after" && line}
    </>
  )
}

/** A row's small action in Here now's lists: Jump to, Follow, Lower. Each names whom it is for. */
export function RowButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-6 rounded-md px-2 text-meta font-medium outline-none transition-colors duration-[140ms] focus-visible:ring-2 focus-visible:ring-brand",
        pressed ? "bg-brand-muted text-brand-text" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  )
}
