"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where a doc, board or table stands with saving (content.md D12): one 6 px
 * dot beside the title instead of a footer that says "Saving…".
 *
 * - saved: moss. The tooltip says when (or "Saved to the live doc").
 * - saving: ink-4, breathing. Shown only once a save has been pending for
 *   700 ms, so fast saves never flicker it.
 * - connecting: an ink-4 ring. The live copy isn't joined yet and the reader
 *   is on the saved snapshot. Never the word "Saving".
 * - offline: a sun ring and "Offline".
 * - failed: a danger disc and "Not saved", a button that retries.
 */
export type SaveState = "saved" | "saving" | "connecting" | "offline" | "failed"

export interface SaveDotProps {
  state: SaveState
  /** When the last save landed. */
  savedAt?: Date | null
  /** A live, collaborative copy (the doc's Yjs): "Saved to the live doc". */
  live?: boolean
  onRetry?: () => void
  className?: string
}

const SAVING_DELAY_MS = 700

function timeOf(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function saveDotCopy(state: SaveState, savedAt?: Date | null, live?: boolean): string {
  switch (state) {
    case "saved":
      if (live) return "Saved to the live doc"
      return savedAt ? `Saved · ${timeOf(savedAt)}` : "Saved"
    case "saving":
      return "Saving your changes"
    case "connecting":
      return "Connecting… you're reading the saved copy"
    case "offline":
      return "Offline. Changes are kept and will sync"
    case "failed":
      return "Not saved. Select to try again"
  }
}

export function SaveDot({ state, savedAt, live, onRetry, className }: SaveDotProps) {
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

  const copy = saveDotCopy(shown, savedAt, live)
  const dot = (
    <span
      aria-hidden="true"
      data-save-state={shown}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        shown === "saved" && "bg-camp-moss",
        shown === "saved" && landed.current && "content-save-land",
        shown === "saving" && "content-save-pulse bg-ink-4",
        shown === "connecting" && "ring-[1.5px] ring-inset ring-ink-4",
        shown === "offline" && "ring-[1.5px] ring-inset ring-camp-sun",
        shown === "failed" && "bg-destructive",
      )}
    />
  )

  const label =
    shown === "offline" ? (
      <span className="content-slide-in text-meta font-medium text-camp-sun-ink">Offline</span>
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
