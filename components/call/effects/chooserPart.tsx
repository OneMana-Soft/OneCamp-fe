"use client"

// The effects' chooser (EffectsChooser.tsx: the picker, the backdrops' and
// one's own pictures) as ONE lazy entry that every call surface shares: the
// green room's (GreenRoomEffects) and the call's panel (CallEffectsPanel).
// With it, for a member whose workspace's AI is on, the made background's
// part (madePart.tsx). Both are imported from every call page's first load
// (livekit/callDevices), so each builds once, not a copy in each surface's chunk
// (MAIN RULING, 11 Nov; callBuildsOnceGuard). A surface warms them as it
// mounts, so they are in by the time they open, as when they came with the
// surface; while one comes, its place holds; if it can't come (offline for a
// moment), it says so there, with Try again (the made part's also with its
// Close, as the composer's own frame has), and asks again by itself when
// the browser is back online (lib/lazy/lazyPart). Its frames use the call's
// own buttons (components/livekit/lobbyButtons): no shared core rides with it.

import * as React from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { LOBBY_GHOST, LOBBY_SECONDARY } from "@/components/livekit/lobbyButtons"
import type { ChooserProps } from "./EffectsChooser"
import type { ComposerProps } from "./composerFrame"
import { loadChooser, loadMade } from "@/components/livekit/callDevices"

/** What the chooser, or the made background's part, says when its code couldn't come. */
export const CHOOSER_FAILED = "Backgrounds and sound couldn't load. Check your connection, then try again."
export const MADE_FAILED = "Making a background couldn't load. Check your connection, then try again."

function ChooserLoading() {
  return (
    <div aria-busy="true" data-effects-loading="" className="min-h-[240px]">
      <span role="status" className="sr-only">
        Loading…
      </span>
      <div aria-hidden className="h-32 animate-shimmer rounded-[10px] bg-white/[0.06]" />
    </div>
  )
}

/**
 * In a part's place when its code couldn't come: `says`, and Try again. With `closes` (the accessible name of the
 * part's own close), a Close beside it that puts the part away through the props it was given (the made part's onClose).
 */
function unloaded(says: string, closes?: string) {
  return function Unloaded({ retry, onClose }: { retry: () => void; onClose?: () => void }) {
    return (
      <div data-effects-unloaded="" className="space-y-2.5">
        <p role="alert" className="text-meta text-[#FFB4B8]">
          {says}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={retry} className={LOBBY_SECONDARY}>
            Try again
          </button>
          {closes && onClose ? (
            <button type="button" aria-label={closes} onClick={onClose} className={LOBBY_GHOST}>
              Close
            </button>
          ) : null}
        </div>
      </div>
    )
  }
}

const part = lazyPart<ChooserProps>(() => loadChooser().then((m) => m.default), { placeholder: ChooserLoading, failed: unloaded(CHOOSER_FAILED) })
const made = lazyPart<ComposerProps>(() => loadMade().then((m) => m.default), { placeholder: ChooserLoading, failed: unloaded(MADE_FAILED, "Close making one") })

/** `made`: a scene may be made from words here (a member, the workspace's AI on: PreJoin, VideoConference). */
type ChooserPartProps = Omit<ChooserProps, "Composer"> & { made?: boolean }

function Chooser({ made: canMake = false, ...props }: ChooserPartProps) {
  return <part.Part {...props} Composer={canMake ? made.Part : undefined} />
}

/** The chooser each surface draws; warm(made) brings its code, and the made part's where a member may make one. */
export const chooser = {
  Part: Chooser,
  warm: (canMake = false): Promise<boolean> => {
    if (canMake) void made.warm()
    return part.warm()
  },
}
