"use client"

// The effects' chooser (EffectsChooser.tsx: the picker, the backdrops' and
// one's own pictures) as ONE lazy entry that every call surface shares: the
// green room's (GreenRoomEffects) and the call's panel (CallEffectsPanel).
// It is imported from every call page's first load (livekit/callDevices), so
// it builds once, not a copy in each surface's chunk (MAIN RULING, 11 Nov;
// callBuildsOnceGuard). A surface warms it as it mounts, so it is in by the
// time it opens, as when it came with the surface; while it comes, its place
// holds; if it can't come (offline for a moment), it says so there, with Try
// again, and asks again by itself when the browser is back online
// (lib/lazy/lazyPart). Its frames use the call's
// own buttons (components/livekit/lobbyButtons): no shared core rides with it.

import * as React from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { LOBBY_SECONDARY } from "@/components/livekit/lobbyButtons"
import type { ChooserProps } from "./EffectsChooser"
import { loadChooser } from "@/components/livekit/callDevices"

/** What the chooser says when its code couldn't come. */
export const CHOOSER_FAILED = "Backgrounds and sound couldn't load. Check your connection, then try again."

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

/** In the chooser's place when its code couldn't come: `says`, and Try again. */
function unloaded(says: string) {
  return function Unloaded({ retry }: { retry: () => void }) {
    return (
      <div data-effects-unloaded="" className="space-y-2.5">
        <p role="alert" className="text-meta text-[#FFB4B8]">
          {says}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={retry} className={LOBBY_SECONDARY}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}

const part = lazyPart<ChooserProps>(() => loadChooser().then((m) => m.default), { placeholder: ChooserLoading, failed: unloaded(CHOOSER_FAILED) })

/** The chooser each surface draws; warm() brings its code. */
export const chooser = {
  Part: part.Part,
  warm: (): Promise<boolean> => part.warm(),
}
