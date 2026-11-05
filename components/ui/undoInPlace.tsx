"use client"

// A change offered back in place, beside its tick, where a toast would lie
// over the next step (main, 3 Nov 02:0x: a toast must never block the next
// step; at 390 the toast sat over a new row's actions for its 8 s). It is the
// toast's offer (UndoOffer, design-14) for any card that saves at once: Undo
// stays as long as the toast's does, takes the change back through the card's
// own way back, then says "Undone" with the saved tick, or why it couldn't in
// the toast's words (a 503 offers Retry, as the toast's does). An undo is
// never offered back.
//
// A card adopts it beside its tick: `const back = useUndoInPlace()`; once its
// own save held, `back.offer({ what, undo })`; `<UndoInPlace back={back} />`
// where the tick is; `back.clear()` when the row changes again. It loads with
// the card that imports it, never with a route's first load.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { reasonOf, type UndoOffer } from "@/components/ui/saveStatus"
import { Check } from "@/lib/icons"
import { apiErrorStatus } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"

/** An offer in place stays as long as the toast's does (undoToast). */
export const UNDO_MS = 8000
/** "Undone" stays as long as a save's tick does (saveStatus: 1.6 s and its fade). */
const UNDONE_MS = 1900

/** Where an offer in place stands. A failure keeps its offer, so a 503's Retry has the same go again. */
export type UndoInPlaceState =
  | { at: "idle" }
  | { at: "offered"; offer: UndoOffer }
  | { at: "taking"; offer: UndoOffer }
  | { at: "undone" }
  | { at: "failed"; offer: UndoOffer; reason: string; again: boolean }

export interface UndoInPlaceBack {
  state: UndoInPlaceState
  /** Offers a held change back for UNDO_MS. Never while one is being taken: an undo isn't offered back. */
  offer: (offer: UndoOffer) => void
  /** Takes the offered change back, or has another go when the server asked for one. */
  take: () => Promise<void>
  /** Puts the offer away: the row changed again, so Undo would take back what it no longer shows. */
  clear: () => void
}

/** One row's offer in place: what `<UndoInPlace>` shows. */
export function useUndoInPlace(): UndoInPlaceBack {
  const [state, setState] = React.useState<UndoInPlaceState>({ at: "idle" })
  // The state as it is now, for an offer made from a closure a render old (an undo that runs the card's own change).
  const now = React.useRef<UndoInPlaceState>(state)
  const timer = React.useRef<number | undefined>(undefined)
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  // Moves to `next`, and back to rest after `ms` when it's given.
  const set = React.useCallback((next: UndoInPlaceState, ms = 0) => {
    window.clearTimeout(timer.current)
    now.current = next
    if (!mounted.current) return
    setState(next)
    if (ms > 0)
      timer.current = window.setTimeout(() => {
        now.current = { at: "idle" }
        if (mounted.current) setState(now.current)
      }, ms)
  }, [])

  const offer = React.useCallback(
    (o: UndoOffer) => {
      if (now.current.at !== "taking") set({ at: "offered", offer: o }, UNDO_MS)
    },
    [set],
  )

  const take = React.useCallback(async () => {
    const was = now.current
    if (was.at !== "offered" && !(was.at === "failed" && was.again)) return
    const o = was.offer
    set({ at: "taking", offer: o })
    try {
      // false: it didn't hold, and the row's own save has said why (the toast's words for it).
      if ((await o.undo()) === false) set({ at: "failed", offer: o, reason: "Its row says why.", again: false })
      else set({ at: "undone" }, UNDONE_MS)
    } catch (err) {
      // A retry-later answer (503: the server kept the work and asks for another go) offers Retry.
      set({ at: "failed", offer: o, reason: reasonOf(err), again: apiErrorStatus(err) === 503 })
    }
  }, [set])

  const clear = React.useCallback(() => {
    if (now.current.at !== "idle" && now.current.at !== "taking") set({ at: "idle" })
  }, [set])

  return React.useMemo(() => ({ state, offer, take, clear }), [state, offer, take, clear])
}

/**
 * The offer beside a row's tick: Undo while it stands, "Undoing…" while it is
 * taken, then "Undone" with the saved tick, or why not in danger ink (with
 * Retry when the server asks for another go). A polite live region says how it
 * went. Nothing shows at rest, so the row never moves for it.
 */
export function UndoInPlace({ back, className }: { back: UndoInPlaceBack; className?: string }) {
  const { state, take } = back
  const wrap = React.useRef<HTMLSpanElement>(null)
  const go = () => {
    // The button leaves while its undo is taken: a keyboard's place stays where it was, not at the page's top.
    wrap.current?.focus()
    void take()
  }
  const head = state.at === "failed" ? (state.again ? "Undo didn't finish." : "Couldn't undo that.") : ""
  return (
    <>
      {state.at !== "idle" && (
        <span ref={wrap} tabIndex={-1} data-undo-in-place="" className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 outline-none", className)}>
          {state.at === "offered" && (
            <Button type="button" variant="link" size="xs" className="-my-1 px-1" aria-label={`Undo: ${state.offer.what}`} onClick={go}>
              Undo
            </Button>
          )}
          {state.at === "taking" && <span className="text-2xs text-muted-foreground">Undoing…</span>}
          {state.at === "undone" && (
            <span data-saved-tick="" aria-hidden="true" className="saved-tick text-2xs font-medium">
              <Check className="size-3.5" />
              Undone
            </span>
          )}
          {state.at === "failed" && (
            <>
              <span data-undo-failed="" aria-hidden="true" className="text-xs text-danger-ink text-pretty">
                {head} <span>{state.reason}</span>
              </span>
              {state.again && (
                <Button type="button" variant="link" size="xs" className="-my-1 px-1" aria-label={`Retry: ${state.offer.what}`} onClick={go}>
                  Retry
                </Button>
              )}
            </>
          )}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state.at === "undone" ? "Undone" : state.at === "failed" ? `${head} ${state.reason}` : ""}
      </span>
    </>
  )
}
