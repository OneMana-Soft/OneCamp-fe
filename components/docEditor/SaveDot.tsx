"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"
import { clockTime } from "@/lib/utils/date/clock"

/**
 * Where a doc, board or table stands with saving (content.md D12): one 6 px
 * dot beside the title instead of a footer that says "Saving…".
 *
 * - saved: moss. The tooltip says when it was stored. A live doc's dot turns
 *   saved only once the database holds this tab's edits (docSaveState.ts), so
 *   the time is the server's "stored at"; a live board without one says
 *   "Saved to the live doc".
 * - saving: ink-3, breathing. Shown only once a save has been pending for
 *   700 ms, so fast saves never flicker it.
 * - connecting: an ink-4 ring. The live copy isn't joined yet and the reader
 *   is on the saved snapshot. Never the word "Saving".
 * - offline: a sun ring and "Offline", with how many changes wait to sync.
 * - reconnecting: the same while the device is online and only the live
 *   connection dropped, said as the connection pill says it, "Reconnecting".
 * - failed: a danger disc and "Not saved", a button that retries.
 */
export type SaveState = "saved" | "saving" | "connecting" | "offline" | "reconnecting" | "failed"

/** Whether the state is one where changes wait to sync: offline or reconnecting. Pure. */
export const disconnected = (state: SaveState): boolean => state === "offline" || state === "reconnecting"

/** What a save dot speaks of: a doc, or a board, which keeps the doc's rule and words. */
export type SavedThing = "doc" | "board"

export interface SaveDotProps {
  state: SaveState
  /** When the last save landed: for a live doc, when the server stored it. */
  savedAt?: Date | null
  /** A live, collaborative copy (the doc's Yjs). */
  live?: boolean
  /** What is saved, for the words (a doc by default). */
  thing?: SavedThing
  onRetry?: () => void
  className?: string
}

const SAVING_DELAY_MS = 700

/** The time of day, as the reader writes it (lib/utils/date/clock: their locale and hour cycle). */
const timeOf = (d: Date): string => clockTime(d)

/** What becomes of a disconnected doc's work, in the one wording the dot, its phone notice and the connection pill share. */
export const CHANGES_KEPT = "Changes are kept and will sync"

export function saveDotCopy(state: SaveState, savedAt?: Date | null, live?: boolean, thing: SavedThing = "doc"): string {
  switch (state) {
    case "saved":
      if (savedAt) return `Saved · ${timeOf(savedAt)}`
      return live ? `Saved to the live ${thing}` : "Saved"
    case "saving":
      return "Saving your changes"
    case "connecting":
      return "Connecting… you're reading the saved copy"
    case "offline":
    case "reconnecting":
      // No count: what waits is a count of keystrokes, which tells a reader nothing (V-21, design review).
      return `${state === "offline" ? "Offline" : "Reconnecting"}. ${CHANGES_KEPT}`
    case "failed":
      return "Not saved. Select to try again"
  }
}

function SaveDotView({ state, savedAt, live, thing, onRetry, className }: SaveDotProps) {
  // "saving" shows only after it has lasted; until then the dot keeps what it
  // showed before (usually saved).
  const [shown, setShown] = React.useState<SaveState>(state === "saving" ? "saved" : state)
  const landed = React.useRef(false)
  React.useEffect(() => {
    if (state !== "saving") {
      landed.current = shown === "saving" && state === "saved"
      setShown(state)
      return
    }
    const t = window.setTimeout(() => setShown("saving"), SAVING_DELAY_MS)
    return () => window.clearTimeout(t)
    // shown is read only to decide the landing spring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const copy = saveDotCopy(shown, savedAt, live, thing)
  const dot = (
    <span
      aria-hidden="true"
      data-save-state={shown}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        shown === "saved" && "bg-camp-moss",
        shown === "saved" && landed.current && "content-save-land",
        shown === "saving" && "content-save-pulse bg-ink-3",
        shown === "connecting" && "ring-[1.5px] ring-inset ring-ink-4",
        disconnected(shown) && "ring-[1.5px] ring-inset ring-camp-sun",
        shown === "failed" && "bg-destructive",
      )}
    />
  )

  const label =
    disconnected(shown) ? (
      <span className="content-slide-in text-meta font-medium text-camp-sun-ink">{shown === "offline" ? "Offline" : "Reconnecting"}</span>
    ) : shown === "failed" ? (
      <span className="content-slide-in text-meta font-medium text-danger-ink">Not saved</span>
    ) : null

  const body = (
    <>
      {dot}
      {label}
      <span className="sr-only" aria-live="polite">
        {copy}
      </span>
    </>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {shown === "failed" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-save-dot=""
            className={cn("inline-flex h-5 items-center gap-1.5 rounded-sm px-1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand", className)}
          >
            {body}
          </button>
        ) : (
          <span data-save-dot="" tabIndex={0} className={cn("inline-flex h-5 items-center gap-1.5 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-brand", className)}>
            {body}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{copy}</TooltipContent>
    </Tooltip>
  )
}

/** Renders only when what it shows changes: the doc's dot is drawn by a host that renders on every key (DocHeader's DocSaveDot). */
export const SaveDot = React.memo(SaveDotView)
