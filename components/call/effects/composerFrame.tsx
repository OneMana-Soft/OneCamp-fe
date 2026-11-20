"use client"

// The made background's frame (AiBackground.tsx) and what stands in it for the
// composer. The composer is a lazy chunk of its own that every picker shares
// (EffectsChooser, through lib/lazy/lazyPart): while it loads, its frame holds
// the composer's place at its height (its title, the words' row, the examples,
// its note), says so to a screen reader too, and closes; a chunk that can't
// load says so in the composer's own words, with Try again beside its close.
// A frame that comes where the focused control went takes the focus: focus
// never drops to the page. Only these few lines ride with each picker.
// AI-only, as the composer is. Its buttons, and the composer's (act), are the
// call's own (components/livekit/lobbyButtons): a lazy chunk brings no shared
// Button, which Turbopack would hoist into every first load.

import * as React from "react"
import { X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { LOBBY_GHOST, LOBBY_PRIMARY, LOBBY_SECONDARY } from "@/components/livekit/lobbyButtons"
import type { EffectsFoot } from "./effectsFoot"
import type { sceneFromRecipe } from "@/lib/calls/processors/backdrops"

/** What the composer takes from its picker; what stands in its place takes the same. */
/**
 * `paint`: the model's recipe drawn as a picture, by the chooser's backdrops. The composer imports none of its own:
 * its chunk is asked for from the first load, where nothing has loaded them, so it would carry a copy of its own.
 */
export type ComposerProps = {
  onUse: (picture: Blob) => void | Promise<void>
  onClose: () => void
  paint: (recipe: Parameters<typeof sceneFromRecipe>[0]) => Promise<Blob>
  foot?: EffectsFoot
}

/** Words to start from, while there are none. */
export const EXAMPLES = ["Misty pine forest at dawn", "Warm library with lamps", "Night sky over quiet hills"] as const
/** The composer's plain failure. */
export const FAILED = "Couldn't make one just now. Your background hasn't changed."
export const FRAME = "relative mt-3 space-y-2.5 rounded-[12px] border border-white/[0.08] bg-white/[0.04] p-3"
/** The title's row, clear of the close. */
export const HEAD = "flex min-h-8 items-center pr-12 max-md:min-h-11"
export const TITLE = "text-ui-sm font-medium text-[#EEEEF0]"
export const EXAMPLE =
  "min-h-11 rounded-sm border border-white/[0.08] bg-white/[0.05] px-3 text-meta text-ink-2 hover:bg-white/[0.10] hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand md:min-h-8"
export const NOTE = "Your workspace's model makes it from your words."
/** A composer's button at its size: the call's primary (the brand fill) or its neutral. */
export const act = (tone: "primary" | "neutral", size: string) => cn(tone === "primary" ? LOBBY_PRIMARY : LOBBY_SECONDARY, size)

/** Whether the focus is on the page: the control that held it went (a step, or the frame it was in, gave way). */
export function focusDropped(): boolean {
  const now = document.activeElement
  return !now || now === document.body
}

/** As the frame comes, `to` takes the focus that the frame or step it came in place of held. */
function useTakesDroppedFocus(to: React.RefObject<HTMLElement | null>) {
  React.useLayoutEffect(() => {
    if (focusDropped()) to.current?.focus()
  }, [to])
}

/** The composer's own close, after its words in the tab order. */
export function ComposerClose({ onClose, ref }: { onClose: () => void; ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type="button" aria-label="Close making one" onClick={onClose} className={cn(LOBBY_GHOST, "absolute right-3 top-3 size-8 rounded-lg px-0 text-ink-3 max-md:size-11")}>
      <X className="size-4" />
    </button>
  )
}

/** The composer's place while its chunk loads: it closes (a chunk that hangs), its Close last, as the composer's is. */
export function ComposerLoading({ onClose }: ComposerProps) {
  const close = React.useRef<HTMLButtonElement>(null)
  useTakesDroppedFocus(close)
  return (
    <div data-made-background="" aria-busy="true" className={FRAME}>
      <div className={HEAD}>
        <span className={TITLE}>Describe a background</span>
        <span role="status" className="sr-only">
          Loading…
        </span>
      </div>
      <div aria-hidden className="h-11 animate-shimmer rounded-[10px] bg-white/[0.06] md:h-9" />
      <div aria-hidden className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <span key={example} className={`${EXAMPLE} inline-flex items-center`}>
            {example}
          </span>
        ))}
      </div>
      <p className="text-meta text-ink-3">{NOTE}</p>
      <ComposerClose ref={close} onClose={onClose} />
    </div>
  )
}

/** The composer's chunk couldn't load (offline for a moment): its frame says so, asks again on Try again, and closes. */
export function ComposerUnloaded({ onClose, retry }: ComposerProps & { retry: () => void }) {
  const again = React.useRef<HTMLButtonElement>(null)
  useTakesDroppedFocus(again)
  return (
    <div data-made-background="" className={FRAME}>
      <div className={HEAD}>
        <span className={TITLE}>Describe a background</span>
      </div>
      <p role="alert" className="text-meta text-[#FFB4B8]">
        {FAILED}
      </p>
      <div className="flex">
        <button ref={again} type="button" onClick={retry} className={act("neutral", "h-11 rounded-[10px] md:h-8")}>
          Try again
        </button>
      </div>
      <ComposerClose onClose={onClose} />
    </div>
  )
}
