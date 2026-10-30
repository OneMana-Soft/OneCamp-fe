"use client"

/**
 * Following someone, said on screen (B8, miro-04 4): a ring in their hue
 * round what this person sees, and over it "Following Ann", the Esc key and
 * Stop; and, always there for a screen reader, a polite status that says when
 * following starts and why it stopped. A doc's presence overlay and a board's
 * canvas (components/board/boardHereNow) draw this one piece, each inside its
 * own positioned box.
 */

import * as React from "react"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { collaboratorHue } from "@/lib/identityHue"
import { cn } from "@/lib/utils/helpers/cn"

/** The one followed, as their tab names them in its awareness. */
export interface FollowLeader {
  id?: string
  name?: string
  hue?: string
  kind?: string
}

/** Their hue, as their face and caret wear it: an agent's own, else the identity hue their tab sent or their id gives. */
const hueOf = (leader: FollowLeader) =>
  leader.kind === "agent" ? "[--hue-a1:var(--agent-a1)] [--hue-a2:var(--agent-a2)]" : HUE_CLASS[collaboratorHue({ id: leader.id, name: leader.name, hue: leader.hue })]

/**
 * `leader` is who is followed, or null when no one is. `said` is the status's
 * words. `className` places the label (top centre unless the view has its own
 * bar there).
 */
export function FollowFrame({ leader, said, onStop, className }: { leader: FollowLeader | null; said: string; onStop: () => void; className?: string }) {
  return (
    <>
      {leader && (
        <div className={cn("pointer-events-none absolute inset-0 z-[15] ring-2 ring-inset ring-[var(--hue-a1)]", hueOf(leader))} data-following="">
          <div
            className={cn(
              "content-float pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-[var(--hue-a2)] py-1 pl-2.5 pr-1 text-meta font-medium text-white shadow-e3",
              className,
            )}
          >
            <span>Following {leader.name || "them"}</span>
            <kbd className="rounded-xs bg-white/[0.18] px-1 font-sans text-micro">Esc</kbd>
            <button
              type="button"
              onClick={onStop}
              className="rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            >
              Stop
            </button>
          </div>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  )
}
